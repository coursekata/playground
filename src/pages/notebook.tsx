import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { OpenDropdownButton } from '../ui-components/OpenDropdownButton';
import { RunDropdownButton } from '../ui-components/RunDropdownButton';
import { KernelIndicator } from '../ui-components/KernelIndicator';
import { ILiteRouter } from '@jupyterlite/application';
import { INotebookTracker, INotebookWidgetFactory } from '@jupyterlab/notebook';
import { INotebookContent } from '@jupyterlab/nbformat';
import {
  IToolbarWidgetRegistry,
  ISessionContext,
  createToolbarFactory
} from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';
import { Commands } from '../commands';
import { KERNEL_URL_TO_NAME, KERNEL_DISPLAY_NAMES } from '../kernels';
import { handleNotebookUpload, openNotebookContent } from '../upload';

function mapLanguageToKernel(content: INotebookContent): string {
  const rawLang =
    (content?.metadata?.kernelspec?.language as string | undefined)?.toLowerCase() ||
    (content?.metadata?.language_info?.name as string | undefined)?.toLowerCase() ||
    'python';

  if (rawLang === 'r') {
    return 'xr';
  }
  return 'python';
}

async function patchPyodideHttp(sessionContext: ISessionContext): Promise<void> {
  const session = sessionContext.session;
  if (!session) {
    throw Error('Session should have been ready');
  }
  const kernel = session.kernel;
  if (!kernel) {
    console.warn('Kernel was expected but not found');
    return;
  }
  if (kernel.name !== 'python') {
    console.debug('Non-python kernel: not patching');
    return;
  }
  await kernel.requestExecute({
    allow_stdin: false,
    code: [
      '%pip install -y pyodide-http requests',
      'import pyodide_http',
      'pyodide_http.patch_all()'
    ].join('\n'),
    silent: true,
    stop_on_error: false,
    store_history: false
  });
}

export const notebookPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupytereverywhere:notebook',
  autoStart: true,
  requires: [
    INotebookTracker,
    IToolbarWidgetRegistry,
    INotebookWidgetFactory,
    ISettingRegistry,
    ITranslator
  ],
  optional: [ILiteRouter],
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    toolbarRegistry: IToolbarWidgetRegistry,
    notebookFactory: unknown,
    settingRegistry: ISettingRegistry,
    translator: ITranslator,
    router?: ILiteRouter | null
  ) => {
    const { commands, serviceManager } = app;
    const { contents } = serviceManager;

    // Register the settings transformer for our plugin so JupyterLab can load our
    // jupyter.lab.toolbars.Notebook entries. The factory itself is unused (the Notebook
    // widget is created by @jupyterlab/notebook-extension), but the side effect of this
    // call is to register a transform for 'jupytereverywhere:plugin' via settingRegistry.
    createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      'Notebook',
      'jupytereverywhere:plugin',
      translator
    );
    void notebookFactory;

    const params = new URLSearchParams(window.location.search);
    const uploadedNotebookId = params.get('uploaded-notebook');
    const fromUrl = params.get('from');

    const openNewNotebookWindow = (kernelParam: 'r' | 'python'): void => {
      const url = new URL(window.location.href);

      url.searchParams.delete('uploaded-notebook');
      url.searchParams.delete('from');
      url.searchParams.delete('tab');

      url.searchParams.set('kernel', kernelParam);

      window.location.href = url.toString();
    };

    const createNewNotebook = async (): Promise<void> => {
      try {
        const currentParams = new URLSearchParams(window.location.search);
        const desiredKernelParam = currentParams.get('kernel') || 'r';
        const desiredKernel = KERNEL_URL_TO_NAME[desiredKernelParam] || 'xr';

        await commands.execute('notebook:create-new', {
          kernelName: desiredKernel
        });

        console.log(`Created new notebook with kernel: ${desiredKernel}`);
      } catch (error) {
        console.error('Failed to create new notebook:', error);
      }
    };

    const openUploadedNotebook = async (id: string): Promise<void> => {
      try {
        const raw = localStorage.getItem(`uploaded-notebook:${id}`);
        if (!raw) {
          console.warn(`No uploaded notebook found for ID: ${id}`);
          await createNewNotebook();
          return;
        }

        const content = JSON.parse(raw) as INotebookContent;

        const kernelName = mapLanguageToKernel(content);
        content.metadata.kernelspec = {
          name: kernelName,
          display_name: KERNEL_DISPLAY_NAMES[kernelName] ?? kernelName
        };

        const filename = `${(content.metadata?.name as string) || `Uploaded_${id}`}.ipynb`;

        await contents.save(filename, {
          type: 'notebook',
          format: 'json',
          content
        });
        await commands.execute('docmanager:open', { path: filename });

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('uploaded-notebook');
        window.history.replaceState({}, '', currentUrl.toString());

        localStorage.removeItem(`uploaded-notebook:${id}`);
        console.log(`Opened uploaded notebook: ${filename}`);
      } catch (error) {
        console.error('Failed to open uploaded notebook:', error);
        await createNewNotebook();
      }
    };

    const openNotebookFromProvidedURL = async (url: string): Promise<void> => {
      try {
        let fetchUrl = url.trim();

        if (
          (fetchUrl.startsWith('"') && fetchUrl.endsWith('"')) ||
          (fetchUrl.startsWith("'") && fetchUrl.endsWith("'"))
        ) {
          fetchUrl = fetchUrl.slice(1, -1);
        }

        if (fetchUrl.includes('github.com') && fetchUrl.includes('/blob/')) {
          fetchUrl = fetchUrl
            .replace('https://github.com/', 'https://raw.githubusercontent.com/')
            .replace('/blob/', '/');
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch notebook: ${response.status} ${response.statusText}`);
        }

        const parsed = (await response.json()) as INotebookContent;
        await openNotebookContent(parsed);

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('from');
        window.history.replaceState({}, '', currentUrl.toString());
      } catch (error) {
        console.error('Failed to open notebook from URL:', error);
        alert('Failed to open notebook from URL.');
      }
    };

    const openNotebookFromURL = async (): Promise<void> => {
      const url = window.prompt('Enter a GitHub notebook URL or raw .ipynb URL:');
      if (!url) {
        return;
      }

      await openNotebookFromProvidedURL(url);
    };

    if (uploadedNotebookId) {
      void openUploadedNotebook(uploadedNotebookId);
    } else if (fromUrl) {
      void openNotebookFromProvidedURL(fromUrl);
    } else {
      void createNewNotebook();
    }

    tracker.widgetAdded.connect(async (_, panel) => {
      await panel.sessionContext.ready;

      const url = new URL(window.location.href);
      if (url.searchParams.has('kernel')) {
        url.searchParams.delete('kernel');
        window.history.replaceState({}, '', url.toString());
        console.log('Removed kernel param from URL after kernel init.');
      }

      panel.sessionContext.kernelChanged.connect(patchPyodideHttp);
      await patchPyodideHttp(panel.sessionContext);
    });

    toolbarRegistry.addFactory('Notebook', 'coursekataLogo', () => {
      const widget = new Widget();
      widget.addClass('ck-logo-button');
      const anchor = document.createElement('a');
      anchor.href = 'https://www.coursekata.org';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.title = 'Visit CourseKata';
      widget.node.appendChild(anchor);
      return widget;
    });

    toolbarRegistry.addFactory('Notebook', 'run', () => new RunDropdownButton(commands));

    toolbarRegistry.addFactory(
      'Notebook',
      'upload',
      () =>
        new OpenDropdownButton(
          commands,
          () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.ipynb,application/json';
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) {
                return;
              }
              await handleNotebookUpload(file);
            };
            input.click();
          },
          () => {
            void openNotebookFromURL();
          },
          () => {
            openNewNotebookWindow('r');
          },
          () => {
            openNewNotebookWindow('python');
          },
          () => {
            void commands.execute(Commands.downloadNotebookCommand);
          },
          () => {
            void commands.execute(Commands.downloadPDFCommand);
          }
        )
    );

    toolbarRegistry.addFactory('Notebook', 'jeKernelSwitcher', () => new KernelIndicator(tracker));

    void app.restored.then(() => {
      const url = new URL(window.location.href);
      if (/\/lab\/$/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/lab\/$/, '/lab/index.html');
        window.history.replaceState({}, '', url.toString());
      }

      const after = new URL(window.location.href);
      if (after.searchParams.get('tab') === 'notebook') {
        const id = document.querySelector('.jp-NotebookPanel')?.id;
        if (id) {
          app.shell.activateById(id);
          after.searchParams.delete('tab');
          const base = (router?.base || '').replace(/\/$/, '');
          const canonical = new URL(`${base}/lab/index.html`, window.location.origin);
          canonical.hash = after.hash;
          if (
            after.pathname + after.search + after.hash !==
            canonical.pathname + canonical.search + canonical.hash
          ) {
            window.history.replaceState(null, 'Notebook', canonical.toString());
          }
        }
      }
    });

    void contents;
    void mapLanguageToKernel;
  }
};
