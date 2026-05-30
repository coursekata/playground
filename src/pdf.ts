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

export function exportNotebookAsPDF(
  notebook: DocumentWidget<Notebook, INotebookModel>,
  fileName?: string
): void {
  const name =
    fileName ??
    PathExt.basename(
      notebook.context.path,
      PathExt.extname(notebook.context.path)
    );

  const sourceEl = notebook.content.node;

  // Collect the page's stylesheet links so the print window gets the same
  // JupyterLab styles (syntax highlighting, markdown, output areas, etc.).
  const cssLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  )
    .map(el => el.outerHTML)
    .join('\n');

  // Open a new window and write a clean, print-ready version of the notebook.
  // Using window.open() + window.print() instead of html2canvas has one key
  // advantage: the browser's native renderer displays cross-origin images
  // (S3, CDNs, etc.) freely. html2canvas requires those images to be
  // re-fetched with CORS headers, which most asset servers don't send.
  const win = window.open('', '_blank');
  if (!win) {
    // Popup blocked — fall back to printing the current window.
    // @media print in base.css handles the layout for this case.
    const prev = document.title;
    document.title = name;
    window.print();
    document.title = prev;
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${name}</title>
  <base href="${location.origin}${location.pathname}">
  ${cssLinks}
  <style>
    @page {
      size: letter portrait;
      margin: 0.75in;
    }

    html, body {
      background: white;
      margin: 0;
      padding: 0;
    }

    body {
      padding: 0.25em 1.5em;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica,
                   Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    }

    /* ── Layout reset ───────────────────────────────────────────────────────
       There is no Lumino shell here, so cells already flow naturally.
       We just guard against any leftover position/size from JupyterLab CSS. */

    .jp-Cell {
      position: static !important;
      display: block !important;
      break-inside: avoid;
      page-break-inside: avoid;
      margin: 0 0 1em 0;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }

    /* Keep headings with the content that follows them */
    h1, h2, h3, h4, h5, h6 {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* ── Hide notebook chrome ───────────────────────────────────────────── */
    .jp-InputArea-prompt,
    .je-cell-run-button {
      display: none !important;
    }

    /* Remove the left border / active-cell highlight */
    .jp-Cell.jp-mod-active .jp-Cell-inputWrapper,
    .jp-Cell .jp-Cell-inputWrapper {
      border-left: none !important;
    }

    /* ── Markdown cells ─────────────────────────────────────────────────── */
    .jp-MarkdownCell .jp-RenderedMarkdown {
      padding: 0 !important;
    }

    /* ── Code editors (CodeMirror 6) ────────────────────────────────────── */
    /* CodeMirror uses a fixed-height scroller; expand it for print. */
    .cm-editor,
    .cm-scroller {
      height: auto !important;
      overflow: visible !important;
    }
    .cm-content {
      white-space: pre-wrap !important;
      word-break: break-all;
    }

    /* Code cell container */
    .jp-InputArea-editor {
      overflow: visible !important;
    }

    /* ── Output areas ───────────────────────────────────────────────────── */
    .jp-OutputArea,
    .jp-OutputArea-child,
    .jp-OutputArea-output {
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
    }

    /* R / Python text output */
    pre {
      white-space: pre-wrap !important;
      overflow: visible !important;
      word-break: break-all;
      margin: 0;
    }

    /* ── Images & figures ───────────────────────────────────────────────── */
    img,
    svg {
      max-width: 100% !important;
      height: auto !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* ── Tables ─────────────────────────────────────────────────────────── */
    table {
      break-inside: avoid;
      page-break-inside: avoid;
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 4px 8px;
      text-align: left;
    }
    tr { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
${sourceEl.innerHTML}
</body>
</html>`);

  win.document.close();

  // Trigger print once all resources (images, fonts, CSS) are loaded.
  win.addEventListener('load', () => {
    win.focus();
    win.print();
    // Leave the window open — closing it immediately can race with the
    // browser writing the PDF file, especially on slower machines.
  });
}
