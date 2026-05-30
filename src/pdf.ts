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
  const fullHeight = sourceEl.scrollHeight;

  // Collect cell top positions relative to the notebook element before
  // any DOM modification. Positions are stable — only container height changes.
  const containerTop = sourceEl.getBoundingClientRect().top;
  const cellTopsPx = Array.from(sourceEl.querySelectorAll('.jp-Cell')).map(
    cell => cell.getBoundingClientRect().top - containerTop
  );

  // Temporarily expand the source element in the live DOM and strip overflow
  // clipping from all ancestors. Capturing from the live DOM (rather than an
  // off-screen clone) guarantees images are already loaded — clones require
  // the browser to re-fetch or re-decode images, which fails for blob URLs,
  // JupyterLite virtual-filesystem paths, and cross-origin resources.
  type StyleSave = {
    el: HTMLElement;
    overflow: string;
    overflowY: string;
    height: string;
    maxHeight: string;
  };
  const saves: StyleSave[] = [];

  const saveAndFix = (el: HTMLElement, height?: number) => {
    saves.push({
      el,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
    });
    el.style.overflow = 'visible';
    el.style.overflowY = 'visible';
    el.style.maxHeight = 'none';
    if (height !== undefined) el.style.height = height + 'px';
  };

  saveAndFix(sourceEl, fullHeight);
  let ancestor: HTMLElement | null = sourceEl.parentElement;
  while (ancestor && ancestor !== document.documentElement) {
    const cs = getComputedStyle(ancestor);
    if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') {
      saveAndFix(ancestor);
    }
    ancestor = ancestor.parentElement;
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(sourceEl, {
      scale: 1,
      useCORS: true,
    });
  } finally {
    for (const { el, overflow, overflowY, height, maxHeight } of saves) {
      el.style.overflow = overflow;
      el.style.overflowY = overflowY;
      el.style.height = height;
      el.style.maxHeight = maxHeight;
    }
  }

  if (canvas.height === 0) return;

  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const mmPerPx = pageWidth / canvas.width;
  const totalHeightMm = canvas.height * mmPerPx;
  const cellTopsMm = cellTopsPx.map(px => px * mmPerPx);

  // Build page breaks that land at cell boundaries so no cell is split.
  // For each candidate break, walk back to the latest cell start at or
  // before that point — that cell will begin fresh on the next page.
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

  // Render each page as an independent canvas slice.
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
