# Changelog

## 0.2.0 — 2026-11-01

- **多实例并行管理**：host 配置新增 `instances: [{ id, label, repo, profile, url, autoStart? }]`，
  一个 DSH 宿主里可同时管理多个 dsh-superagent 实例（各自 profile、端口、stateDir、监听仓库）。
- **向后兼容**：没有 `instances` 时沿用原来的 `repo` / `profile` / `url`，内部视为 `id=default`；
  单实例的接口路径、代理路径与 0.1.4 行为一致。
- 接口按实例区分：`GET <prefix>/status?id=`、`POST <prefix>/action` 的 body 带 `id`；
  同源代理改为 `<proxy>/<id>/*`，单实例配置仍保留旧的 `<proxy>/*`。
- `autoStart` 对每个实例分别生效，各自检查状态并尊重 `manually-stopped` 标记。
- 客户端工具条新增实例切换（只有 1 个实例时隐藏），每项显示 label + 状态徽标；
  状态轮询、刷新、启停/重启、打开主 Session、iframe 都跟随当前实例；选择写入 `localStorage`。
- 文档：中英 README 增加 `instances` 配置示例并说明单实例配置仍有效；`cordis.patch.yml` 注释同步。

## 0.1.4 — 2026-11-01

- **Web 宿主适配**：同一插件可直接装进 `dsh web` 使用的 profile。Web 页面源是普通 `http(s)://`，
  同源代理 iframe 不再有 `dsh-app://` 跨协议拦截；HTTPS 下也由服务端代理转发，无混合内容问题。
- 管理接口校验从「只允许回环 Host」放宽为「自定义头 + 回环地址或同源 `Origin`」，
  使局域网/远程浏览器访问 DSH Web 时状态与启停接口可用，同时仍拒绝跨站伪造。
- README（中英）新增「Web 端 / Web host」一节，前置条件改为「桌面端或 Web 端均可」。

## 0.1.3 — 2026-11-01

- 新增 `autoStart`（默认 `false`）：DSH NEXT 启动并加载本插件后，若服务未运行则自动拉起一次，
  用于宿主机重启后与 DSH NEXT 同步启动。手动 `stop` 留下的 `manually-stopped` 标记会被尊重，不会自动拉起。
- 新增 `autoStartDelayMs`（默认 `8000`）：等宿主自身就绪后再启动服务。
- 自动启动只是调用同一个启动器，与面板「启动」按钮完全等价；失败只记日志、不影响 DSH NEXT。
- 实测：服务停止状态下加载插件，1.5 s 延迟触发；7.1 s 后 `/orchestrator/api/state` 恢复 200。

## 0.1.1 — 2026-11-01

首个发布版本：在 DSH NEXT 里内嵌 dsh-superagent 的完整管理面板。

- **侧栏入口**：`sidebar.panellist`，id `superagent`，order 20（与「自动化任务」同排）。
- **主面板**：工具条（状态徽标 / 打开主 Session / 刷新 / 停止|启动 / 重启 / 新标签）+ 内嵌完整面板。
- **同源反向代理**：`<proxy>/*` → `http://127.0.0.1:3082/*`，剥掉 `Origin`/`Referer`/`Sec-Fetch-*`/`x-dsh-desktop-renderer`，
  用日志里的 token URL 换一次上游 cookie，401 时重换。
- **主题桥**：外层读取 `--dsw-alias-*` 计算值，postMessage 给 iframe；桥接页有深色兜底。
- **打开主 Session**：面板内按钮 postMessage → 外层 `uiWorkspace.openSession(masterId)`。
- **服务管理**：`/api/status` 运行 `scripts/dsh-superagent.mjs status`；`/api/action` 支持 start/stop/restart；
  接口只接受本机 Host + `x-dsh-superagent-panel: 1`。
- **零构建**：纯 JavaScript，`lib/` 即产物。

验证环境：DSH `0.2.1-rc.4` / desktop-next `2.0.21-next`，Windows 11；六个页签、详情页、搜索、术语表、
启停重启与「打开主 Session」均实测通过。

已知限制：内嵌页的「部署」设置组只读（依赖 DSH Plugin Manager 的 config form 服务，独立页面拿不到）。
