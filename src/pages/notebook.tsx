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
  createToolbarFactory,
  showErrorMessage
} from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { UUID } from '@lumino/coreutils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator } from '@jupyterlab/translation';
import { Commands } from '../commands';
import { KERNEL_URL_TO_NAME, KERNEL_DISPLAY_NAMES } from '../kernels';
import { detectNotebookLanguage, handleNotebookUpload, openNotebookContent } from '../upload';
import {
  getCurrentFileHandle,
  setCurrentFileHandle,
  isFileSystemAccessSupported,
  pickNotebookFile,
  pickSaveLocation,
  saveToHandle,
  storeHandleForUpload,
  retrieveHandleForUpload,
  storeRecentHandle,
  retrieveRecentHandle
} from '../filesystem';
import { RecentNotebook, addRecentNotebook, getRecentNotebooks, removeRecentNotebook } from '../recents';

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

    // Snapshot all open notebooks that have a VFS cache entry into sessionStorage.
    // Call this before any page redirect so reopening from recents restores edits.
    const flushVfsCaches = () => {
      tracker.forEach(w => {
        const path = w.context.path;
        if (sessionStorage.getItem(`vfs-cache:${path}`) !== null) {
          try {
            sessionStorage.setItem(`vfs-cache:${path}`, JSON.stringify(w.context.model.toJSON()));
          } catch { /* ignore quota errors */ }
        }
      });
    };

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

    const fsaSupported = isFileSystemAccessSupported();
    if (!fsaSupported && !sessionStorage.getItem('ck-fsa-notice')) {
      sessionStorage.setItem('ck-fsa-notice', '1');
      setTimeout(() => {
        Notification.info(
          "File saving isn't supported in this browser — use \"Download notebook\" to save your work.",
          { autoClose: 10000 }
        );
      }, 2000);
    }

    const openNewNotebookWindow = async (kernelParam: 'r' | 'python'): Promise<void> => {
      const currentWidget = tracker.currentWidget;
      if (fsaSupported && currentWidget && currentWidget.context.model.dirty) {
        const result = await showDialog({
          title: 'Unsaved Notebook',
          body: `"${currentWidget.context.path}" has unsaved changes.`,
          buttons: [
            Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
            Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
            Dialog.okButton({ label: fsaSupported ? 'Save' : 'Download', className: 'ck-btn' })
          ]
        });
        if (result.button.label === 'Cancel') return;
        if (result.button.accept) {
          await commands.execute(Commands.saveNotebookCommand);
        }
      }
      if (!fsaSupported && currentWidget && currentWidget.context.model.dirty) {
        const _hasCache = sessionStorage.getItem(`vfs-cache:${currentWidget.context.path}`) !== null;
        if (!_hasCache) {
          const _ni = document.createElement('input');
          _ni.value = currentWidget.context.path.replace(/\.ipynb$/i, '') || 'my-notebook';
          _ni.style.cssText = 'width:100%;box-sizing:border-box;padding:8px';
          const _nb = new Widget();
          _nb.node.appendChild(_ni);
          const _r = await showDialog({
            title: 'Name your new notebook',
            body: _nb,
            buttons: [
              Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
              Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
              Dialog.okButton({ label: 'Save to browser', className: 'ck-btn' })
            ]
          });
          if (_r.button.label === 'Cancel') return;
          if (_r.button.accept) {
            const _rn = _ni.value.trim() || 'my-notebook';
            const _fn = _rn.toLowerCase().endsWith('.ipynb') ? _rn : `${_rn}.ipynb`;
            try { sessionStorage.setItem(`vfs-cache:${_fn}`, JSON.stringify(currentWidget.context.model.toJSON())); } catch {}
            addRecentNotebook({ label: _fn, type: 'vfs', path: _fn });
          }
        }
      }
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
      setCurrentFileHandle(null);
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
        const fileHandle = await retrieveHandleForUpload(id);
        setCurrentFileHandle(fileHandle);
        const fromCache = localStorage.getItem(`uploaded-notebook-from-cache:${id}`) === '1';
        localStorage.removeItem(`uploaded-notebook-from-cache:${id}`);
        if (!fileHandle && !sourceUrl) {
          try {
            sessionStorage.setItem(`vfs-cache:${filename}`, JSON.stringify(content));
          } catch { /* ignore quota errors */ }
          addRecentNotebook({ label: filename, type: 'vfs', path: filename });
        }
        if (!fromCache) {
          try { sessionStorage.setItem(`ck-last-downloaded:${filename}`, JSON.stringify(content.cells ?? [])); } catch {}
        }
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

        const currentWidget = tracker.currentWidget;
        if (fsaSupported && currentWidget && currentWidget.context.model.dirty) {
          const result = await showDialog({
            title: 'Unsaved Notebook',
            body: `"${currentWidget.context.path}" has unsaved changes.`,
            buttons: [
              Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
              Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
              Dialog.okButton({ label: 'Save', className: 'ck-btn' })
            ]
          });
          if (result.button.label === 'Cancel') return;
          if (result.button.accept) {
            await commands.execute(Commands.saveNotebookCommand);
          }
        }
        if (!fsaSupported && currentWidget && currentWidget.context.model.dirty) {
          const _hasCache = sessionStorage.getItem(`vfs-cache:${currentWidget.context.path}`) !== null;
          if (!_hasCache) {
            const _ni = document.createElement('input');
            _ni.value = currentWidget.context.path.replace(/\.ipynb$/i, '') || 'my-notebook';
            _ni.style.cssText = 'width:100%;box-sizing:border-box;padding:8px';
            const _nb = new Widget();
            _nb.node.appendChild(_ni);
            const _r = await showDialog({
              title: 'Name your new notebook',
              body: _nb,
              buttons: [
                Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
                Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
                Dialog.okButton({ label: 'Save to browser', className: 'ck-btn' })
              ]
            });
            if (_r.button.label === 'Cancel') return;
            if (_r.button.accept) {
              const _rn = _ni.value.trim() || 'my-notebook';
              const _fn = _rn.toLowerCase().endsWith('.ipynb') ? _rn : `${_rn}.ipynb`;
              try { sessionStorage.setItem(`vfs-cache:${_fn}`, JSON.stringify(currentWidget.context.model.toJSON())); } catch {}
              addRecentNotebook({ label: _fn, type: 'vfs', path: _fn });
            }
          }
        }

        addRecentNotebook({ label: `GitHub: ${fileName}`, type: 'github', url: fetchUrl });
        flushVfsCaches();
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

    const openLocalFile = async (): Promise<void> => {
      const currentWidget = tracker.currentWidget;
      if (fsaSupported && currentWidget && currentWidget.context.model.dirty) {
        const result = await showDialog({
          title: 'Unsaved Notebook',
          body: `"${currentWidget.context.path}" has unsaved changes.`,
          buttons: [
            Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
            Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
            Dialog.okButton({ label: fsaSupported ? 'Save' : 'Download', className: 'ck-btn' })
          ]
        });
        if (result.button.label === 'Cancel') return;
        if (result.button.accept) {
          await commands.execute(Commands.saveNotebookCommand);
        }
      }
      if (!fsaSupported && currentWidget && currentWidget.context.model.dirty) {
        const _hasCache = sessionStorage.getItem(`vfs-cache:${currentWidget.context.path}`) !== null;
        if (!_hasCache) {
          const _ni = document.createElement('input');
          _ni.value = currentWidget.context.path.replace(/\.ipynb$/i, '') || 'my-notebook';
          _ni.style.cssText = 'width:100%;box-sizing:border-box;padding:8px';
          const _nb = new Widget();
          _nb.node.appendChild(_ni);
          const _r = await showDialog({
            title: 'Name your new notebook',
            body: _nb,
            buttons: [
              Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
              Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
              Dialog.okButton({ label: 'Save to browser', className: 'ck-btn' })
            ]
          });
          if (_r.button.label === 'Cancel') return;
          if (_r.button.accept) {
            const _rn = _ni.value.trim() || 'my-notebook';
            const _fn = _rn.toLowerCase().endsWith('.ipynb') ? _rn : `${_rn}.ipynb`;
            try { sessionStorage.setItem(`vfs-cache:${_fn}`, JSON.stringify(currentWidget.context.model.toJSON())); } catch {}
            addRecentNotebook({ label: _fn, type: 'vfs', path: _fn });
          }
        }
      }
      if (!isFileSystemAccessSupported()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ipynb,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            flushVfsCaches();
            _ckIntentionalNav = true;
            tracker.forEach(w => { w.context.model.dirty = false; });
            await handleNotebookUpload(file);
          }
        };
        input.click();
        return;
      }

      let picked: { handle: FileSystemFileHandle; text: string } | null;
      try {
        picked = await pickNotebookFile();
      } catch (err) {
        await showErrorMessage('Failed to open file', err instanceof Error ? err.message : String(err));
        return;
      }
      if (!picked) {
        return;
      }

      const { handle, text } = picked;
      let parsed: INotebookContent;
      try {
        parsed = JSON.parse(text) as INotebookContent;
      } catch {
        await showErrorMessage('Invalid notebook', 'The selected file is not a valid notebook.');
        return;
      }

      if (!detectNotebookLanguage(parsed)) {
        await showErrorMessage(
          'Please open a valid notebook',
          'Only Python and R notebooks are supported.'
        );
        return;
      }

      const uploadId = UUID.uuid4();
      localStorage.setItem(`uploaded-notebook:${uploadId}`, text);
      localStorage.setItem(`uploaded-notebook-name:${uploadId}`, handle.name);
      await storeHandleForUpload(uploadId, handle);

      const recentKey = UUID.uuid4();
      await storeRecentHandle(recentKey, handle);
      addRecentNotebook({ label: handle.name, type: 'file', handleKey: recentKey });

      const target = new URL(window.location.href);
      target.search = '';
      target.searchParams.set('uploaded-notebook', uploadId);
      target.hash = '';
      flushVfsCaches();
      _ckIntentionalNav = true;
      tracker.forEach(w => { w.context.model.dirty = false; });
      window.location.href = target.toString();
    };

    const openRecentNotebook = async (nb: RecentNotebook): Promise<void> => {
      if (nb.type === 'github' && nb.url) {
        await openNotebookFromProvidedURL(nb.url);
        return;
      }
      if (nb.type === 'vfs' && nb.path) {
        // Fast path: notebook already open
        let existingId: string | null = null;
        tracker.forEach(w => {
          if (!existingId && w.context.path === nb.path) existingId = w.id;
        });
        if (existingId) {
          app.shell.activateById(existingId);
          notebookSourceUrl = null;
          addRecentNotebook(nb);
          return;
        }
        const cached = sessionStorage.getItem(`vfs-cache:${nb.path}`);
        if (!cached) {
          Notification.warning(
            'Could not reopen the notebook — try "Open from file" to upload it again.',
            { autoClose: 4000 }
          );
          return;
        }
        const uploadId = UUID.uuid4();
        localStorage.setItem(`uploaded-notebook:${uploadId}`, cached);
        localStorage.setItem(`uploaded-notebook-name:${uploadId}`, nb.path);
        localStorage.setItem(`uploaded-notebook-from-cache:${uploadId}`, '1');
        addRecentNotebook(nb);
        const target = new URL(window.location.href);
        target.search = '';
        target.searchParams.set('uploaded-notebook', uploadId);
        target.hash = '';
        flushVfsCaches();
        _ckIntentionalNav = true;
        tracker.forEach(w => { w.context.model.dirty = false; });
        window.location.href = target.toString();
        return;
      }
      if (nb.type === 'file' && nb.handleKey) {
        const handle = await retrieveRecentHandle(nb.handleKey);
        if (!handle) {
          Notification.warning('Could not find the saved file. Please use "Open from file" instead.', {
            autoClose: 4000
          });
          return;
        }
        try {
          type FSAHandle = FileSystemFileHandle & {
            queryPermission(o: { mode: string }): Promise<PermissionState>;
            requestPermission(o: { mode: string }): Promise<PermissionState>;
          };
          const fsa = handle as FSAHandle;

          // Check fast path first — activating an already-open widget needs no disk access
          let existingId: string | null = null;
          const trackerPaths: string[] = [];
          tracker.forEach(w => {
            trackerPaths.push(`${w.context.path}(dirty=${w.context.model.dirty})`);
            if (!existingId && w.context.path === handle.name) {
              existingId = w.id;
            }
          });
          if (existingId) {
            tracker.forEach(w => { w.context.model.dirty = false; });
            app.shell.activateById(existingId);
            notebookSourceUrl = null;
            setCurrentFileHandle(handle);
            addRecentNotebook(nb);
            return;
          }

          // Slow path: need to read file from disk — only read permission required here;
          // write permission is requested lazily when the user clicks "Save to file"
          let perm = await fsa.queryPermission({ mode: 'read' });
          if (perm !== 'granted') {
            perm = await fsa.requestPermission({ mode: 'read' });
          }
          if (perm !== 'granted') {
            Notification.warning('Permission denied. Please use "Open from file" instead.', {
              autoClose: 4000
            });
            return;
          }

          // File is not currently open. Use the same redirect flow as "Open from file":
          // writing directly to VFS + docmanager:open causes a spurious "save changes?"
          // dialog because the fileChanged event from contents.save races with the new
          // context created by docmanager:open. The redirect flow avoids this entirely.
          const diskFile = await handle.getFile();
          const text = await diskFile.text();
          const uploadId = UUID.uuid4();
          localStorage.setItem(`uploaded-notebook:${uploadId}`, text);
          localStorage.setItem(`uploaded-notebook-name:${uploadId}`, handle.name);
          await storeHandleForUpload(uploadId, handle);
          addRecentNotebook(nb);

          const target = new URL(window.location.href);
          target.search = '';
          target.searchParams.set('uploaded-notebook', uploadId);
          target.hash = '';

          // Warn only if the current notebook has unsaved edits.
          const currentWidget = tracker.currentWidget;
          if (currentWidget) {
            const isDirty = currentWidget.context.model.dirty;
            if (isDirty) {
              const result = await showDialog({
                title: 'Unsaved Notebook',
                body: `"${currentWidget.context.path}" has unsaved changes.`,
                buttons: [
                  Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
                  Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
                  Dialog.okButton({ label: fsaSupported ? 'Save' : 'Download', className: 'ck-btn' })
                ]
              });
              if (result.button.label === 'Cancel') {
                return;
              }
              if (result.button.label === 'Save') {
                await commands.execute(Commands.saveNotebookCommand);
              }
            }
          }

          flushVfsCaches();
          _ckIntentionalNav = true;
          tracker.forEach(w => { w.context.model.dirty = false; });
          window.location.href = target.toString();
        } catch {
          Notification.warning('Could not open the file. Please use "Open from file" instead.', {
            autoClose: 4000
          });
        }
      }
    };

    commands.addCommand(Commands.saveToFile, {
      label: 'Save as…',
      execute: async () => {
        const panel = tracker.currentWidget;
        if (!panel) {
          return;
        }

        if (!fsaSupported) {
          await commands.execute(Commands.downloadNotebookCommand);
          return;
        }

        const content = panel.context.model.toJSON() as INotebookContent;
        const text = JSON.stringify(content, null, 2);

        let suggestedName =
          panel.context.path && panel.context.path !== 'Untitled.ipynb'
            ? panel.context.path
            : 'notebook.ipynb';
        if (notebookSourceUrl !== null) {
          suggestedName = suggestedName.replace(/\.ipynb$/i, '_copy.ipynb');
        }
        const handle = await pickSaveLocation(suggestedName);
        if (!handle) {
          return;
        }

        try {
          await saveToHandle(handle, text);
          setCurrentFileHandle(handle);
          const recentKey = UUID.uuid4();
          await storeRecentHandle(recentKey, handle);
          addRecentNotebook({ label: handle.name, type: 'file', handleKey: recentKey });
          await panel.context.save();
          Notification.success('Saved.', { autoClose: 2000 });
        } catch (err) {
          console.error('Failed to save to file:', err);
          Notification.warning('Could not save to file.', { autoClose: 4000 });
        }
      }
    });

    commands.addCommand(Commands.closeNotebook, {
      label: 'Close notebook',
      execute: async () => {
        const panel = tracker.currentWidget;

        if (fsaSupported && panel && panel.context.model.dirty) {
          const result = await showDialog({
            title: 'Unsaved Notebook',
            body: `"${panel.context.path}" has unsaved changes.`,
            buttons: [
              Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
              Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
              Dialog.okButton({ label: 'Save', className: 'ck-btn' })
            ]
          });
          if (result.button.label === 'Cancel') return;
          if (result.button.accept) {
            await commands.execute(Commands.saveNotebookCommand);
          }
        }
        if (!fsaSupported && panel) {
          const _lastDl = sessionStorage.getItem(`ck-last-downloaded:${panel.context.path}`);
          const _currentCells = JSON.stringify((panel.context.model.toJSON() as INotebookContent).cells ?? []);
          const _hasCache = sessionStorage.getItem(`vfs-cache:${panel.context.path}`) !== null;
          if (_lastDl === null ? _currentCells !== '[]' : _lastDl !== _currentCells) {
            if (!_hasCache) {
              const _ni = document.createElement('input');
              _ni.value = panel.context.path.replace(/\.ipynb$/i, '') || 'my-notebook';
              _ni.style.cssText = 'width:100%;box-sizing:border-box;padding:8px';
              const _nb = new Widget();
              _nb.node.appendChild(_ni);
              const _r = await showDialog({
                title: 'Name your new notebook',
                body: _nb,
                buttons: [
                  Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
                  Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
                  Dialog.okButton({ label: 'Save to browser', className: 'ck-btn' })
                ]
              });
              if (_r.button.label === 'Cancel') return;
              if (_r.button.accept) {
                const _rn = _ni.value.trim() || 'my-notebook';
                const _fn = _rn.toLowerCase().endsWith('.ipynb') ? _rn : `${_rn}.ipynb`;
                try { sessionStorage.setItem(`vfs-cache:${_fn}`, JSON.stringify(panel.context.model.toJSON())); } catch {}
                addRecentNotebook({ label: _fn, type: 'vfs', path: _fn });
              }
            } else {
              const _rd = await showDialog({
                title: 'Close notebook',
                body: 'Download a copy to your device before closing? Your changes are saved in the browser.',
                buttons: [
                  Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
                  Dialog.cancelButton({ label: 'Close', className: 'ck-btn' }),
                  Dialog.okButton({ label: 'Download', className: 'ck-btn' })
                ]
              });
              if (_rd.button.label === 'Cancel') return;
              if (_rd.button.accept) {
                await commands.execute(Commands.downloadNotebookCommand);
              }
            }
          }
        }

        const handle = getCurrentFileHandle();
        if (handle) {
          removeRecentNotebook({ label: handle.name });
        } else if (notebookSourceUrl !== null) {
          removeRecentNotebook({ url: notebookSourceUrl });
        } else if (panel) {
          removeRecentNotebook({ label: panel.context.path });
        }

        const _nextRecents = getRecentNotebooks();
        flushVfsCaches();
        _ckIntentionalNav = true;
        tracker.forEach(w => { w.context.model.dirty = false; });

        if (_nextRecents.length > 0) {
          const _next = _nextRecents[0];
          if (_next.type === 'vfs' && _next.path) {
            const _cachedNext = sessionStorage.getItem(`vfs-cache:${_next.path}`);
            if (_cachedNext) {
              const _uid = UUID.uuid4();
              localStorage.setItem(`uploaded-notebook:${_uid}`, _cachedNext);
              localStorage.setItem(`uploaded-notebook-name:${_uid}`, _next.path);
              localStorage.setItem(`uploaded-notebook-from-cache:${_uid}`, '1');
              const _t = new URL(window.location.href);
              _t.search = '';
              _t.searchParams.set('uploaded-notebook', _uid);
              _t.hash = '';
              window.location.href = _t.toString();
              return;
            }
          } else if (_next.type === 'github' && _next.url) {
            const _t = new URL(window.location.href);
            _t.search = '';
            _t.searchParams.set('from', _next.url);
            _t.hash = '';
            window.location.href = _t.toString();
            return;
          } else if (_next.type === 'file') {
            await openRecentNotebook(_next);
            return;
          }
        }

        const _blankUrl = new URL(window.location.href);
        _blankUrl.search = '';
        _blankUrl.hash = '';
        window.location.href = _blankUrl.toString();
      }
    });

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
      label: 'Copy share link to GitHub version',
      isEnabled: () => notebookSourceUrl !== null,
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

    tracker.widgetAdded.connect(async (_, panel) => {
      console.log('[widgetAdded]', panel.context.path, 'dirty=', panel.context.model.dirty);
      // Kernel init (xr in particular) fires spurious dirty events and also
      // updates notebook metadata (kernelspec, language_info) which changes the
      // full toJSON() output. Compare cells only so metadata updates don't
      // look like real user edits.
      await panel.context.ready;
      const _initialCells = JSON.stringify((panel.context.model.toJSON() as INotebookContent).cells ?? []);
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

      const url = new URL(window.location.href);
      if (url.searchParams.has('kernel')) {
        url.searchParams.delete('kernel');
        window.history.replaceState({}, '', url.toString());
        console.log('Removed kernel param from URL after kernel init.');
      }

      panel.sessionContext.kernelChanged.connect(patchPyodideHttp);
      await patchPyodideHttp(panel.sessionContext);
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
            void openLocalFile();
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
          () => notebookSourceUrl !== null,
          () => {
            void commands.execute(Commands.saveNotebookCommand);
          },
          () => !!getCurrentFileHandle() && !!tracker.currentWidget?.context.model.dirty,
          () => {
            void commands.execute(Commands.saveToFile);
          },
          () => {
            void commands.execute(Commands.closeNotebook);
          },
          () =>
            getRecentNotebooks().map(nb => ({
              label: nb.label,
              open: () => {
                void openRecentNotebook(nb);
              },
              isCurrent: () => {
                const handle = getCurrentFileHandle();
                if (nb.type === 'file') {
                  return handle !== null && handle.name === nb.label;
                }
                if (nb.type === 'vfs') {
                  return !handle && tracker.currentWidget?.context.path === nb.path;
                }
                return handle === null && notebookSourceUrl === nb.url;
              }
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
