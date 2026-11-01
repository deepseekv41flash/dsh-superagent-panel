# dsh-superagent-panel

[English](README-en.md) · [简体中文](README.md)

[![npm](https://img.shields.io/npm/v/dsh-superagent-panel.svg)](https://www.npmjs.com/package/dsh-superagent-panel)
[![license](https://img.shields.io/npm/l/dsh-superagent-panel.svg)](./LICENSE)

一个 DSH（DeepSeek Harness）插件：在 **DSH NEXT** 里给 [dsh-superagent](https://github.com/deepseek-ai/dsh-superagent-prototype) 加一个侧栏入口，并把 Superagent **自己的完整管理面板**嵌进同一个窗口。

它解决的是内嵌的最后一段路：DSH NEXT 的页面跑在自定义协议 `dsh-app://app` 下，Chromium **静默拒绝**它嵌入 `http://127.0.0.1:3082`；而就算绕过这一点，DSH 客户端的事件长连接在跨协议代理的源下也建立不起来（页面会一直显示「没有响应 / 重新连接中」）。本插件因此：

1. 在 DSH NEXT 宿主里开一条**同源反向代理**，把 `http://127.0.0.1:3082` 搬到 `dsh-app://app/@dsh-superagent-panel/proxy/…` 下；
2. 代理里剥掉会被服务拒绝的跨站头（`Origin` 等），并用最新日志里的 token URL 换一次上游 cookie；
3. iframe 指向 **Superagent 侧插件 `dsh-superagent-bridge`** 提供的独立面板页（它的 React 应用只走 HTTP 轮询，不依赖 DSH 长连接）；
4. 顺带把 DSH 的主题令牌用 `postMessage` 注入 iframe——同源 iframe 里的独立文档拿不到宿主 CSS 变量。

```text
DSH NEXT (dsh-app://app)
├── sidebar.panellist  entry ──→ main(key=superagent) page
│     ├── toolbar: 实例切换 / 状态 / 打开主 Session / 刷新 / 停止|启动 / 重启 / 新标签
│     ├── iframe  <proxy>/<id>/superagent-bridge/?lang=zh
│     └── postMessage: theme tokens ↑ / open-session ↓
└── host routes
      ├── /@dsh-superagent-panel/api/status?id=   → 运行 scripts/dsh-superagent.mjs status
      ├── /@dsh-superagent-panel/api/action       → start / stop / restart（body 带 id）
      └── /@dsh-superagent-panel/proxy/<id>/*     → 对应实例的 http://127.0.0.1:<port>/*
```

## 前置

| 项 | 说明 |
|---|---|
| DSH 宿主 | 桌面端（DSH NEXT）或 Web 端（`dsh web`）都行；本插件不依赖 Electron，Web 端反而少了跨协议 iframe 的问题 |
| dsh-superagent | 已按原型搭好、服务跑在 profile `superagent`、端口 `3082`（Windows 适配见 [superagent-playground 的补丁](https://github.com/deepseekv41flash/superagent-playground)） |
| 服务侧桥接插件 | `dsh-superagent-bridge` 必须装在**跑服务那个 profile** 里，否则 iframe 没有页面可显示 |

## 安装

```bash
# 1) 装进 DSH NEXT 所在的 profile（profile 名以本机为准，桌面端通常是 desktop）
dsh plugin --profile desktop add dsh-superagent-panel

# 2) 登记到该 profile 的 dsh.profile.bundles（设置页的插件管理器会自动写，命令行需要手动加）
#    "dsh.profile.bundles": [ ..., "dsh-superagent-panel" ]

# 3) 重启 DSH NEXT，侧栏出现 Superagent 图标
```

用注入器做开发态热挂载：

```text
dev_inject_plugin { "dir": "<本仓库路径>" }
```

## 配置

host 半的默认值可以在 profile patch 的插件条目里覆盖，也可以用环境变量。

**单实例**（与 0.1.x 完全一致）：

```yaml
- id: dsh-superagent-panel
  name: dsh-superagent-panel
  config:
    repo: 'D:\work\dsh-superagent-prototype'   # 含 scripts/dsh-superagent.mjs 的 checkout
    profile: superagent                        # 服务运行的 DSH profile
    url: 'http://127.0.0.1:3082'               # 管理 API 源
    autoStart: true
```

**多实例**：给 `instances` 数组即可在同一个 DSH 宿主里并行管理多个实例：

```yaml
- id: dsh-superagent-panel
  name: dsh-superagent-panel
  config:
    autoStartDelayMs: 8000
    instances:
      - id: superagent                     # 实例标识：唯一、用于接口和代理路径
        label: 主实例                       # 工具条上显示的名字，缺省用 id
        repo: 'D:\work\dsh-superagent-prototype'
        profile: superagent
        url: 'http://127.0.0.1:3082'
        autoStart: true
      - id: superagent2
        label: 第二实例
        repo: 'D:\work\dsh-superagent-prototype'
        profile: superagent2
        url: 'http://127.0.0.1:3083'
        autoStart: false                   # 不随宿主自动启动；仍可手动启动
```

| 键 | 默认值 |
|---|---|
| `instances` | 不设置时按单实例运行（`id=default`）；数组中每项支持 `id` / `label` / `repo` / `profile` / `url` / `autoStart` |
| `repo` | `$DSH_SUPERAGENT_REPO`，否则 `<home>/src/dsh-superagent-prototype`；也是 `instances` 中未填项的回退值 |
| `profile` | `superagent`；也是 `instances` 中未填项的回退值 |
| `url` | `http://127.0.0.1:3082`；也是 `instances` 中未填项的回退值 |
| `autoStart` | `false`；设 `true` 后，DSH NEXT 启动并加载本插件时会自动拉起未运行的服务（宿主机重启后与 DSH NEXT 同步启动）；每个实例可用自己的 `autoStart` 覆盖 |
| `autoStartDelayMs` | `8000`，等宿主就绪后再启动（所有实例共用） |

没有 `instances` 时，单实例的接口与 `<proxy>/*` 代理路径和 0.1.4 保持一致；配置多个实例后，
每个实例各自跑自己的 `scripts/dsh-superagent.mjs`，停止其中一个不会影响其它实例。

### 开机后怎么启动

宿主机重启后，服务不会自己启动。三种方式任选：

```bash
# 1) 面板：打开 Superagent → 点「启动」
# 2) 命令：
node scripts/dsh-superagent.mjs start --profile superagent
# 3) 让插件随 DSH NEXT 一起启动（推荐）：
#    在 DSH NEXT 所用 profile 的 cordis.patch.yml 末尾加：
#    - id: dsh-superagent-panel
#      name: dsh-superagent-panel
#      config:
#        autoStart: true
```

`autoStart` 只影响「未运行」的情况：手动 `stop` 过的服务会留下 `manually-stopped` 标记，
插件不会把它自动拉起来；要恢复自动启动，先 `start` 一次（或删掉该标记）。
配置多个实例时，每个实例分别判断（可以只给其中几个实例设 `autoStart: true`）。

## Web 端

同一份插件在 `dsh web` 的宿主里也能用（`dsh.client.platform` 本来就是 `web`）：

- 把本插件装进 **`dsh web` 所用的那个 profile**（`--profile` 参数对应的 profile，默认 `web`）：
  `dsh plugin --profile web add dsh-superagent-panel`，并确认该 profile 的 `dsh.profile.bundles` 里有它；
- 浏览器打开 `dsh web` 打印的地址，侧栏同样出现 Superagent 入口，内嵌面板、主题注入、
  「打开主 Session」、启停/重启、`autoStart` 都照常工作；
- Web 页面的源是 `http(s)://<host>:<port>`，同源代理后的 iframe 天然可用——之前桌面端遇到的
  `dsh-app://` 跨协议拦截不存在；即使 Web 端走 HTTPS，代理在服务端转发到 `http://127.0.0.1:3082`，
  也不会触发混合内容拦截；
- 管理接口的校验允许两种来源：回环地址，或携带同源 `Origin` 的浏览器请求（防止跨站伪造）。

## 界面与行为

- 侧栏图标与「自动化任务」同排（`sidebar.panellist`，order 20），点击切到主面板。
- 工具条：实例切换（只有 1 个实例时隐藏，每项显示 label + 状态徽标）、运行状态徽标、**打开主 Session**（`uiWorkspace.openSession(masterId)`）、刷新、停止/启动、重启、新标签（用 panel token 在新标签打开原面板）。
- 状态轮询、刷新、启停/重启、打开主 Session、iframe 都作用于当前选中的实例；选中的实例记在 `localStorage`，刷新/重开后保持。
- 内嵌面板 = Superagent 原面板的全部内容（概览 / 来源 / 触发 / 评估 / 执行 / 设置，含工单与线程详情页、搜索、术语表）。
- 面板里的「打开主 Session」通过 `postMessage` 回到外层，由 `uiWorkspace.openSession` 真正跳转。
- 主题：外层读取 `--dsw-alias-*` 计算值后 postMessage 给 iframe；桥接页自带深色兜底，注入失败也能看。
- 安全：`/api/*` 只接受本机 Host + `x-dsh-superagent-panel: 1` 头，避免跨站请求误触发起停；代理会剥掉 `Origin`/`Referer`/`Sec-Fetch-*`/`x-dsh-desktop-renderer`。

## 文件结构

```text
dsh-superagent-panel/
├── package.json          # dsh.bundle.patch + dsh.client(platform=web)
├── cordis.patch.yml      # bundle 层：insert id=dsh-superagent-panel
├── lib/index.js          # host 半：按实例的状态/动作接口 + 同源反向代理 + 多实例 autoStart
├── lib/client.js         # client 半：侧栏入口 + 主面板（实例切换、iframe、工具条、主题桥）
└── scripts/check.sh      # 零构建校验：语法 + 导出 + npm 载荷
```

纯 JavaScript，无构建步骤。

## 已验证（2026-11-01，DSH `0.2.1-rc.4` / desktop-next `2.0.21-next`，Windows 11）

| 项 | 结果 |
|---|---|
| 侧栏入口 | 与「自动化任务」同排出现，点击切到主面板 |
| 同源 iframe | `dsh-app://app` 下加载 `<proxy>/superagent-bridge/` 成功；控制台无 error |
| 内嵌面板 | 六个页签、工单详情、线程详情、搜索、术语表全部可用 |
| 主题注入 | `--dsw-alias-*` 由外层 postMessage；失败时深色兜底 |
| 打开主 Session | 面板内按钮 → postMessage → 外层 `uiWorkspace.openSession`，跳到 orchestrator 会话 |
| 启停重启 | 调用 checkout 里的 `scripts/dsh-superagent.mjs`，返回退出码与最新状态 |
| 服务未运行时 | 显示「启动」按钮，不产生白屏 |
| 多实例切换 | 双实例（3082 `superagent` + 3083 `superagent2`）配置下，切换实例后状态与 iframe 各自对应；`/status?id=` 返回各自的 `masterId`；选择写入 `localStorage` |
| 单实例兼容 | 无 `instances` 时行为与 0.1.4 一致：不显示切换器，旧 `<proxy>/*` 路径仍可用 |

**已知限制**：内嵌页的「部署」设置组是只读的——它依赖 DSH Plugin Manager 的 config form 服务，独立页面里不可用（与在 DSH 内直接打开该面板时的表现一致）。

## 配套

- 服务侧：[dsh-superagent-bridge](https://github.com/deepseekv41flash/dsh-superagent-bridge)
- Superagent Windows 适配与踩坑记录：[superagent-playground](https://github.com/deepseekv41flash/superagent-playground)

## 许可

MIT。
