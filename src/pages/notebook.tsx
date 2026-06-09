import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { OpenDropdownButton } from '../ui-components/OpenDropdownButton';
import { RunDropdownButton } from '../ui-components/RunDropdownButton';
import { KernelIndicator } from '../ui-components/KernelIndicator';
import { GitHubBrowserWidget } from '../ui-components/GitHubBrowserDialog';
import { ILiteRouter } from '@jupyterlite/application';
import { INotebookTracker, INotebookWidgetFactory } from '@jupyterlab/notebook';
import { INotebookContent } from '@jupyterlab/nbformat';
import {
  Dialog,
  IToolbarWidgetRegistry,
  ISessionContext,
  Notification,
  createToolbarFactory
} from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { MessageLoop } from '@lumino/messaging';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';
import { Commands } from '../commands';
import { KERNEL_URL_TO_NAME, KERNEL_DISPLAY_NAMES } from '../kernels';
import { handleNotebookUpload, openNotebookContent } from '../upload';
import { addRecentNotebook, getRecentNotebooks } from '../recents';

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

function wrapRCodeForAutoprint(code: string): string {
  // Use R raw strings so arbitrary user code is embedded without escaping.
  // Find a delimiter suffix that doesn't collide with anything in the code.
  let d = '';
  while (code.includes(')' + d + '"')) d += '-';
  const open = `r"${d}(`, close = `)${d}"`;
  return (
    `invisible(lapply(as.list(parse(text=${open}\n${code}\n${close})), ` +
    `function(.ck_e) { .ck_r <- withVisible(eval(.ck_e, envir = .GlobalEnv)); ` +
    `if (.ck_r$visible) print(.ck_r$value) }))`
  );
}

function patchXeusR(sessionContext: ISessionContext): void {
  const kernel = sessionContext.session?.kernel;
  if (!kernel || !['xr', 'ir'].includes(kernel.name)) return;
  if ((kernel as any)._ckAutoprintPatched) return;
  (kernel as any)._ckAutoprintPatched = true;

  kernel.requestExecute({ code: 'options(width = 220)', silent: true });

  const orig = kernel.requestExecute.bind(kernel);
  (kernel as any).requestExecute = (
    content: Parameters<typeof orig>[0],
    disposeOnDone?: boolean,
    metadata?: any
  ) => {
    if (!content.silent && content.store_history !== false && content.code?.trim()) {
      content = { ...content, code: wrapRCodeForAutoprint(content.code) };
    }
    return orig(content, disposeOnDone, metadata);
  };
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

    (() => {
      const s = document.createElement('style');
      s.textContent = '.jp-Dialog-button.ck-btn.jp-mod-accept{background:#1a3a5c!important;color:#fff!important;border-color:#1a3a5c!important;text-decoration:none!important;}.jp-Dialog-button.ck-btn.jp-mod-accept *{text-decoration:none!important;}.jp-Dialog-button.ck-btn.jp-mod-reject{background:#fff!important;color:#333!important;border:1px solid #ccc!important;text-decoration:none!important;}.je-GitHubBrowser-browse-btn{background:#1a3a5c!important;color:#fff!important;border-color:#1a3a5c!important;}';
      document.head.appendChild(s);
    })();

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

    let notebookSourceUrl: string | null = null;

    window.addEventListener('beforeunload', (e) => {
      if (tracker.currentWidget?.context.model.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    const openNewNotebookWindow = (kernelParam: 'r' | 'python'): void => {
      const url = new URL(window.location.href);
      url.searchParams.delete('uploaded-notebook');
      url.searchParams.delete('from');
      url.searchParams.delete('tab');
      url.searchParams.set('kernel', kernelParam);
      _ckIntentionalNav = true;
      tracker.forEach(w => { w.context.model.dirty = false; });
      window.location.href = url.toString();
    };

    const createNewNotebook = async (): Promise<void> => {
      notebookSourceUrl = null;
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

        const sourceUrl = localStorage.getItem(`uploaded-notebook-source:${id}`) ?? null;
        const storedName = localStorage.getItem(`uploaded-notebook-name:${id}`) ?? null;

        const content = JSON.parse(raw) as INotebookContent;

        const kernelName = mapLanguageToKernel(content);
        content.metadata.kernelspec = {
          name: kernelName,
          display_name: KERNEL_DISPLAY_NAMES[kernelName] ?? kernelName
        };

        // storedName is the actual filename from the user's disk (e.g. "jim_test.ipynb").
        // Without it, local files get stored as Uploaded_<id>.ipynb in the virtual FS,
        // which breaks the recents lookup (handle.name vs VFS path mismatch).
        const fileNameFromUrl = sourceUrl
          ? (sourceUrl.split('/').pop()?.replace(/\.ipynb$/i, '') ?? null)
          : null;
        const filename =
          storedName ||
          `${(content.metadata?.name as string) || fileNameFromUrl || `Uploaded_${id}`}.ipynb`;

        await contents.save(filename, {
          type: 'notebook',
          format: 'json',
          content
        });

        // DEBUG: log tracker state before docmanager:open
        const preOpenWidgets: string[] = [];
        tracker.forEach(w => { preOpenWidgets.push(`${w.context.path}(dirty=${w.context.model.dirty})`); });
        console.log('[openUploaded] tracker BEFORE open:', preOpenWidgets);

        await commands.execute('docmanager:open', { path: filename });

        // DEBUG: log tracker state after docmanager:open
        const postOpenWidgets: string[] = [];
        tracker.forEach(w => { postOpenWidgets.push(`${w.context.path}(dirty=${w.context.model.dirty})`); });
        console.log('[openUploaded] tracker AFTER open:', postOpenWidgets);

        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('uploaded-notebook');
        window.history.replaceState({}, '', currentUrl.toString());

        notebookSourceUrl = sourceUrl;
        localStorage.removeItem(`uploaded-notebook:${id}`);
        localStorage.removeItem(`uploaded-notebook-name:${id}`);
        if (sourceUrl) {
          localStorage.removeItem(`uploaded-notebook-source:${id}`);
        }
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
        const fileName = fetchUrl.split('/').pop() ?? 'notebook.ipynb';

        addRecentNotebook({ label: `GitHub: ${fileName}`, type: 'github', url: fetchUrl });
        _ckIntentionalNav = true;
        tracker.forEach(w => { w.context.model.dirty = false; });
        await openNotebookContent(parsed, fetchUrl);
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

    const openLocalFile = (): void => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ipynb,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          _ckIntentionalNav = true;
          tracker.forEach(w => { w.context.model.dirty = false; });
          await handleNotebookUpload(file);
        }
      };
      input.click();
    };

    commands.addCommand(Commands.openFromGitHub, {
      label: 'Open from GitHub',
      execute: async () => {
        const widget = new GitHubBrowserWidget();
        const dialog = new Dialog({
          title: 'Open from GitHub',
          body: widget,
          buttons: [Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' })]
        });
        // Document-level capture fires before the Dialog's own capture listener.
        // When Enter is pressed in the URL input we stop the Dialog from eating
        // it and click the internal Open button directly instead.
        const githubEnterHandler = (e: KeyboardEvent) => {
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement && (e.target as HTMLInputElement).classList.contains('je-GitHubBrowser-input')) {
            e.stopImmediatePropagation();
            const openBtn = (e.target as HTMLInputElement).closest('.je-GitHubBrowser')?.querySelector('.je-GitHubBrowser-browse-btn') as HTMLElement | null;
            if (openBtn) openBtn.click();
          }
        };
        document.addEventListener('keydown', githubEnterHandler, true);
        widget.onFileSelected = (url: string) => {
          dialog.resolve(0);
          void openNotebookFromProvidedURL(url);
        };
        await dialog.launch();
        document.removeEventListener('keydown', githubEnterHandler, true);
      }
    });

    commands.addCommand(Commands.copyShareLink, {
      label: 'Copy link to GitHub source',
      isEnabled: () => notebookSourceUrl !== null && !tracker.currentWidget?.context.model.dirty,
      execute: () => {
        if (!notebookSourceUrl) {
          return;
        }
        const shareUrl = new URL(window.location.href);
        shareUrl.search = '';
        shareUrl.searchParams.set('from', notebookSourceUrl);
        void navigator.clipboard.writeText(shareUrl.toString()).then(() => {
          Notification.success(
            'Share link copied. Recipients will see the GitHub version of this notebook.',
            { autoClose: 5000 }
          );
        });
      }
    });

    tracker.currentChanged.connect((_, panel) => {
      if (!panel) return;
      requestAnimationFrame(() => {
        const toolbar = panel.toolbar;
        const w = toolbar.node.clientWidth;
        const h = toolbar.node.clientHeight;
        if (w > 0) {
          MessageLoop.sendMessage(toolbar, new Widget.ResizeMessage(w, h));
        }
      });
    });

    tracker.widgetAdded.connect(async (_, panel) => {
      console.log('[widgetAdded]', panel.context.path, 'dirty=', panel.context.model.dirty);

      // Disable ReactiveToolbar's overflow-to-popup behavior. The toolbar's
      // _resizer is throttled at 500ms; using setTimeout(0) runs before it
      // fires, so we can cancel it and install a no-op. Any items already
      // moved to the popup (on a re-open) are moved back via dataset.jpItemName.
      setTimeout(() => {
        if (panel.isDisposed) return;
        const toolbar = (panel.toolbar as any);
        if (!toolbar) return;
        if (toolbar._resizer) {
          toolbar._resizer.dispose();
        }
        toolbar._resizer = { invoke: () => Promise.resolve(), dispose: () => { /* no-op */ } };
        const opener = toolbar.popupOpener;
        if (opener?.popup) {
          const popup = opener.popup;
          let count: number = popup.widgetCount();
          while (count > 0) {
            const widget = popup.widgetAt(0);
            if (!widget) break;
            const name: string = (widget.node as HTMLElement).dataset['jpItemName'] ?? '';
            if (name) {
              const pos = (toolbar._widgetPositions as Map<string, number>)?.get(name) ?? 0;
              toolbar.insertItem(pos, name, widget);
            }
            const next: number = popup.widgetCount();
            if (next >= count) break;
            count = next;
          }
          opener.hide();
        }
      }, 0);
      // Kernel init (xr in particular) fires spurious dirty events and also
      // updates notebook metadata (kernelspec, language_info) which changes the
      // full toJSON() output. Compare cells only so metadata updates don't
      // look like real user edits.
      await panel.context.ready;
      let _initialCells = JSON.stringify((panel.context.model.toJSON() as INotebookContent).cells ?? []);
      panel.context.model.dirty = false;
      panel.context.model.stateChanged.connect(() => {
        if (!panel.context.model.dirty) return;
        const currentCells = JSON.stringify((panel.context.model.toJSON() as INotebookContent).cells ?? []);
        if (currentCells === _initialCells) {
          console.log('[CK] spurious dirty (cells unchanged) → clearing', panel.context.path);
          panel.context.model.dirty = false;
        }
      });
      await panel.sessionContext.ready;
      // Re-baseline after kernel init: the kernel may modify cells (clear execution
      // counts, add ids, etc.) between context.ready and sessionContext.ready, causing
      // the stateChanged guard to miss spurious dirty events. Re-snapshot and clear.
      _initialCells = JSON.stringify((panel.context.model.toJSON() as INotebookContent).cells ?? []);
      panel.context.model.dirty = false;

      const url = new URL(window.location.href);
      if (url.searchParams.has('kernel')) {
        url.searchParams.delete('kernel');
        window.history.replaceState({}, '', url.toString());
        console.log('Removed kernel param from URL after kernel init.');
      }

      panel.sessionContext.kernelChanged.connect(patchXeusR);
      patchXeusR(panel.sessionContext);
      panel.sessionContext.kernelChanged.connect(patchPyodideHttp);
      await patchPyodideHttp(panel.sessionContext);

      // Spin the run button while the kernel is busy executing a cell.
      // We snapshot the active cell's run button at the moment busy fires so
      // we remove the class from the right button even if the user navigates
      // away before execution finishes.
      let _executingBtn: Element | null = null;
      panel.sessionContext.statusChanged.connect((_, status) => {
        if (status === 'busy') {
          _executingBtn = panel.content.activeCell?.node.querySelector('.je-cell-run-button') ?? null;
          _executingBtn?.classList.add('je-cell-running');
        } else {
          _executingBtn?.classList.remove('je-cell-running');
          _executingBtn = null;
        }
      });
    });

    // Capture-phase beforeunload listener runs before JupyterLab's bubble-phase handler.
    // The xr kernel can set dirty=true asynchronously between our sync dirty-clear and
    // when beforeunload actually fires. Re-clearing here ensures JupyterLab's handler
    // sees dirty=false for intentional recents navigations.
    let _ckIntentionalNav = false;
    window.addEventListener(
      'beforeunload',
      () => {
        if (_ckIntentionalNav) {
          tracker.forEach(w => { w.context.model.dirty = false; });
        }
      },
      true
    );

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
            openLocalFile();
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
          },
          () => {
            void commands.execute(Commands.openFromGitHub);
          },
          () => {
            void commands.execute(Commands.copyShareLink);
          },
          () => notebookSourceUrl !== null && !tracker.currentWidget?.context.model.dirty,
          () =>
            getRecentNotebooks().map(nb => ({
              label: nb.label,
              open: () => {
                void openNotebookFromProvidedURL(nb.url ?? '');
              },
              isCurrent: () => notebookSourceUrl === nb.url
            }))
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
