// Copyright (c) CourseKata
// SPDX-License-Identifier: BSD-3-Clause

import {
  saveIcon,
  folderIcon,
  addIcon,
  LabIcon,
  linkIcon,
  runIcon,
  refreshIcon,
  stopIcon,
  fastForwardIcon
} from '@jupyterlab/ui-components';

import saveSvg from '../style/icons/save.svg';
import folderSvg from '../style/icons/folder.svg';
import addSvg from '../style/icons/add.svg';
import linkSvg from '../style/icons/link.svg';
import runSvg from '../style/icons/run.svg';
import runCellSvg from '../style/icons/run-cell.svg';
import refreshSvg from '../style/icons/refresh.svg';
import stopSvg from '../style/icons/stop.svg';
import fastForwardSvg from '../style/icons/fast-forward.svg';
export namespace EverywhereIcons {
  export const save = new LabIcon({
    name: saveIcon.name,
    svgstr: saveSvg
  });
  export const folder = new LabIcon({
    name: folderIcon.name,
    svgstr: folderSvg
  });
  export const add = new LabIcon({
    name: addIcon.name,
    svgstr: addSvg
  });
  export const link = new LabIcon({
    name: linkIcon.name,
    svgstr: linkSvg
  });
  export const run = new LabIcon({
    name: runIcon.name,
    svgstr: runSvg
  });
  export const refresh = new LabIcon({
    name: refreshIcon.name,
    svgstr: refreshSvg
  });
  export const stop = new LabIcon({
    name: stopIcon.name,
    svgstr: stopSvg
  });
  export const fastForward = new LabIcon({
    name: fastForwardIcon.name,
    svgstr: fastForwardSvg
  });
  export const runCell = new LabIcon({
    name: 'everywhere:run-cell',
    svgstr: runCellSvg
  });
}
