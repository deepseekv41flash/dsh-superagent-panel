# Visual evidence for 0.2.0 (multi-instance toolbar)

These captures come from a real `dsh web` host that loaded this plugin through a profile
patch overlay (no mock UI). The host used the dark theme, a 1440×900 viewport and the same
`main` panel page in both runs. Images are cropped to the panel toolbar (1160×56) so the
embedded Superagent panel — which can contain private sessions and repositories — is not
published.

| File | Revision | Scenario |
|---|---|---|
| `before-0.1.4-single-instance.png` | 0.1.4 (`main`) | Single instance: profile `superagent`, `http://127.0.0.1:3082`; no instance switcher |
| `after-0.2.0-two-instances.png` | 0.2.0 (this branch) | `instances`: `superagent` (3082) + `superagent2` (3083); switcher visible, first instance selected |
| `after-0.2.0-second-instance.png` | 0.2.0 (this branch) | Second instance selected after clicking its tab; the iframe `src` changes to `/proxy/superagent2/...` and the choice is stored in `localStorage` |

The 0.2.0 host ran both real services (both reported "运行中"), and the panel's status API
returned each instance's own `masterId` and panel URL. The second-selection run also verified
that the stored instance survives a page reload.
