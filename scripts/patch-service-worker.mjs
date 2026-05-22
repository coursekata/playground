/**
 * Patches the generated service-worker.js to stop intercepting cross-origin
 * requests. JupyterLite's default SW intercepts all external GET requests and
 * re-fetches them (returning an opaque response). This causes intermittent
 * failures for cross-origin resources like images embedded in markdown cells,
 * because browsers have known edge-case issues rendering images from opaque
 * SW responses. Skipping cross-origin requests lets the browser handle them
 * directly, which is both more correct and more reliable.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../dist/service-worker.js');

let sw = readFileSync(swPath, 'utf8');

const original = 'function shouldDrop(e,t){return"GET"!==e.method||null===t.origin.match(/^http/)||t.pathname.includes("/api/")}';
const patched  = 'function shouldDrop(e,t){return"GET"!==e.method||null===t.origin.match(/^http/)||t.pathname.includes("/api/")||t.origin!==location.origin}';

if (!sw.includes(original)) {
  console.warn('[patch-service-worker] Pattern not found — SW may have changed. Skipping patch.');
  process.exit(0);
}

sw = sw.replace(original, patched);
writeFileSync(swPath, sw, 'utf8');
console.log('[patch-service-worker] Patched shouldDrop to skip cross-origin requests.');
