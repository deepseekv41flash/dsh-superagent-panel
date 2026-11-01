# Changelog

## 0.1.2 — 2026-11-01

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
