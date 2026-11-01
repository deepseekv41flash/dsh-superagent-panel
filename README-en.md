# dsh-superagent-panel

[English](README-en.md) · [简体中文](README.md)

[![npm](https://img.shields.io/npm/v/dsh-superagent-panel.svg)](https://www.npmjs.com/package/dsh-superagent-panel)
[![license](https://img.shields.io/npm/l/dsh-superagent-panel.svg)](./LICENSE)

A DeepSeek Harness (DSH) plugin that puts a **sidebar entry for [dsh-superagent](https://github.com/deepseek-ai/dsh-superagent-prototype)** into DSH NEXT and embeds Superagent's **own full management panel** in the same window.

It closes the last gap in embedding: the DSH NEXT page runs on the custom protocol `dsh-app://app`, and Chromium **silently refuses** to frame `http://127.0.0.1:3082` from it. Even when that is worked around, the DSH client event connection cannot attach under a cross-scheme proxied origin, so the page would keep saying "not responding / reconnecting". This plugin therefore:

1. opens a **same-origin reverse proxy** inside the DSH NEXT host, mapping `http://127.0.0.1:3082` under `dsh-app://app/@dsh-superagent-panel/proxy/…`;
2. strips the cross-site headers the service rejects (`Origin` etc.) and exchanges the latest tokenized log URL for one upstream cookie;
3. points the iframe at the standalone panel page served by the **service-side plugin `dsh-superagent-bridge`** (its React app only polls over plain HTTP, no DSH event connection);
4. forwards the host's `--dsw-alias-*` theme tokens into the iframe with `postMessage`, because a same-origin iframe document does not inherit the host's CSS variables.

```text
DSH NEXT (dsh-app://app)
├── sidebar.panellist  entry ──→ main(key=superagent) page
│     ├── toolbar: status / Open main Session / refresh / stop|start / restart / new tab
│     ├── iframe  <proxy>/superagent-bridge/?lang=en
│     └── postMessage: theme tokens ↑ / open-session ↓
└── host routes
      ├── /@dsh-superagent-panel/api/status   → run scripts/dsh-superagent.mjs status
      ├── /@dsh-superagent-panel/api/action   → start / stop / restart
      └── /@dsh-superagent-panel/proxy/*      → http://127.0.0.1:3082/*
```

## Prerequisites

| Item | Notes |
|---|---|
| DSH host | Desktop (DSH NEXT) or Web (`dsh web`) both work; the plugin does not depend on Electron, and the Web host avoids the cross-scheme iframe issue entirely |
| dsh-superagent | Set up from the prototype, service running under profile `superagent` on port `3082` (Windows adaptation patches: [superagent-playground](https://github.com/deepseekv41flash/superagent-playground)) |
| Service-side bridge | `dsh-superagent-bridge` must be installed in the **profile that runs the service**, otherwise the iframe has no page to show |

## Install

```bash
# 1) install into the profile DSH NEXT runs with (desktop is the usual one)
dsh plugin --profile desktop add dsh-superagent-panel

# 2) register it in that profile's dsh.profile.bundles (the plugin manager UI does both; the CLI needs this step)
#    "dsh.profile.bundles": [ ..., "dsh-superagent-panel" ]

# 3) restart DSH NEXT; the Superagent icon appears in the sidebar
```

Development hot-mount through the injector:

```text
dev_inject_plugin { "dir": "<path to this repository>" }
```

## Configuration

Defaults of the host half can be overridden in the profile patch entry or through environment variables:

```yaml
- id: dsh-superagent-panel
  name: dsh-superagent-panel
  config:
    repo: 'D:\work\dsh-superagent-prototype'   # checkout holding scripts/dsh-superagent.mjs
    profile: superagent                        # DSH profile the service runs under
    url: 'http://127.0.0.1:3082'               # management API origin
```

| Key | Default |
|---|---|
| `repo` | `$DSH_SUPERAGENT_REPO`, else `<home>/src/dsh-superagent-prototype` |
| `profile` | `superagent` |
| `url` | `http://127.0.0.1:3082` |
| `autoStart` | `false`; when `true`, loading this plugin in DSH NEXT starts the service if it is not running (sync start after a host reboot) |
| `autoStartDelayMs` | `8000`, wait for the host to settle first |

### Starting after a host reboot

The service does not start by itself after a reboot. Three options:

```bash
# 1) panel: open Superagent → press Start
# 2) command line:
node scripts/dsh-superagent.mjs start --profile superagent
# 3) let the plugin start it together with DSH NEXT (recommended):
#    append to the cordis.patch.yml of the profile DSH NEXT runs with:
#    - id: dsh-superagent-panel
#      name: dsh-superagent-panel
#      config:
#        autoStart: true
```

`autoStart` only covers the "not running" case: a service stopped on purpose keeps a `manually-stopped`
marker and is not started automatically; run `start` once (or delete the marker) to re-enable it.

## Web host

The same plugin works in a `dsh web` host (`dsh.client.platform` is `web` by design):

- install it into the **profile that `dsh web` runs** (the profile named by `--profile`, `web` by default):
  `dsh plugin --profile web add dsh-superagent-panel`, and make sure that profile lists it in
  `dsh.profile.bundles`;
- open the URL `dsh web` prints: the Superagent sidebar entry, the embedded panel, theme injection,
  "Open main Session", start/stop/restart and `autoStart` all behave the same;
- the Web page origin is `http(s)://<host>:<port>`, so the same-origin proxied iframe just works — the
  `dsh-app://` cross-scheme block does not exist here; even over HTTPS the proxy forwards to
  `http://127.0.0.1:3082` on the server side, so there is no mixed-content block;
- the management endpoints accept either loopback requests or browser requests whose `Origin` matches
  the request `Host` (cross-site forgery is still rejected).

## Behaviour

- Sidebar icon sits with the other main-panel icons (`sidebar.panellist`, order 20) and switches to the main panel.
- Toolbar: status pill, **Open main Session** (`uiWorkspace.openSession(masterId)`), refresh, stop/start, restart, new tab (opens the original panel with its token URL).
- The embedded panel is the complete Superagent panel: Overview / Sources / Triggers / Evals / Execution / Settings, including ticket and thread detail pages, search and the glossary.
- "Open main Session" inside the panel posts a message back to the outer page, which calls `uiWorkspace.openSession`.
- Theme: the outer page reads computed `--dsw-alias-*` values and posts them into the iframe; the bridge page ships a dark fallback theme.
- Safety: `/api/*` only accepts a loopback `Host` plus the `x-dsh-superagent-panel: 1` header; the proxy drops `Origin`/`Referer`/`Sec-Fetch-*`/`x-dsh-desktop-renderer`.

## Layout

```text
dsh-superagent-panel/
├── package.json          # dsh.bundle.patch + dsh.client(platform=web)
├── cordis.patch.yml      # bundle layer: insert id=dsh-superagent-panel
├── lib/index.js          # host half: status/action endpoints + same-origin reverse proxy
├── lib/client.js         # client half: sidebar entry + main panel (iframe, toolbar, theme bridge)
└── scripts/check.sh      # build-free validation: syntax, exports, npm payload
```

Plain JavaScript, no build step.

## Verified (2026-11-01, DSH `0.2.1-rc.4` / desktop-next `2.0.21-next`, Windows 11)

| Item | Result |
|---|---|
| Sidebar entry | Rendered next to the other panel icons; click switches to the panel |
| Same-origin iframe | Loads `<proxy>/superagent-bridge/` under `dsh-app://app`; no console errors |
| Embedded panel | All six tabs, ticket detail, thread detail, search and glossary work |
| Theme injection | `--dsw-alias-*` arrive over postMessage; dark fallback otherwise |
| Open main Session | Button → postMessage → outer `uiWorkspace.openSession` navigates to the orchestrator Session |
| Start/stop/restart | Invokes `scripts/dsh-superagent.mjs` from the checkout and returns the exit code plus fresh status |
| Service stopped | Shows a Start button instead of a blank frame |

**Known limitation**: the embedded "Deployment" settings group is read-only — it depends on the DSH Plugin Manager config-form service, which the standalone page cannot reach (same behaviour as opening that panel inside DSH).

## Related

- Service side: [dsh-superagent-bridge](https://github.com/deepseekv41flash/dsh-superagent-bridge)
- Windows adaptation notes and pitfalls: [superagent-playground](https://github.com/deepseekv41flash/superagent-playground)

## License

MIT.
