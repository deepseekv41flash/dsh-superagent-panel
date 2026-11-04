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
│     ├── toolbar: instance switch / status / Open main Session / refresh / stop|start / restart / new tab
│     ├── iframe  <proxy>/<id>/superagent-bridge/?lang=en
│     └── postMessage: theme tokens ↑ / open-session ↓
└── host routes
      ├── /@dsh-superagent-panel/api/status?id=   → run scripts/dsh-superagent.mjs status
      ├── /@dsh-superagent-panel/api/action       → start / stop / restart (body carries id)
      └── /@dsh-superagent-panel/proxy/<id>/*     → the instance's http://127.0.0.1:<port>/*
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

Defaults of the host half can be overridden in the profile patch entry or through environment variables.

**Single instance** (exactly the 0.1.x behaviour):

```yaml
- id: dsh-superagent-panel
  name: dsh-superagent-panel
  config:
    repo: 'D:\work\dsh-superagent-prototype'   # checkout holding scripts/dsh-superagent.mjs
    profile: superagent                        # DSH profile the service runs under
    url: 'http://127.0.0.1:3082'               # management API origin
    autoStart: true
```

**Multiple instances**: add an `instances` array to manage several services from one DSH host:

```yaml
- id: dsh-superagent-panel
  name: dsh-superagent-panel
  config:
    autoStartDelayMs: 8000
    instances:
      - id: superagent                     # unique id used by the API and proxy paths
        label: Main instance               # shown in the toolbar; defaults to id
        repo: 'D:\work\dsh-superagent-prototype'
        profile: superagent
        url: 'http://127.0.0.1:3082'
        autoStart: true
      - id: superagent2
        label: Second instance
        repo: 'D:\work\dsh-superagent-prototype'
        profile: superagent2
        url: 'http://127.0.0.1:3083'
        autoStart: false                   # stays manual
```

| Key | Default |
|---|---|
| `instances` | when absent the plugin runs one instance (`id=default`); each item accepts `id` / `label` / `repo` / `profile` / `url` / `autoStart` |
| `repo` | `$DSH_SUPERAGENT_REPO`, else `<home>/src/dsh-superagent-prototype`; also the fallback for missing `instances` fields |
| `profile` | `superagent`; also the fallback for missing `instances` fields |
| `url` | `http://127.0.0.1:3082`; also the fallback for missing `instances` fields |
| `autoStart` | `false`; when `true`, loading this plugin in DSH NEXT starts the service if it is not running (sync start after a host reboot); each instance may override it |
| `autoStartDelayMs` | `8000`, wait for the host to settle first (shared by all instances) |

Without `instances`, the single-instance API and `<proxy>/*` paths stay identical to 0.1.4. With several
instances, each one runs its own `scripts/dsh-superagent.mjs`, so stopping one does not affect the others.

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
With several instances each one is checked separately (only the instances with `autoStart: true` start).

## Host compatibility

| Host | Status |
|---|---|
| DSH NEXT desktop (desktop-next; verified on `2.0.21-next` / DSH `0.2.1-rc.4`) | Works |
| `dsh web` (Web host) | Works (see the next section) |
| Official DeepSeek Harness desktop (e.g. `0.2.1-rc.5`) | client load failure fixed in 0.2.3 (issue #3); real-device confirmation pending |

Notes:

- **Since 0.2.3 the plugin declares no `dsh.client.inject`.** It used to declare
  `@deepseek-ai/dsh-client-ui-slots`, but that package is a slot **library**, not a client plugin
  module, and hosts are not required to bundle it; on a host that does not (e.g. official desktop
  `0.2.1-rc.5`) the client half failed during load/composition and the sidebar entry never appeared.
  The only runtime module the client requires is the baseline `react`; `slots`, `locale` and
  `uiWorkspace` all arrive as Cordis services from the host's core UI.
- **The official desktop manages its profile exclusively through Electron**: `dsh plugin --profile desktop add …`
  is rejected (`profile "desktop" is managed exclusively by the Electron application`), so install by hand:
  1. add `"dsh-superagent-panel": "<version or local path>"` to that profile's `package.json` `dependencies`;
  2. add `"dsh-superagent-panel"` to `dsh.profile.bundles`;
  3. run `pnpm install` in the profile directory (or let the app re-resolve dependencies), then restart the app.
- If it still fails, paste the `client-modules:` error from the DSH log into the issue.

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
- Toolbar: instance switch (hidden with a single instance; each item shows label + status badge), status pill, **Open main Session** (`uiWorkspace.openSession(masterId)`), refresh, stop/start, restart, new tab (opens the original panel with its token URL).
- Status polling, refresh, start/stop/restart, Open main Session and the iframe all follow the selected instance; the selection is stored in `localStorage` and survives reloads.
- The embedded panel is the complete Superagent panel: Overview / Sources / Triggers / Evals / Execution / Settings, including ticket and thread detail pages, search and the glossary.
- "Open main Session" inside the panel posts a message back to the outer page, which calls `uiWorkspace.openSession`.
- Theme: the outer page reads computed `--dsw-alias-*` values and posts them into the iframe; the bridge page ships a dark fallback theme.
- Safety: `/api/*` only accepts a loopback `Host` plus the `x-dsh-superagent-panel: 1` header; the proxy drops `Origin`/`Referer`/`Sec-Fetch-*`/`x-dsh-desktop-renderer`.

## Layout

```text
dsh-superagent-panel/
├── package.json          # dsh.bundle.patch + dsh.client(platform=web)
├── cordis.patch.yml      # bundle layer: insert id=dsh-superagent-panel
├── lib/index.js          # host half: per-instance status/action endpoints + same-origin proxy + multi-instance autoStart
├── lib/client.js         # client half: sidebar entry + main panel (instance switch, iframe, toolbar, theme bridge)
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
| Instance switching | With two instances (3082 `superagent` + 3083 `superagent2`), switching updates the status and iframe per instance; `/status?id=` returns each instance's `masterId`; the choice is stored in `localStorage` |
| Single-instance compatibility | Without `instances` the behaviour matches 0.1.4: no switcher, and the old `<proxy>/*` path still works |

**Known limitation**: the embedded "Deployment" settings group is read-only — it depends on the DSH Plugin Manager config-form service, which the standalone page cannot reach (same behaviour as opening that panel inside DSH).

## Related

- Service side: [dsh-superagent-bridge](https://github.com/deepseekv41flash/dsh-superagent-bridge)
- Windows adaptation notes and pitfalls: [superagent-playground](https://github.com/deepseekv41flash/superagent-playground)

## License

MIT.
