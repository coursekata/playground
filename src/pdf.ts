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

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function exportNotebookAsPDF(
  notebook: DocumentWidget<Notebook, INotebookModel>,
  fileName?: string
): Promise<void> {
  const defaultName = PathExt.basename(
    notebook.context.path,
    PathExt.extname(notebook.context.path)
  );
  const name = fileName ?? defaultName;
  const outputName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;

  const sourceEl = notebook.content.node;

  // Clone the notebook into an off-screen container with no overflow constraints.
  // We can't capture sourceEl directly because it is a fixed-height scroll container —
  // html2canvas only captures the visible viewport, not the scrolled content.
  const offscreen = document.createElement('div');
  offscreen.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    `width:${sourceEl.scrollWidth}px`,
    'overflow:visible',
    'background:#fff',
  ].join(';');

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.cssText = [
    'position:static',
    'height:auto',
    'max-height:none',
    'overflow:visible',
    `width:${sourceEl.scrollWidth}px`,
  ].join(';');
  offscreen.appendChild(clone);
  document.body.appendChild(offscreen);

  // Copy canvas pixel data from the live element to the clone so that
  // rendered plots (matplotlib, etc.) appear in the PDF.
  const srcCanvases = Array.from(sourceEl.querySelectorAll('canvas'));
  const dstCanvases = Array.from(clone.querySelectorAll('canvas'));
  srcCanvases.forEach((src, i) => {
    const dst = dstCanvases[i];
    if (!dst) return;
    try {
      dst.width = src.width;
      dst.height = src.height;
      dst.getContext('2d')?.drawImage(src, 0, 0);
    } catch {
      // Silently skip cross-origin canvases
    }
  });

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(offscreen, { scale: 1, useCORS: true });
  } finally {
    document.body.removeChild(offscreen);
  }

  if (canvas.height === 0) return;

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Total image height in mm once scaled to fit the page width
  const totalHeightMm = (canvas.height / canvas.width) * pageWidth;

  let yOffset = 0;
  for (let page = 0; yOffset < totalHeightMm; page++) {
    if (page > 0) doc.addPage();
    doc.addImage(imgData, 'JPEG', 0, -yOffset, pageWidth, totalHeightMm);
    yOffset += pageHeight;
  }

  doc.save(outputName);
}
