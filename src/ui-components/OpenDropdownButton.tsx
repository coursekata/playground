import { CommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import { ToolbarButton } from '@jupyterlab/apputils';
import { getCurrentFileHandle } from '../filesystem';

export class OpenDropdownButton extends ToolbarButton {
  constructor(
    commands: CommandRegistry,
    openFromFile: () => void,
    openFromURL: () => void,
    openNewRNotebook: () => void,
    openNewPythonNotebook: () => void,
    downloadNotebook: () => void,
    downloadPDF: () => void,
    openFromGitHub: () => void,
    copyShareLink: () => void,
    isCopyShareLinkEnabled: () => boolean,
    saveChanges: () => void,
    isSaveChangesEnabled: () => boolean,
    saveAs: () => void,
    closeNotebook: () => void,
    clearStorage: () => void,
    getRecentItems: () => Array<{ label: string; open: () => void; isCurrent: () => boolean }>
  ) {
    const canSaveToFile = typeof (window as any).showSaveFilePicker === 'function';

    const commandOpenFile = 'jupytereverywhere:file-open-from-file';
    const commandOpenUrl = 'jupytereverywhere:file-open-from-url';
    const commandNewR = 'jupytereverywhere:file-new-r-notebook';
    const commandNewPython = 'jupytereverywhere:file-new-python-notebook';
    const commandDownload = 'jupytereverywhere:file-download-notebook';
    const commandDownloadPDF = 'jupytereverywhere:file-download-pdf';
    const commandOpenGitHub = 'jupytereverywhere:file-open-from-github';
    const commandCopyShareLink = 'jupytereverywhere:file-copy-share-link';
    const commandSaveChanges = 'jupytereverywhere:file-save-changes';
    const commandSaveAs = 'jupytereverywhere:file-save-as';
    const commandCloseNotebook = 'jupytereverywhere:file-close-notebook';
    const commandClearStorage = 'jupytereverywhere:file-clear-storage';

    if (!commands.hasCommand(commandOpenFile)) {
      commands.addCommand(commandOpenFile, {
        label: 'Open from file',
        execute: () => {
          openFromFile();
        }
      });
    }

    if (!commands.hasCommand(commandOpenUrl)) {
      commands.addCommand(commandOpenUrl, {
        label: 'Open from URL',
        execute: () => {
          openFromURL();
        }
      });
    }

    if (!commands.hasCommand(commandNewR)) {
      commands.addCommand(commandNewR, {
        label: 'New R notebook',
        execute: () => {
          openNewRNotebook();
        }
      });
    }

    if (!commands.hasCommand(commandNewPython)) {
      commands.addCommand(commandNewPython, {
        label: 'New Python notebook',
        execute: () => {
          openNewPythonNotebook();
        }
      });
    }

    if (!commands.hasCommand(commandDownload)) {
      commands.addCommand(commandDownload, {
        label: 'Download notebook',
        isVisible: () => !canSaveToFile,
        execute: () => {
          downloadNotebook();
        }
      });
    }

    if (!commands.hasCommand(commandDownloadPDF)) {
      commands.addCommand(commandDownloadPDF, {
        label: 'Download as PDF',
        execute: () => {
          downloadPDF();
        }
      });
    }

    if (!commands.hasCommand(commandOpenGitHub)) {
      commands.addCommand(commandOpenGitHub, {
        label: 'Open from GitHub',
        execute: () => {
          openFromGitHub();
        }
      });
    }

    if (!commands.hasCommand(commandSaveChanges)) {
      commands.addCommand(commandSaveChanges, {
        label: canSaveToFile ? 'Save changes' : 'Save changes in browser…',
        isEnabled: () => isSaveChangesEnabled(),
        execute: () => {
          saveChanges();
        }
      });
    }

    if (!commands.hasCommand(commandSaveAs)) {
      commands.addCommand(commandSaveAs, {
        label: () => getCurrentFileHandle() !== null ? 'Save as…' : 'Save as file…',
        isVisible: () => canSaveToFile,
        execute: () => {
          saveAs();
        }
      });
    }

    if (!commands.hasCommand(commandCloseNotebook)) {
      commands.addCommand(commandCloseNotebook, {
        label: 'Close notebook',
        execute: () => {
          closeNotebook();
        }
      });
    }

    if (!commands.hasCommand(commandClearStorage)) {
      commands.addCommand(commandClearStorage, {
        label: 'Clear storage',
        execute: () => {
          clearStorage();
        }
      });
    }

    if (!commands.hasCommand(commandCopyShareLink)) {
      commands.addCommand(commandCopyShareLink, {
        label: 'Copy link to GitHub source',
        isEnabled: () => isCopyShareLinkEnabled(),
        execute: () => {
          copyShareLink();
        }
      });
    }

    const commandRecent = 'jupytereverywhere:open-recent';
    if (!commands.hasCommand(`${commandRecent}-0`)) {
      for (let i = 0; i < 5; i++) {
        const idx = i;
        commands.addCommand(`${commandRecent}-${idx}`, {
          label: () => getRecentItems()[idx]?.label ?? '',
          isVisible: () => idx < getRecentItems().length,
          isToggled: () => getRecentItems()[idx]?.isCurrent() ?? false,
          execute: () => {
            getRecentItems()[idx]?.open();
          }
        });
      }
    }

    super({
      label: 'File',
      tooltip: 'File actions',
      onClick: () => {
        const menu = new Menu({ commands });

        menu.addItem({ command: commandNewR });
        menu.addItem({ command: commandNewPython });
        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandOpenFile });
        menu.addItem({ command: commandOpenUrl });
        menu.addItem({ command: commandOpenGitHub });

        const recents = getRecentItems();
        if (recents.length > 0) {
          menu.addItem({ type: 'separator' });
          for (let i = 0; i < recents.length; i++) {
            menu.addItem({ command: `${commandRecent}-${i}` });
          }
        }

        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandSaveChanges });
        menu.addItem({ command: commandSaveAs });
        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandDownload });
        menu.addItem({ command: commandDownloadPDF });
        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandCopyShareLink });
        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandCloseNotebook });
        menu.addItem({ type: 'separator' });
        menu.addItem({ command: commandClearStorage });

        const anchor = this.node.getBoundingClientRect();
        menu.open(anchor.left, anchor.bottom);

        menu.aboutToClose.connect(() => {
          // Defer dispose to avoid dispose→close→onCloseRequest→aboutToClose→dispose recursion
          setTimeout(() => { menu.dispose(); }, 0);
        });
      }
    });

    this.addClass('je-OpenDropdownButton');
  }
}
