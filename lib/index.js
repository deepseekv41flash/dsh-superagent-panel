/**
 * dsh-superagent-panel —— host 半。
 *
 * 给 client 面板提供同源 HTTP 接口与一个同源反向代理（挂在本进程的 webServer 上）：
 *   GET  <prefix>/status  → 运行 scripts/dsh-superagent.mjs status，返回退出码 + JSON 状态 + 面板 URL
 *   POST <prefix>/action  → { action: 'start' | 'stop' | 'restart' }，运行同一个启动器
 *   *    <proxy>/*        → 反向代理到 dsh-superagent 服务（默认 http://127.0.0.1:3082），
 *                          供 iframe 在 dsh-app:// 同源路径下加载完整面板。
 *
 * 管理接口只允许本机来源（Host 头）并带 x-dsh-superagent-panel 标记，避免跨站请求误触发起停。
 */
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, appendFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-superagent-panel'
export const inject = ['webServer']

/** 默认指向本机已搭好的 checkout / profile / 服务端口；可用插件配置或 DSH_SUPERAGENT_REPO 覆盖。 */
const DEFAULTS = {
  repo: process.env.DSH_SUPERAGENT_REPO ?? join(homedir(), 'src', 'dsh-superagent-prototype'),
  profile: 'superagent',
  url: 'http://127.0.0.1:3082',
}

const PREFIX = '/@dsh-superagent-panel/api'
const PROXY = '/@dsh-superagent-panel/proxy'
const HEADER = 'x-dsh-superagent-panel'
const ACTION_TIMEOUT = { status: 30_000, start: 180_000, stop: 360_000, restart: 420_000 }

function runLauncher(config, args, timeoutMs) {
  return new Promise(resolve => {
    const script = join(config.repo, 'scripts', 'dsh-superagent.mjs')
    if (!existsSync(script)) {
      resolve({ code: 1, stdout: '', stderr: `launcher not found: ${script}` })
      return
    }
    execFile(process.execPath, [script, ...args], {
      cwd: config.repo, timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

/** 读该 profile 最新日志里的面板 URL（每次重启 token 会变）。 */
function panelUrlOf(config) {
  const dir = join(config.repo, '.artifacts')
  try {
    const logs = readdirSync(dir)
      .filter(n => n.startsWith(`dsh-superagent-${config.profile}-`) && n.endsWith('.log'))
      .map(n => join(dir, n))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    for (const log of logs) {
      const text = readFileSync(log, 'utf8')
      const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/.exec(text)
      if (match) return match[1]
    }
  } catch { /* 还没启动过 */ }
  return null
}

/** 直接问 3082 的 state，拿主 Session id（launcher status 的输出里没有 masterId）。 */
async function serviceState(config) {
  try {
    const response = await fetch(config.url.replace(/\/+$/, '') + '/orchestrator/api/state', {
      headers: { 'x-orchestrator-request': '1' },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    const value = await response.json()
    return { masterId: value.masterId ?? null, paused: value.paused === true, load: value.load ?? null }
  } catch { return null }
}

async function statusPayload(config) {
  const result = await runLauncher(config, ['status', '--profile', config.profile, '--url', config.url], ACTION_TIMEOUT.status)
  let status = null
  try { status = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))) } catch { /* 保留下面的空状态 */ }
  const service = await serviceState(config)
  return {
    exitCode: result.code,
    status,
    panelUrl: panelUrlOf(config),
    masterId: service?.masterId ?? null,
    paused: service?.paused ?? null,
    load: service?.load ?? null,
    stderr: result.stderr.trim() || undefined,
    at: new Date().toISOString(),
  }
}

const json = (res, code, value) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

// ---- 同源反向代理：把 3082 的 Superagent 页面搬到 dsh-app://app 同源路径下，供同源 iframe 内嵌 ----
/** 上游 cookie 缓存：用最新日志里的 token URL 换一次；过期或 401 时重换。 */
let proxyCookie = { value: '', at: 0 }
// 剥掉逐跳头与"浏览器跨站"头：3082 的 API 明确拒绝"Origin 来自其他站点"的请求（403），
// 而这些请求是从 dsh-app:// 同源 iframe 发出的，Origin 必须由代理丢弃。
const HOP_HEADERS = ['host', 'cookie', 'connection', 'keep-alive', 'upgrade', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'accept-encoding',
  'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user', 'x-dsh-desktop-renderer']

async function upstreamCookie(settings, force) {
  if (!force && proxyCookie.value && Date.now() - proxyCookie.at < 20_000) return proxyCookie.value
  const tokenUrl = panelUrlOf(settings)
  if (!tokenUrl) return ''
  try {
    const response = await fetch(tokenUrl, { redirect: 'manual' })
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
    proxyCookie = { value: cookies.map(c => c.split(';')[0]).join('; '), at: Date.now() }
  } catch { proxyCookie = { value: '', at: 0 } }
  return proxyCookie.value
}

function upstreamTarget(settings) {
  try { const url = new URL(settings.url); return { host: url.hostname, port: Number(url.port || 80) } } catch { return { host: '127.0.0.1', port: 3082 } }
}

function stripHeaders(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (HOP_HEADERS.includes(lower) || lower === 'set-cookie') continue
    if (value !== undefined) out[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

/** 转发一次请求；上游 401 时返回 { retry: true } 让调用方换 cookie 重试（仅用于无 body 的 GET）。 */
function proxyOnce(settings, req, res, cookie) {
  const target = upstreamTarget(settings)
  const upstreamPath = String(req.url ?? '').slice(PROXY.length) || '/'
  const headers = stripHeaders(req.headers)
  if (cookie) headers.cookie = cookie
  return new Promise(resolve => {
    const upstream = httpRequest({ host: target.host, port: target.port, path: upstreamPath, method: req.method, headers }, up => {
      const status = up.statusCode ?? 502
      if (status === 401 && req.method === 'GET') { up.resume(); resolve({ retry: true }); return }
      res.writeHead(status, stripHeaders(up.headers))
      up.pipe(res)
      resolve({ status })
    })
    upstream.on('error', () => { try { res.destroy() } catch { /* gone */ } resolve({ status: 0 }) })
    req.pipe(upstream)
  })
}
const localOnly = req => {
  const host = String(req.headers.host ?? '')
  return (host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]')) && req.headers[HEADER] === '1'
}
/** 只记最近请求，便于在桌面端 browserAccess=false 时确认渲染器请求是否真的到达（上限 200 KB）。 */
const logRequest = (config, req, sub, code) => {
  try {
    const file = join(config.repo, '.artifacts', 'panel-api.log')
    if (existsSync(file) && statSync(file).size > 200_000) return
    appendFileSync(file, `${new Date().toISOString()} ${req.method} ${sub} -> ${code}\n`)
  } catch { /* 日志失败不影响请求 */ }
}

/** 注册路由：dev 热重载时旧 fiber 可能尚未释放同名路由，短暂重试避免 duplicate 直接失败。 */
function registerRoute(ctx, route, owner) {
  ctx.effect(() => {
    let disposer = null
    let tries = 0
    const install = () => {
      try { disposer = ctx.webServer.register(route) }
      catch (error) {
        if (++tries > 15) { ctx.logger?.warn?.('%s: route registration failed: %s', owner, String(error)); return }
        setTimeout(install, 200)
      }
    }
    install()
    return () => { try { disposer?.() } catch { /* gone */ } }
  }, owner)
}

export function apply(ctx, config) {
  const settings = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  let busy = false

  registerRoute(ctx, {
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      // prefix 路由把完整路径给 handler，先剥掉前缀再比对子路由。
      const path = String(req.url ?? '').split('?')[0]
      const sub = path.startsWith(PREFIX) ? (path.slice(PREFIX.length) || '/') : path
      try {
        if (!localOnly(req)) return json(res, 403, { error: 'local requests only; missing x-dsh-superagent-panel header' })

        if (sub === '/status' && req.method === 'GET') return json(res, 200, await statusPayload(settings))

        if (sub === '/action' && req.method === 'POST') {
          if (busy) return json(res, 409, { error: 'another superagent operation is running' })
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          let action = ''
          try { action = String(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').action ?? '') } catch { /* 非法 JSON */ }
          if (!['start', 'stop', 'restart'].includes(action)) return json(res, 400, { error: 'action must be start, stop or restart' })
          busy = true
          try {
            const result = await runLauncher(settings, [action, '--profile', settings.profile, '--url', settings.url], ACTION_TIMEOUT[action])
            const payload = await statusPayload(settings)
            return json(res, 200, { action, exitCode: result.code, output: (result.stdout + '\n' + result.stderr).trim().slice(0, 4000), status: payload })
          } finally { busy = false }
        }

        if (sub === '/diag' && req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 4000)
          try { appendFileSync(join(settings.repo, '.artifacts', 'panel-diag.log'), `${new Date().toISOString()} ${text}\n`) } catch { /* 日志失败不影响 */ }
          return json(res, 200, { ok: true })
        }

        return json(res, 404, { error: 'unknown route', url: req.url })
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      } finally {
        logRequest(settings, req, sub, res.statusCode)
      }
    },
  }, 'dsh-superagent-panel: superagent api')

  // 同源代理：iframe 加载 <origin><PROXY>/ 即可看到 3082 的完整 Superagent 页面。
  registerRoute(ctx, {
    kind: 'prefix',
    path: PROXY,
    handler: async (req, res) => {
      const cookie = await upstreamCookie(settings, false)
      const result = await proxyOnce(settings, req, res, cookie)
      if (result && result.retry) {
        const fresh = await upstreamCookie(settings, true)
        await proxyOnce(settings, req, res, fresh)
      }
      try {
        if (req.url && !String(req.url).includes('/assets/') && !String(req.url).includes('/plugins/')) {
          appendFileSync(join(settings.repo, '.artifacts', 'panel-proxy.log'),
            `${new Date().toISOString()} ${req.method} ${req.url} -> ${result ? result.status : '?'}\n`)
        }
      } catch { /* 日志失败不影响 */ }
    },
  }, 'dsh-superagent-panel: same-origin proxy')
}
