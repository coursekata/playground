import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import {
  Dialog,
  ISessionContext,
  ISessionContextDialogs,
  SessionContextDialogs,
  showDialog
} from '@jupyterlab/apputils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

class JESessionContextDialogs extends SessionContextDialogs {
  async restart(sessionContext: ISessionContext): Promise<boolean> {
    const result = await showDialog({
      title: 'Would you like to restart the notebook’s memory?',
      buttons: [Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }), Dialog.okButton({ label: 'Restart', className: 'ck-btn' })]
    });
    if (result.button.accept) {
      try {
        await sessionContext.restartKernel();
        return true;
      } catch (err) {
        console.error('Memory restart failed', err);
        return false;
      }
    }
    return false;
  }
}

export const sessionDialogs: JupyterFrontEndPlugin<ISessionContextDialogs> = {
  id: '@jupyter-everywhere/apputils-extension:sessionDialogs',
  provides: ISessionContextDialogs,
  optional: [ITranslator],
  autoStart: true,
  activate: async (app: JupyterFrontEnd, translator: ITranslator | null) => {
    return new JESessionContextDialogs({
      translator: translator ?? nullTranslator
    });
  }
};
