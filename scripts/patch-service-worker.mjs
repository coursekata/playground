/**
 * Patches the generated service-worker.js with two fixes for reliable
 * cross-origin resource (e.g. image) loading in markdown cells:
 *
 * 1. shouldDrop — skip cross-origin requests so the SW never intercepts
 *    external fetches. The default SW re-fetches them and returns opaque
 *    responses; under COEP browsers block images served that way.
 *
 * 2. withCOIHeaders + credentialless COEP — inject Cross-Origin-Opener-Policy
 *    and Cross-Origin-Embedder-Policy: credentialless on same-origin responses
 *    so kernels can use SharedArrayBuffer, while still allowing cross-origin
 *    images to load without requiring CORP headers from the image server.
 *    (require-corp would block any cross-origin image whose server doesn't
 *    send an explicit CORP header, e.g. AWS S3 public buckets.)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = resolve(__dirname, '../dist/service-worker.js');

let sw = readFileSync(swPath, 'utf8');
let changed = false;

// ── Patch 1: shouldDrop ──────────────────────────────────────────────────────
const dropOriginal = 'function shouldDrop(e,t){return"GET"!==e.method||null===t.origin.match(/^http/)||t.pathname.includes("/api/")}';
const dropPatched  = 'function shouldDrop(e,t){return"GET"!==e.method||null===t.origin.match(/^http/)||t.pathname.includes("/api/")||t.origin!==location.origin}';

if (sw.includes(dropOriginal)) {
  sw = sw.replace(dropOriginal, dropPatched);
  console.log('[patch-service-worker] Patched shouldDrop to skip cross-origin requests.');
  changed = true;
} else if (!sw.includes(dropPatched)) {
  console.warn('[patch-service-worker] shouldDrop pattern not found — SW may have changed. Skipping patch 1.');
}

// ── Patch 2: withCOIHeaders (inject if missing) ──────────────────────────────
const withCOIFn = 'async function withCOIHeaders(r){if(!r||r.type==="opaque"||r.type==="error")return r;try{const h=new Headers(r.headers);h.set("Cross-Origin-Opener-Policy","same-origin");h.set("Cross-Origin-Embedder-Policy","credentialless");return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h})}catch(e){return r}}';

const respondOriginal = 'n&&e.respondWith(n)}';
const respondPatched  = `n&&e.respondWith(Promise.resolve(n).then(withCOIHeaders))}${withCOIFn}`;

if (!sw.includes('withCOIHeaders')) {
  if (sw.includes(respondOriginal)) {
    sw = sw.replace(respondOriginal, respondPatched);
    console.log('[patch-service-worker] Injected withCOIHeaders with COEP:credentialless.');
    changed = true;
  } else {
    console.warn('[patch-service-worker] respondWith pattern not found — SW may have changed. Skipping patch 2.');
  }
} else if (sw.includes('require-corp')) {
  // withCOIHeaders already present but uses require-corp — upgrade to credentialless
  sw = sw.replace('"Cross-Origin-Embedder-Policy","require-corp"', '"Cross-Origin-Embedder-Policy","credentialless"');
  console.log('[patch-service-worker] Updated COEP from require-corp to credentialless.');
  changed = true;
}

if (changed) {
  writeFileSync(swPath, sw, 'utf8');
} else {
  console.log('[patch-service-worker] No changes needed.');
}
