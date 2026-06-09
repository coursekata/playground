// Adapted from https://github.com/jupyterlite/jupyterlite/pull/1625

// SPDX-License-Identifier: BSD-3-Clause

/**
BSD 3-Clause License

Copyright (c) 2022, JupyterLite Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

import { INotebookModel, Notebook } from '@jupyterlab/notebook';
import { PathExt } from '@jupyterlab/coreutils';
import { DocumentWidget } from '@jupyterlab/docregistry';
import type * as nbformat from '@jupyterlab/nbformat';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Strategy: read the raw .ipynb JSON from the notebook model, re-render
// each cell to clean HTML, open it as a blob URL in a new window, and let
// MathJax call window.print() after it finishes typesetting math.
//
// Advantages over DOM-cloning approaches:
//   • No Lumino layout involved — clean flowing document
//   • Output images are already base64 in the .ipynb JSON — no CORS issue
//   • External images in markdown render fine via window.print() (no canvas)
//   • All cells present regardless of windowed scroll mode
//   • MathJax re-typesets from raw LaTeX source — reliable math rendering

function joinLines(s: nbformat.MultilineString): string {
  return Array.isArray(s) ? s.join('') : s;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Protect $$...$$ and $...$ blocks so marked doesn't mangle LaTeX.
// MathJax in the output window re-renders from these raw delimiters.
function protectMath(src: string): { out: string; stash: string[] } {
  const stash: string[] = [];
  const ph = (s: string) => {
    stash.push(s);
    return `\x02MATH${stash.length - 1}\x03`;
  };
  // Display math first so $$ isn't caught by the $ pass
  const out = src
    .replace(/\$\$[\s\S]+?\$\$/g, ph)
    .replace(/\\\[[\s\S]+?\\\]/g, ph)
    .replace(/\\\([\s\S]+?\\\)/g, ph)
    .replace(/\$[^$\n]+?\$/g, ph);
  return { out, stash };
}

function restoreMath(html: string, stash: string[]): string {
  return html.replace(/\x02MATH(\d+)\x03/g, (_, i) => stash[+i]);
}

function renderMarkdown(src: string): string {
  const { out, stash } = protectMath(src);
  const raw = marked.parse(out, { async: false }) as string;
  const restored = restoreMath(raw, stash);
  return DOMPurify.sanitize(restored, { ADD_TAGS: ['mjx-container'] });
}

function renderOutput(output: nbformat.IOutput): string {
  const ot = output.output_type;

  if (ot === 'display_data' || ot === 'execute_result') {
    const data = (output as nbformat.IDisplayData).data;

    if (data['image/png']) {
      const b64 = joinLines(data['image/png'] as nbformat.MultilineString).replace(/\s/g, '');
      return `<div class="output"><img src="data:image/png;base64,${b64}"></div>`;
    }
    if (data['image/jpeg']) {
      const b64 = joinLines(data['image/jpeg'] as nbformat.MultilineString).replace(/\s/g, '');
      return `<div class="output"><img src="data:image/jpeg;base64,${b64}"></div>`;
    }
    if (data['image/svg+xml']) {
      const svg = joinLines(data['image/svg+xml'] as nbformat.MultilineString);
      return `<div class="output">${svg}</div>`;
    }
    if (data['text/html']) {
      const html = joinLines(data['text/html'] as nbformat.MultilineString);
      return `<div class="output">${DOMPurify.sanitize(html)}</div>`;
    }
    if (data['text/plain']) {
      const text = joinLines(data['text/plain'] as nbformat.MultilineString);
      return `<div class="output"><pre class="text-plain">${escHtml(text)}</pre></div>`;
    }
  }

  if (ot === 'stream') {
    const s = output as nbformat.IStream;
    const cls = s.name === 'stderr' ? 'stderr' : 'stdout';
    return `<pre class="output stream ${cls}">${escHtml(joinLines(s.text))}</pre>`;
  }

  if (ot === 'error') {
    const e = output as nbformat.IError;
    return `<pre class="output error">${escHtml(e.ename)}: ${escHtml(e.evalue)}</pre>`;
  }

  return '';
}

function buildHtml(title: string, nbJson: nbformat.INotebookContent): string {
  let body = '';

  for (const cell of nbJson.cells) {
    const src = joinLines(cell.source);

    if (cell.cell_type === 'markdown') {
      body += `<div class="cell md-cell">\n${renderMarkdown(src)}\n</div>\n`;
    } else if (cell.cell_type === 'code') {
      let html = '<div class="cell code-cell">';
      if (src.trim()) {
        html += `<pre class="code-src"><code>${escHtml(src)}</code></pre>`;
      }
      for (const out of ((cell as nbformat.ICodeCell).outputs ?? [])) {
        html += renderOutput(out);
      }
      html += '</div>';
      body += html + '\n';
    } else if (cell.cell_type === 'raw' && src.trim()) {
      body += `<div class="cell raw-cell"><pre>${escHtml(src)}</pre></div>\n`;
    }
  }

  // MathJax config + print trigger embedded in the output document.
  // After MathJax typesets all math AND all <img> elements are loaded,
  // window.print() fires. A 6-second fallback handles offline / no-math cases.
  const script = `
<script>
var _printed = false;
function _doPrint() { if (!_printed) { _printed = true; window.print(); } }
setTimeout(_doPrint, 6000);
window.addEventListener('afterprint', function() { window.close(); });

window.MathJax = {
  tex: {
    inlineMath: [['$','$'],['\\\\(','\\\\)']],
    displayMath: [['$$','$$'],['\\\\[','\\\\]']],
    processEscapes: true
  },
  startup: {
    ready() {
      MathJax.startup.defaultReady();
      MathJax.startup.promise.then(function() {
        var imgs = Array.from(document.querySelectorAll('img'));
        return Promise.all(imgs.map(function(img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function(res) { img.onload = img.onerror = res; });
        }));
      }).then(_doPrint);
    }
  }
};
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escHtml(title)}</title>
${script}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111;background:#fff;max-width:8.5in;margin:0 auto;padding:.5in}
.cell{margin-bottom:1.25em}
.code-src{background:#f6f8fa;border:1px solid #e0e0e0;border-radius:4px;padding:.6em 1em;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:.875em;white-space:pre-wrap;word-break:break-word;margin-bottom:.5em}
.output{margin:.4em 0}
pre{font-family:"SFMono-Regular",Consolas,monospace;font-size:.875em;white-space:pre-wrap;word-break:break-word}
.stream.stderr,.error{color:#c0392b}
img{max-width:100%;height:auto;display:block}.output svg{max-width:100%;height:auto;display:block}
table{border-collapse:collapse;width:100%;margin:.5em 0;font-size:.9em}
th,td{border:1px solid #ccc;padding:5px 9px;text-align:left;vertical-align:top}
th{background:#f0f0f0;font-weight:600}
tr:nth-child(even){background:#f9f9f9}
h1{font-size:1.8em;margin:.6em 0 .3em}
h2{font-size:1.4em;margin:.6em 0 .3em}
h3{font-size:1.15em;margin:.5em 0 .25em}
h4,h5,h6{font-size:1em;margin:.4em 0 .2em}
p{margin:.4em 0}
ul,ol{margin:.4em 0 .4em 1.5em}
li{margin:.1em 0}
blockquote{border-left:3px solid #ccc;margin:.5em 0 .5em 1em;padding:0 1em;color:#555}
code{font-family:"SFMono-Regular",Consolas,monospace;font-size:.875em;background:#f0f0f0;padding:.1em .3em;border-radius:2px}
pre code{background:none;padding:0}
hr{border:none;border-top:1px solid #ccc;margin:1em 0}
a{color:#0366d6}
@page{size:letter portrait;margin:.75in}
@media print{
  body{max-width:none;padding:0;margin:0}
  h1,h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid}
  .code-src{break-inside:avoid;page-break-inside:avoid}
  img,.output svg{break-inside:avoid;page-break-inside:avoid;max-width:100%!important}
  table{break-inside:avoid;page-break-inside:avoid}
  tr{break-inside:avoid;page-break-inside:avoid}
  pre{white-space:pre-wrap;overflow:visible}
}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function exportNotebookAsPDF(
  notebook: DocumentWidget<Notebook, INotebookModel>,
  fileName?: string
): Promise<void> {
  const name =
    fileName ??
    PathExt.basename(
      notebook.context.path,
      PathExt.extname(notebook.context.path)
    );

  const nbJson = notebook.context.model.toJSON() as nbformat.INotebookContent;
  const html = buildHtml(name, nbJson);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked — fall back to downloading the HTML
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Revoke after 60 s — enough time for the window to load
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
