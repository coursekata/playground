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

  // Clone into an off-screen container with no overflow/height constraints so
  // html2canvas captures the full content, not just the visible viewport.
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

  // Copy canvas pixel data from the live element to the clone so rendered
  // plots appear in the PDF.
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

  // Collect each cell's top y-position (pixels from container top) before
  // we remove the element from the DOM.
  const containerTop = offscreen.getBoundingClientRect().top;
  const cellTopsPx = Array.from(clone.querySelectorAll('.jp-Cell')).map(
    cell => cell.getBoundingClientRect().top - containerTop
  );

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(offscreen, { scale: 1, useCORS: true });
  } finally {
    document.body.removeChild(offscreen);
  }

  if (canvas.height === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm

  const mmPerPx = pageWidth / canvas.width;
  const totalHeightMm = canvas.height * mmPerPx;
  const cellTopsMm = cellTopsPx.map(px => px * mmPerPx);

  // Build page break positions that land at cell boundaries.
  // For each candidate break (cursor + pageHeight), find the latest cell
  // start that falls at or before that point — the cell will then begin
  // fresh on the next page rather than being split.
  const breaks: number[] = [0];
  let cursor = 0;
  while (cursor < totalHeightMm) {
    const rawEnd = cursor + pageHeight;
    if (rawEnd >= totalHeightMm) break;

    let bestBreak = rawEnd;
    for (const cellTop of cellTopsMm) {
      if (cellTop > cursor && cellTop <= rawEnd) {
        bestBreak = cellTop; // keep updating — want the last one before rawEnd
      }
    }
    breaks.push(bestBreak);
    cursor = bestBreak;
  }
  breaks.push(totalHeightMm);

  // Render each page as an independent canvas slice so that the break
  // position can vary per page.
  for (let i = 0; i < breaks.length - 1; i++) {
    const startPx = Math.round(breaks[i] / mmPerPx);
    const endPx = Math.round(breaks[i + 1] / mmPerPx);
    const sliceHeightPx = endPx - startPx;
    const sliceHeightMm = breaks[i + 1] - breaks[i];

    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeightPx;
    slice.getContext('2d')!.drawImage(
      canvas, 0, startPx, canvas.width, sliceHeightPx,
      0, 0, canvas.width, sliceHeightPx
    );

    if (i > 0) doc.addPage();
    doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, sliceHeightMm);
  }

  doc.save(outputName);
}
