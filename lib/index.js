/**
 * dsh-superagent-panel —— host 半。
 *
 * 给 client 面板提供同源 HTTP 接口与一个同源反向代理（挂在本进程的 webServer 上）：
 *   GET  <prefix>/status?id=<实例>  → 运行 scripts/dsh-superagent.mjs status，返回该实例的
 *                                     退出码 + JSON 状态 + 面板 URL；响应里的 instances 是实例清单
 *   POST <prefix>/action            → { action: 'start' | 'stop' | 'restart', id: '<实例>' }
 *   *    <proxy>/<实例>/*           → 反向代理到该实例的 dsh-superagent 服务，
 *                                     供 iframe 在 dsh-app:// 同源路径下加载完整面板。
 *
 * 配置里给 `instances` 数组可同时管理多个实例（各自 id / repo / profile / url / autoStart）；
 * 没有 `instances` 时退回原来的单实例 `repo` / `profile` / `url`，内部视为 id=default，
 * 并保留旧的 `<proxy>/*` 路径。
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
  /** DSH NEXT 启动时，若服务未运行则自动拉起一次（跳过手动 stop 留下的状态）。 */
  autoStart: false,
  /** 等 DSH NEXT 自身就绪后再拉起，避免和宿主启动抢资源。 */
  autoStartDelayMs: 8_000,
}

const PREFIX = '/@dsh-superagent-panel/api'
const PROXY = '/@dsh-superagent-panel/proxy'
const HEADER = 'x-dsh-superagent-panel'
const ACTION_TIMEOUT = { status: 30_000, start: 180_000, stop: 360_000, restart: 420_000 }

const trimUrl = value => String(value || '').replace(/\/+$/, '') || 'http://127.0.0.1:3082'
const safeDecode = value => {
  try { return decodeURIComponent(value) } catch { return value }
}

/**
 * 把配置归一化成内部实例表。
 * - 没有 `instances`（或空数组）→ 单实例，id=default，沿用顶层 repo/profile/url/autoStart；
 * - 有 `instances` → 每项缺省的 repo/profile/url/autoStart 回落到顶层配置；
 * - id 去重、缺省补全，保证接口和代理路径里每个实例都能唯一解析。
 */
function normalizeInstances(settings) {
  const fallback = {
    repo: settings.repo,
    profile: settings.profile,
    url: trimUrl(settings.url),
    autoStart: settings.autoStart === true,
  }
  const raw = Array.isArray(settings.instances) ? settings.instances : []
  if (raw.length === 0) return [{ id: 'default', label: 'default', ...fallback }]

  const used = new Set()
  const list = []
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (!item || typeof item !== 'object') continue
    let id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id) id = 'instance-' + (index + 1)
    // 重复 id 依次加后缀，直到真正唯一（显式的 a-2 也不会和自动后缀撞车）。
    const baseId = id
    let suffix = 1
    while (used.has(id)) {
      suffix += 1
      id = baseId + '-' + suffix
    }
    used.add(id)
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : id
    list.push({
      id,
      label,
      repo: typeof item.repo === 'string' && item.repo ? item.repo : fallback.repo,
      profile: typeof item.profile === 'string' && item.profile ? item.profile : fallback.profile,
      url: trimUrl(typeof item.url === 'string' && item.url ? item.url : fallback.url),
      autoStart: item.autoStart === undefined ? fallback.autoStart : item.autoStart === true,
    })
  }
  // 全是非法条目时仍保持可用：退回单实例默认值。
  return list.length > 0 ? list : [{ id: 'default', label: 'default', ...fallback }]
}

/** 客户端只需要 id + label；不把本机 URL / 路径带到页面上。 */
const instanceMeta = instances => instances.map(({ id, label }) => ({ id, label }))

/** 没给 id 时：单实例直接用它；多实例优先 default，其次第一个（兼容 0.1.x 客户端）。 */
function resolveInstance(instances, rawId) {
  const id = rawId == null ? '' : String(rawId)
  if (id) return instances.find(item => item.id === id) ?? null
  if (instances.length === 1) return instances[0]
  return instances.find(item => item.id === 'default') ?? instances[0]
}

function runLauncher(instance, args, timeoutMs) {
  return new Promise(resolve => {
    const script = join(instance.repo, 'scripts', 'dsh-superagent.mjs')
    if (!existsSync(script)) {
      resolve({ code: 1, stdout: '', stderr: `launcher not found: ${script}` })
      return
    }
    execFile(process.execPath, [script, ...args], {
      cwd: instance.repo, timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

/** 读该实例 profile 最新日志里的面板 URL（每次重启 token 会变）。 */
function panelUrlOf(instance) {
  const dir = join(instance.repo, '.artifacts')
  try {
    const logs = readdirSync(dir)
      .filter(n => n.startsWith(`dsh-superagent-${instance.profile}-`) && n.endsWith('.log'))
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

/** 直接问实例的 state，拿主 Session id（launcher status 的输出里没有 masterId）。 */
async function serviceState(instance) {
  try {
    const response = await fetch(instance.url.replace(/\/+$/, '') + '/orchestrator/api/state', {
      headers: { 'x-orchestrator-request': '1' },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    const value = await response.json()
    return { masterId: value.masterId ?? null, paused: value.paused === true, load: value.load ?? null }
  } catch { return null }
}

async function statusPayload(instance, instances) {
  const result = await runLauncher(instance, ['status', '--profile', instance.profile, '--url', instance.url], ACTION_TIMEOUT.status)
  let status = null
  try { status = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))) } catch { /* 保留下面的空状态 */ }
  const service = await serviceState(instance)
  return {
    id: instance.id,
    label: instance.label,
    instances: instanceMeta(instances),
    exitCode: result.code,
    status,
    panelUrl: panelUrlOf(instance),
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

// ---- 同源反向代理：把实例的 Superagent 页面搬到 dsh-app://app 同源路径下，供同源 iframe 内嵌 ----
/** 上游 cookie 缓存（按实例隔离）：用该实例最新日志里的 token URL 换一次；过期或 401 时重换。 */
const proxyCookies = new Map()
// 剥掉逐跳头与"浏览器跨站"头：Superagent 的 API 明确拒绝"Origin 来自其他站点"的请求（403），
// 而这些请求是从 dsh-app:// 同源 iframe 发出的，Origin 必须由代理丢弃。
const HOP_HEADERS = ['host', 'cookie', 'connection', 'keep-alive', 'upgrade', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'accept-encoding',
  'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user', 'x-dsh-desktop-renderer']

async function upstreamCookie(instance, force) {
  const key = instance.id + '|' + instance.url
  const cached = proxyCookies.get(key)
  if (!force && cached && cached.value && Date.now() - cached.at < 20_000) return cached.value
  const tokenUrl = panelUrlOf(instance)
  if (!tokenUrl) return ''
  try {
    const response = await fetch(tokenUrl, { redirect: 'manual' })
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : []
    const value = cookies.map(c => c.split(';')[0]).join('; ')
    proxyCookies.set(key, { value, at: Date.now() })
    return value
  } catch {
    proxyCookies.delete(key)
    return ''
  }
}

function upstreamTarget(instance) {
  try {
    const url = new URL(instance.url)
    return { host: url.hostname, port: Number(url.port || 80) }
  } catch { return { host: '127.0.0.1', port: 3082 } }
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

/**
 * 解析代理路径：
 *   <proxy>/<id>/<rest>  → 该实例，上游 /<rest>
 *   <proxy>/<rest>       → 单实例配置时映射到唯一实例（0.1.x 兼容路径）
 * 多实例下第一条路径段不是已知 id 时返回 null，由调用方 404，避免把请求转错实例。
 */
function proxyRoute(instances, rawUrl) {
  const raw = String(rawUrl ?? '')
  const path = raw.split('?')[0]
  const query = raw.slice(path.length)
  const rest = path.startsWith(PROXY + '/') ? path.slice(PROXY.length + 1) : ''
  const slash = rest.indexOf('/')
  const first = safeDecode(slash === -1 ? rest : rest.slice(0, slash))
  const byId = first ? instances.find(item => item.id === first) : null
  if (byId) {
    return { instance: byId, upstreamPath: '/' + (slash === -1 ? '' : rest.slice(slash + 1)) + query }
  }
  if (instances.length === 1) return { instance: instances[0], upstreamPath: '/' + rest + query }
  return { instance: null, upstreamPath: null }
}

/** 转发一次请求；上游 401 时返回 { retry: true } 让调用方换 cookie 重试（仅用于无 body 的 GET）。 */
function proxyOnce(instance, upstreamPath, req, res, cookie) {
  const target = upstreamTarget(instance)
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
const isLoopback = host => host.startsWith('127.0.0.1') || host.startsWith('localhost') || host.startsWith('[::1]')
/**
 * 管理接口的入口校验：必须带自定义头（跨站请求无法在不触发 CORS 预检的情况下伪造它），
 * 且要么来自回环地址（桌面端/本机 Web），要么是浏览器同源请求（DSH Web 从局域网/远程访问时
 * Host 不是回环地址，但同源请求的 Origin 与 Host 一致；跨站请求的 Origin 不同）。
 */
const localOnly = req => {
  if (req.headers[HEADER] !== '1') return false
  const host = String(req.headers.host ?? '')
  if (isLoopback(host)) return true
  const origin = String(req.headers.origin ?? '')
  if (!origin) return true
  try { return new URL(origin).host === host } catch { return false }
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
  const instances = normalizeInstances(settings)
  /** 同一个实例同一时间只跑一个启停操作；不同实例可以并行。 */
  const busy = new Set()
  const meta = instanceMeta(instances)

  registerRoute(ctx, {
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      // prefix 路由把完整路径给 handler，先剥掉前缀再比对子路由；查询串用于选择实例。
      const url = new URL(String(req.url ?? '/'), 'http://localhost')
      const path = url.pathname
      const sub = path.startsWith(PREFIX) ? (path.slice(PREFIX.length) || '/') : path
      const id = url.searchParams.get('id')
      try {
        if (!localOnly(req)) return json(res, 403, { error: 'local requests only; missing x-dsh-superagent-panel header' })

        if (sub === '/status' && req.method === 'GET') {
          const instance = resolveInstance(instances, id)
          if (!instance) return json(res, 404, { error: 'unknown instance', id, instances: meta })
          return json(res, 200, await statusPayload(instance, instances))
        }

        if (sub === '/action' && req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          let action = ''
          let targetId = id
          try {
            const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            action = String(value.action ?? '')
            if (value.id !== undefined && value.id !== null) targetId = String(value.id)
          } catch { /* 非法 JSON */ }
          if (!['start', 'stop', 'restart'].includes(action)) return json(res, 400, { error: 'action must be start, stop or restart' })
          const instance = resolveInstance(instances, targetId)
          if (!instance) return json(res, 404, { error: 'unknown instance', id: targetId, instances: meta })
          if (busy.has(instance.id)) return json(res, 409, { error: 'another superagent operation is running for this instance', id: instance.id })
          busy.add(instance.id)
          try {
            const result = await runLauncher(instance, [action, '--profile', instance.profile, '--url', instance.url], ACTION_TIMEOUT[action])
            const payload = await statusPayload(instance, instances)
            return json(res, 200, { action, id: instance.id, exitCode: result.code, output: (result.stdout + '\n' + result.stderr).trim().slice(0, 4000), status: payload })
          } finally { busy.delete(instance.id) }
        }

        if (sub === '/diag' && req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 4000)
          try { appendFileSync(join(settings.repo, '.artifacts', 'panel-diag.log'), `${new Date().toISOString()} id=${id ?? '-'} ${text}\n`) } catch { /* 日志失败不影响 */ }
          return json(res, 200, { ok: true })
        }

        return json(res, 404, { error: 'unknown route', url: req.url })
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      } finally {
        logRequest(settings, req, id ? `${sub}?id=${id}` : sub, res.statusCode)
      }
    },
  }, 'dsh-superagent-panel: superagent api')

  // 同源代理：iframe 加载 <origin><PROXY>/<id>/ 即可看到该实例的完整 Superagent 页面。
  registerRoute(ctx, {
    kind: 'prefix',
    path: PROXY,
    handler: async (req, res) => {
      const route = proxyRoute(instances, req.url)
      if (!route.instance) return json(res, 404, { error: 'unknown instance', url: req.url, instances: meta })
      const instance = route.instance
      const cookie = await upstreamCookie(instance, false)
      let result = await proxyOnce(instance, route.upstreamPath, req, res, cookie)
      if (result && result.retry) {
        const fresh = await upstreamCookie(instance, true)
        result = await proxyOnce(instance, route.upstreamPath, req, res, fresh)
      }
      try {
        if (req.url && !String(req.url).includes('/assets/') && !String(req.url).includes('/plugins/')) {
          appendFileSync(join(settings.repo, '.artifacts', 'panel-proxy.log'),
            `${new Date().toISOString()} ${instance.id} ${req.method} ${req.url} -> ${result ? result.status : '?'}\n`)
        }
      } catch { /* 日志失败不影响 */ }
    },
  }, 'dsh-superagent-panel: same-origin proxy')

  // 与 DSH NEXT 同步启动：宿主加载本插件后，对每个 autoStart 的实例分别检查并拉起一次。
  // 手动 stop 会写 manually-stopped 标记，这里尊重它、不再自动拉起。
  const delay = Math.max(1_000, Number(settings.autoStartDelayMs) || 8_000)
  const timers = []
  const autoStartInstances = instances.filter(instance => instance.autoStart)
  if (autoStartInstances.length > 0) {
    // 插件 fiber 释放（热重载/卸载）时取消尚未触发的自动启动。
    ctx.effect(() => () => { for (const timer of timers) clearTimeout(timer) }, 'dsh-superagent-panel: autoStart timers')
    for (const instance of autoStartInstances) {
      const timer = setTimeout(async () => {
        try {
          const payload = await statusPayload(instance, instances)
          // 启动器退出码：0 运行中 / 1 未运行 / 2 部件报错（仍在运行）/ 3 等待 setup（仍在运行）。
          // 只有 1 才需要拉起；2 和 3 重启只会打扰正在运行中的服务。
          if (payload.exitCode !== 1) return
          if (payload.status && payload.status.manually_stopped === true) {
            ctx.logger?.info?.(`dsh-superagent-panel: autoStart skipped for ${instance.id} (manually stopped)`)
            return
          }
          ctx.logger?.info?.(`dsh-superagent-panel: autoStart starting ${instance.id} (profile ${instance.profile})`)
          const result = await runLauncher(instance, ['start', '--profile', instance.profile, '--url', instance.url], ACTION_TIMEOUT.start)
          ctx.logger?.[result.code === 0 ? 'info' : 'warn']?.(`dsh-superagent-panel: autoStart ${instance.id} finished with exit ${result.code}`)
        } catch (error) {
          ctx.logger?.warn?.(`dsh-superagent-panel: autoStart ${instance.id} failed: ` + (error instanceof Error ? error.message : String(error)))
        }
      }, delay)
      timer.unref?.()
      timers.push(timer)
    }
  }
}
