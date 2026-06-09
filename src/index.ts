// Copyright (c) CourseKata
// SPDX-License-Identifier: BSD-3-Clause

import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { Dialog, showDialog, Notification } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { INotebookContent } from '@jupyterlab/nbformat';
import { IStateDB, StateDB } from '@jupyterlab/statedb';

import { exportNotebookAsPDF } from './pdf';
import routesPlugin from './routes';
import notFoundPlugin from './pages/not-found';
import { Commands } from './commands';
import { notebookPlugin } from './pages/notebook';
import { generateDefaultNotebookName, isNotebookEmpty } from './notebook-utils';

import { KERNEL_DISPLAY_NAMES, switchKernel } from './kernels';
import { singleDocumentMode } from './single-mode';
import { notebookFactoryPlugin } from './notebook-factory';
import { placeholderPlugin } from './placeholders';
import { EverywhereIcons } from './icons';
import { sessionDialogs } from './dialogs';
import { createFooter } from './footer';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytereverywhere:plugin',
  description: 'A Jupyter extension for k12 education',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    const { commands } = app;

    // Persistent footer with links to the legal/compliance pages and the
    // built-in third-party Licenses panel.
    app.shell.add(createFooter(app), 'bottom');

    commands.addCommand(Commands.downloadNotebookCommand, {
      label: 'Download as a notebook',
      execute: async args => {
        void args;

        const panel = tracker.currentWidget;

        if (!panel) {
          console.warn('No active notebook to download');
          return;
        }

        const content = panel.context.model.toJSON() as INotebookContent;

        const suggestedName =
          panel.context.path && panel.context.path !== 'Untitled.ipynb'
            ? panel.context.path.replace(/\.ipynb$/i, '')
            : generateDefaultNotebookName();

        const input = document.createElement('input');
        input.value = suggestedName;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '8px';

        const body = new Widget();
        body.node.appendChild(input);

        const result = await showDialog({
          title: 'Download notebook as…',
          body,
          buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Download' })]
        });

        if (!result.button.accept) {
          return;
        }

        const rawName = input.value.trim() || suggestedName;
        const fileName = rawName.toLowerCase().endsWith('.ipynb') ? rawName : `${rawName}.ipynb`;

        const blob = new Blob([JSON.stringify(content, null, 2)], {
          type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    });

    commands.addCommand(Commands.downloadPDFCommand, {
      label: 'Download as PDF',
      execute: async args => {
        void args;

        const panel = tracker.currentWidget;

        if (!panel) {
          console.warn('No active notebook to download as PDF');
          return;
        }

        const suggestedName =
          panel.context.path && panel.context.path !== 'Untitled.ipynb'
            ? panel.context.path.replace(/\.ipynb$/i, '')
            : generateDefaultNotebookName();

        const input = document.createElement('input');
        input.value = suggestedName;
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.style.padding = '8px';

        const body = new Widget();
        body.node.appendChild(input);

        const result = await showDialog({
          title: 'Download PDF as…',
          body,
          buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Download' })]
        });

        if (!result.button.accept) {
          return;
        }

        const rawName = input.value.trim() || suggestedName;

        try {
          await exportNotebookAsPDF(panel, rawName);
        } catch (error) {
          console.error('Failed to export notebook as PDF:', error);
          await showDialog({
            title: 'Error exporting PDF',
            body: 'An error occurred while exporting the notebook as a PDF.',
            buttons: [Dialog.okButton()]
          });
        }
      }
    });

    commands.addCommand(Commands.restartMemoryAndRunAllCommand, {
      label: 'Restart Notebook Memory and Run All Cells',
      icon: EverywhereIcons.fastForward,
      isEnabled: () => !!tracker.currentWidget,
      execute: async () => {
        const panel = tracker.currentWidget;
        if (!panel) {
          console.warn('No active notebook to restart and run.');
          return;
        }

        const result = await showDialog({
          title: 'Would you like to restart the notebook\u2019s memory and rerun all cells?',
          buttons: [Dialog.cancelButton({ label: 'Cancel' }), Dialog.okButton({ label: 'Restart' })]
        });

        if (result.button.accept) {
          try {
            await panel.sessionContext.restartKernel();
            await commands.execute('notebook:run-all-cells');
          } catch (err) {
            console.error('Restarting and running all cells failed', err);
          }
        }
      }
    });

    let saveReminderTimeout: number | null = null;
    let isSaveReminderScheduled = false;
    let hasShownSaveReminder = false;
    let hasManuallySaved = false;

    commands.addCommand(Commands.saveNotebookCommand, {
      label: 'Save Notebook',
      execute: async () => {
        const panel = tracker.currentWidget;
        if (!panel) {
          console.warn('No active notebook to save');
          return;
        }
        if (panel.context.model.readOnly) {
          console.info('Notebook is read-only, skipping save.');
          return;
        }

        hasManuallySaved = true;
        await panel.context.save();
      }
    });

    app.commands.addKeyBinding({
      command: Commands.saveNotebookCommand,
      keys: ['Accel S'],
      selector: '.jp-Notebook'
    });

    commands.addCommand(Commands.switchKernelCommand, {
      label: args => {
        const kernel = (args['kernel'] as string) || '';
        const isActive = args['isActive'] as boolean;
        const display = KERNEL_DISPLAY_NAMES[kernel] || kernel;

        if (isActive) {
          return display;
        }
        return `Switch to ${display}`;
      },
      execute: async args => {
        const kernel = args['kernel'] as string | undefined;
        const panel = tracker.currentWidget;

        if (!kernel) {
          console.warn('No kernel specified for switching.');
          return;
        }
        if (!panel) {
          console.warn('No active notebook panel.');
          return;
        }

        const currentKernel = panel.sessionContext.session?.kernel?.name || '';

        if (currentKernel !== kernel) {
          const currentKernelDisplay = KERNEL_DISPLAY_NAMES[currentKernel] || currentKernel;
          const targetKernelDisplay = KERNEL_DISPLAY_NAMES[kernel] || kernel;
          Notification.warning(
            `You are about to switch your notebook coding language from ${currentKernelDisplay} to ${targetKernelDisplay}. Your previously created code will not run as intended.`,
            { autoClose: 5000 }
          );
        }

        await switchKernel(panel, kernel);
      }
    });

    function startSaveReminder(currentTimeout: number | null, onFire: () => void): number {
      if (currentTimeout) {
        window.clearTimeout(currentTimeout);
      }
      return window.setTimeout(() => {
        const message = hasManuallySaved
          ? "It's been 5 minutes since you last saved this notebook. Make sure to download a copy so you can come back to your work later."
          : "It's been 5 minutes since you started working on this notebook. Make sure to download a copy so you can come back to your work later.";

        Notification.info(message, { autoClose: 8000 });
        onFire();
      }, 300 * 1000);
    }

    tracker.widgetAdded.connect((_, panel: NotebookPanel) => {
      if (saveReminderTimeout) {
        window.clearTimeout(saveReminderTimeout);
        saveReminderTimeout = null;
      }
      isSaveReminderScheduled = false;
      hasShownSaveReminder = false;

      const maybeScheduleSaveReminder = () => {
        if (hasShownSaveReminder) {
          return;
        }

        const content = panel.context.model.toJSON() as INotebookContent;
        if (panel.context.model.readOnly) {
          return;
        }
        if (isNotebookEmpty(content)) {
          return;
        }
        if (isSaveReminderScheduled) {
          return;
        }

        isSaveReminderScheduled = true;
        saveReminderTimeout = startSaveReminder(saveReminderTimeout, () => {
          hasShownSaveReminder = true;
          isSaveReminderScheduled = false;
        });
      };

      void panel.context.ready.then(() => {
        maybeScheduleSaveReminder();
        panel.context.model.contentChanged.connect(() => {
          maybeScheduleSaveReminder();
        });

        panel.context.saveState.connect((_, state) => {
          if (state === 'completed') {
            if (saveReminderTimeout) {
              window.clearTimeout(saveReminderTimeout);
              saveReminderTimeout = null;
            }
            isSaveReminderScheduled = false;
            hasShownSaveReminder = false;
          }
        });
      });

      panel.disposed.connect(() => {
        if (saveReminderTimeout) {
          window.clearTimeout(saveReminderTimeout);
          saveReminderTimeout = null;
        }
      });
    });
  }
};

const stateDBShim: JupyterFrontEndPlugin<IStateDB> = {
  id: '@jupyter-everywhere/apputils-extension:state',
  autoStart: true,
  provides: IStateDB,
  activate: (app: JupyterFrontEnd) => {
    void app;
    return new StateDB();
  }
};

export default [
  stateDBShim,
  notebookFactoryPlugin,
  plugin,
  notebookPlugin,
  routesPlugin,
  singleDocumentMode,
  placeholderPlugin,
  sessionDialogs,
  notFoundPlugin
];
