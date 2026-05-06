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
import { getCurrentFileHandle, saveToHandle } from './filesystem';
import { generateDefaultNotebookName, isNotebookEmpty } from './notebook-utils';

import { KERNEL_DISPLAY_NAMES, switchKernel } from './kernels';
import { singleDocumentMode } from './single-mode';
import { notebookFactoryPlugin } from './notebook-factory';
import { placeholderPlugin } from './placeholders';
import { EverywhereIcons } from './icons';
import { sessionDialogs } from './dialogs';

const _downloadCopyCount = new Map<string, number>();

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytereverywhere:plugin',
  description: 'A Jupyter extension for k12 education',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, tracker: INotebookTracker) => {
    const { commands } = app;

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

        const baseName =
          panel.context.path && panel.context.path !== 'Untitled.ipynb'
            ? panel.context.path.replace(/\.ipynb$/i, '')
            : generateDefaultNotebookName();
        const copyN = (_downloadCopyCount.get(baseName) ?? 0) + 1;
        _downloadCopyCount.set(baseName, copyN);
        const suggestedName = copyN === 1 ? `${baseName}_copy` : `${baseName}_copy${copyN}`;

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
          buttons: [Dialog.cancelButton({ className: 'ck-btn' }), Dialog.okButton({ label: 'Download', className: 'ck-btn' })]
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
        try { sessionStorage.setItem(`ck-last-downloaded:${panel.context.path}`, JSON.stringify(content.cells ?? [])); } catch {}
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
          buttons: [Dialog.cancelButton({ className: 'ck-btn' }), Dialog.okButton({ label: 'Download', className: 'ck-btn' })]
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
          buttons: [Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }), Dialog.okButton({ label: 'Restart', className: 'ck-btn' })]
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

    commands.addCommand(Commands.saveNotebookCommand, {
      label: 'Save Notebook',
      execute: async () => {
        const panel = tracker.currentWidget;
        if (!panel) {
          console.warn('No active notebook to save');
          return;
        }

        const fileHandle = getCurrentFileHandle();
        if (fileHandle) {
          if (!panel.context.model.dirty) {
            return;
          }
          const content = panel.context.model.toJSON() as INotebookContent;
          const text = JSON.stringify(content, null, 2);
          try {
            await saveToHandle(fileHandle, text);
            await panel.context.save();
            Notification.success('Saved.', { autoClose: 2000 });
          } catch (err) {
            console.error('Failed to save to file handle:', err);
            Notification.warning('Could not save to file.', { autoClose: 4000 });
          }
          return;
        }

        // No file handle yet — fall through to Save as… (new notebook or GitHub notebook)
        await commands.execute(Commands.saveToFile);
      }
    });

    app.commands.addKeyBinding({
      command: Commands.saveNotebookCommand,
      keys: ['Accel S'],
      selector: '.jp-NotebookPanel'
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
