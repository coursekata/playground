#!/usr/bin/env node
/*
 * Generates the static "Notebook library notices" page for the WebAssembly
 * kernels (R + Python), which the in-app JupyterLab Licenses panel does not
 * cover. Source of truth: lite/kernel-license-map.json + lite/license-texts/*.
 *
 * The set of R packages is cross-checked against lite/xeus-environment.yml so
 * that adding a package to the kernel without recording its license fails the
 * build loudly instead of silently shipping an unattributed dependency.
 *
 * Usage: node scripts/generate-licenses.mjs [outDir]   (default: dist/licenses)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, process.argv[2] || 'dist/licenses');
const mapPath = join(root, 'lite', 'kernel-license-map.json');
const envPath = join(root, 'lite', 'xeus-environment.yml');

const escape = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const map = JSON.parse(readFileSync(mapPath, 'utf8'));

// --- Cross-check the R packages declared in the kernel environment ----------
const declared = new Set(map.groups.flatMap(g => g.components.map(c => c.package)));
if (existsSync(envPath)) {
  const envPkgs = [];
  let inDependencies = false;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (/^\S/.test(line)) {
      // A new top-level key (no indentation) ends the dependencies block.
      inDependencies = /^dependencies\s*:/.test(line);
      continue;
    }
    if (!inDependencies) {
      continue;
    }
    const m = line.match(/^\s*-\s*([a-zA-Z0-9._-]+)/);
    if (m) {
      envPkgs.push(m[1]);
    }
  }
  const missing = envPkgs.filter(p => !declared.has(p));
  if (missing.length) {
    console.error(
      `\n[generate-licenses] ERROR: kernel package(s) in xeus-environment.yml have no license entry in lite/kernel-license-map.json:\n  - ${missing.join('\n  - ')}\n`
    );
    process.exit(1);
  }
}

// --- Collect the distinct full license texts we need to reproduce -----------
const usedTexts = new Set();
for (const group of map.groups) {
  for (const component of group.components) {
    for (const id of component.texts || []) {
      usedTexts.add(id);
    }
  }
}

const licenseTextSections = [...usedTexts]
  .sort()
  .map(id => {
    const rel = map.licenseTexts[id];
    if (!rel) {
      console.warn(`[generate-licenses] WARNING: no text file mapped for license "${id}"`);
      return '';
    }
    const text = readFileSync(join(root, 'lite', rel), 'utf8');
    return `      <details>
        <summary>${escape(id)} — full license text</summary>
        <pre class="license-text">${escape(text)}</pre>
      </details>`;
  })
  .join('\n');

const renderComponent = c => {
  const texts = (c.texts || []).length
    ? ` <span class="badge badge-copyleft">${escape(c.license)}</span>`
    : ` <span class="badge badge-permissive">${escape(c.license)}</span>`;
  const note = c.note ? `\n          <p class="note">${escape(c.note)}</p>` : '';
  return `        <tr>
          <td><strong>${escape(c.name)}</strong><br /><code>${escape(c.package)}</code></td>
          <td>${texts}</td>
          <td>${escape(c.copyright)}<br /><a href="${escape(c.source)}" target="_blank" rel="noopener">${escape(c.source)}</a>${note}</td>
        </tr>`;
};

const renderGroup = g => `      <section class="group">
        <h2>${escape(g.title)}</h2>
        <p class="group-desc">${escape(g.description)}</p>
        <table class="pkg-table">
          <thead><tr><th>Component</th><th>License</th><th>Copyright &amp; source</th></tr></thead>
          <tbody>
${g.components.map(renderComponent).join('\n')}
          </tbody>
        </table>
      </section>`;

const groupsHtml = map.groups.map(renderGroup).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Notebook Library Notices — CourseKata Playground</title>
  <meta name="robots" content="noindex" />
  <style>
    :root {
      --ck-teal: #00cadb;
      --ck-dark: #21005a;
      --ck-text: #1a1a2e;
      --ck-muted: #555;
      --ck-border: #d0d0e0;
      --ck-bg: #f8f9fc;
      --ck-card: #fff;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--ck-bg); color: var(--ck-text); line-height: 1.6;
      padding: 2rem 1rem; margin: 0;
    }
    .container { max-width: 880px; margin: 0 auto; }
    header { border-bottom: 3px solid var(--ck-teal); padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; color: var(--ck-dark); margin: 0; }
    .subtitle { color: var(--ck-muted); font-size: 0.95rem; margin-top: 0.4rem; }
    .intro {
      background: var(--ck-card); border: 1px solid var(--ck-border);
      border-left: 4px solid var(--ck-teal); border-radius: 6px;
      padding: 1rem 1.25rem; margin-bottom: 1.5rem; font-size: 0.92rem; color: var(--ck-muted);
    }
    .group { margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; color: var(--ck-dark); margin: 0 0 0.25rem; }
    .group-desc { color: var(--ck-muted); font-size: 0.9rem; margin: 0 0 0.75rem; }
    .pkg-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; background: var(--ck-card); }
    .pkg-table th, .pkg-table td { text-align: left; padding: 0.55rem 0.65rem; border-bottom: 1px solid var(--ck-border); vertical-align: top; }
    .pkg-table th { color: var(--ck-muted); font-weight: 600; }
    .pkg-table a { color: var(--ck-dark); word-break: break-all; }
    code { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 0.85em; color: var(--ck-muted); }
    .badge { display: inline-block; font-size: 0.72rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; }
    .badge-copyleft { background: #fde2e7; color: #b4123a; }
    .badge-permissive { background: #d8f6e6; color: #07603a; }
    .note { color: var(--ck-muted); font-size: 0.82rem; margin: 0.4rem 0 0; }
    details { background: var(--ck-card); border: 1px solid var(--ck-border); border-radius: 6px; margin-bottom: 0.6rem; padding: 0.5rem 0.85rem; }
    summary { cursor: pointer; font-weight: 600; color: var(--ck-dark); font-size: 0.88rem; }
    .license-text { white-space: pre-wrap; word-break: break-word; font-size: 0.72rem; color: #333; margin-top: 0.75rem; }
    footer { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--ck-border); text-align: center; font-size: 0.82rem; color: var(--ck-muted); }
    footer a { color: var(--ck-dark); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Notebook Library Notices</h1>
      <p class="subtitle">Open-source notices for the R and Python kernels that run in your browser.</p>
    </header>

    <div class="intro">
      CourseKata Playground runs R and Python entirely in your browser using WebAssembly. This page lists
      the kernel components delivered with the application and reproduces the required notices and license
      texts. Some components are distributed under copyleft licenses (GPL, AGPL, MPL); where those licenses
      require it, you are entitled to the corresponding source code at the links below. Open-source
      licenses for the application's JavaScript libraries are listed separately via the
      <strong>Open-source licenses</strong> link in the application footer.
    </div>

${groupsHtml}

    <section class="group">
      <h2>Full license texts</h2>
      <p class="group-desc">Reproduced as required by the licenses above.</p>
${licenseTextSections}
    </section>

    <footer>
      &copy; CourseKata &middot;
      <a href="/terms/">Terms of Service</a> &middot;
      <a href="/privacy/">Privacy Policy</a> &middot;
      <a href="/licenses/">Notebook library notices</a>
    </footer>
  </div>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html, 'utf8');
console.log(`[generate-licenses] wrote ${join(outDir, 'index.html')}`);
