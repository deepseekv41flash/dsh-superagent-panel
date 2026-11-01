#!/bin/bash
# dsh-superagent-panel ships no build step: lib/ is both the source and the runtime
# artifact. This script validates the two halves and the npm payload.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

node --check lib/index.js
node --check lib/client.js

node --input-type=module -e "
const m = await import('./lib/index.js')
if (m.name !== 'dsh-superagent-panel') throw new Error('unexpected name export: ' + m.name)
if (!Array.isArray(m.inject) || !m.inject.includes('webServer')) throw new Error('inject must declare webServer')
if (typeof m.apply !== 'function') throw new Error('apply export missing')
console.log('dsh-superagent-panel: lib/index.js OK — name=' + m.name)
"

node --input-type=module -e "
import { readFileSync } from 'node:fs'
const source = readFileSync('lib/client.js', 'utf8')
if (!source.includes('window.__ModuleLoader__.load({')) throw new Error('client half must be a DSH ModuleLoader module')
if (!source.includes(\"id: 'dsh-superagent-panel'\")) throw new Error('client ModuleLoader id must match the package name')
console.log('dsh-superagent-panel: lib/client.js OK')
"

npm pack --dry-run >/dev/null
echo 'dsh-superagent-panel: npm package payload OK'
