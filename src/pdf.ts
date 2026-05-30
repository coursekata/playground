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

  const element = notebook.content.node;

  // Capture the full scrollable height, not just the visible viewport portion
  const canvas = await html2canvas(element, {
    scale: 1,
    useCORS: true,
    height: element.scrollHeight,
    windowHeight: element.scrollHeight
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const doc = new jsPDF({ orientation: 'portrait', format: 'a4', unit: 'mm' });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm

  // Total image height in mm, scaled to fit the page width
  const totalHeightMm = (canvas.height / canvas.width) * pageWidth;

  let yOffset = 0;
  let page = 0;

  while (yOffset < totalHeightMm) {
    if (page > 0) doc.addPage();
    // Shift the image up by yOffset so each page shows the next slice
    doc.addImage(imgData, 'JPEG', 0, -yOffset, pageWidth, totalHeightMm);
    yOffset += pageHeight;
    page++;
  }

  doc.save(outputName);
}
