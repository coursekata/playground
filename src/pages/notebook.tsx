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
  showDialog,
  showErrorMessage
} from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { MessageLoop } from '@lumino/messaging';
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
import { showSavedToast } from '../notebook-utils';

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

    window.addEventListener('beforeunload', (e) => {
      if (tracker.currentWidget?.context.model.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    const fsaSupported = isFileSystemAccessSupported();

    // Returns true if it's safe to navigate away (no unsaved changes, or user resolved them).
    // Handles all three cases: Chrome+handle → Save, Chrome+no-handle → Save as file, Safari → Save in browser.
    const promptIfDirty = async (): Promise<boolean> => {
      const currentWidget = tracker.currentWidget;
      if (!currentWidget || !currentWidget.context.model.dirty) return true;

      const hasHandle = !!getCurrentFileHandle();
      const saveLabel = hasHandle ? 'Save' : fsaSupported ? 'Save as file' : 'Save in browser';

      const result = await showDialog({
        title: 'Unsaved Changes',
        body: `"${currentWidget.context.path}" has unsaved changes.`,
        buttons: [
          Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
          Dialog.cancelButton({ label: 'Discard', className: 'ck-btn' }),
          Dialog.okButton({ label: saveLabel, className: 'ck-btn' })
        ]
      });

      if (result.button.label === 'Cancel') return false;
      if (result.button.accept) {
        if (hasHandle || !fsaSupported) {
          await commands.execute(Commands.saveNotebookCommand);
        } else {
          await commands.execute(Commands.saveToFile); // Chrome, no handle → file picker
        }
      }
      return true;
    };

    const openNewNotebookWindow = async (kernelParam: 'r' | 'python'): Promise<void> => {
      if (!await promptIfDirty()) return;
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

        if (!await promptIfDirty()) return;

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
      if (!await promptIfDirty()) return;
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
      try {
        localStorage.setItem(`uploaded-notebook:${uploadId}`, text);
        localStorage.setItem(`uploaded-notebook-name:${uploadId}`, handle.name);
      } catch (err) {
        const isQuota = err instanceof DOMException && err.name === 'QuotaExceededError';
        Notification.error(
          isQuota
            ? 'Browser storage is full. Try File → Clear storage to free space.'
            : 'Could not stage notebook for opening.',
          { autoClose: 6000 }
        );
        return;
      }
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
        try {
          localStorage.setItem(`uploaded-notebook:${uploadId}`, cached);
          localStorage.setItem(`uploaded-notebook-name:${uploadId}`, nb.path);
          localStorage.setItem(`uploaded-notebook-from-cache:${uploadId}`, '1');
        } catch (err) {
          const isQuota = err instanceof DOMException && err.name === 'QuotaExceededError';
          Notification.error(
            isQuota
              ? 'Browser storage is full. Try File → Clear storage to free space.'
              : 'Could not stage notebook for opening.',
            { autoClose: 6000 }
          );
          return;
        }
        addRecentNotebook(nb);
        if (!await promptIfDirty()) return;
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
          try {
            localStorage.setItem(`uploaded-notebook:${uploadId}`, text);
            localStorage.setItem(`uploaded-notebook-name:${uploadId}`, handle.name);
          } catch (err) {
            const isQuota = err instanceof DOMException && err.name === 'QuotaExceededError';
            Notification.error(
              isQuota
                ? 'Browser storage is full. Try File → Clear storage to free space.'
                : 'Could not stage notebook for opening.',
              { autoClose: 6000 }
            );
            return;
          }
          await storeHandleForUpload(uploadId, handle);
          addRecentNotebook(nb);

          const target = new URL(window.location.href);
          target.search = '';
          target.searchParams.set('uploaded-notebook', uploadId);
          target.hash = '';

          if (!await promptIfDirty()) return;

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
      label: 'Save as file…',
      execute: async () => {
        const panel = tracker.currentWidget;
        if (!panel) {
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
          notebookSourceUrl = null;
          const recentKey = UUID.uuid4();
          await storeRecentHandle(recentKey, handle);
          addRecentNotebook({ label: handle.name, type: 'file', handleKey: recentKey });
          await panel.context.save();
          showSavedToast();
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
        const handle = getCurrentFileHandle();
        const canSaveToFile = typeof (window as any).showSaveFilePicker === 'function';

        // VFS notebook: closing deletes it from browser storage, so we need a
        // tailored prompt that warns about that and (on Chrome) offers Save as file.
        const isVfs = !handle && notebookSourceUrl === null
          && !!panel && !!panel.context.path && panel.context.path !== 'Untitled.ipynb';

        if (isVfs) {
          const isDirty = panel!.context.model.dirty;
          const name = panel!.context.path;
          const body = isDirty
            ? `"${name}" has unsaved changes. Closing will remove it from browser storage.`
            : `Closing "${name}" will remove it from browser storage.`;

          const buttons = [
            Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
            Dialog.cancelButton({ label: 'Close', className: 'ck-btn' }),
            ...(canSaveToFile ? [Dialog.okButton({ label: 'Save as file', className: 'ck-btn' })] : [])
          ];

          const result = await showDialog({ title: 'Close notebook', body, buttons });
          if (result.button.label === 'Cancel' || (!result.button.accept && result.button.label !== 'Close')) return;

          if (result.button.label === 'Save as file') {
            await commands.execute(Commands.saveToFile);
            // If user cancelled the file picker, file handle is still null — abort close
            if (!getCurrentFileHandle()) return;
          }

          // Delete the notebook from VFS to free storage
          try { await serviceManager.contents.delete(panel!.context.path); } catch { /* ignore */ }
          try { sessionStorage.removeItem(`vfs-cache:${panel!.context.path}`); } catch { /* ignore */ }
        } else {
          if (!await promptIfDirty()) return;
        }

        const currentHandle = getCurrentFileHandle();
        if (currentHandle) {
          removeRecentNotebook({ label: currentHandle.name });
        } else if (notebookSourceUrl !== null) {
          removeRecentNotebook({ url: notebookSourceUrl });
        } else if (panel) {
          removeRecentNotebook({ label: panel.context.path });
        }

        const _nextRecents = getRecentNotebooks();
        flushVfsCaches();
        _ckIntentionalNav = true;
        tracker.forEach(w => { w.context.model.dirty = false; });

        for (const _next of _nextRecents) {
          if (_next.type === 'vfs' && _next.path) {
            const _cachedNext = sessionStorage.getItem(`vfs-cache:${_next.path}`);
            if (!_cachedNext) continue; // stale entry — try next recent
            const _uid = UUID.uuid4();
            try {
              localStorage.setItem(`uploaded-notebook:${_uid}`, _cachedNext);
              localStorage.setItem(`uploaded-notebook-name:${_uid}`, _next.path);
              localStorage.setItem(`uploaded-notebook-from-cache:${_uid}`, '1');
            } catch {
              continue; // storage full — skip this notebook, try next recent
            }
            const _t = new URL(window.location.href);
            _t.search = '';
            _t.searchParams.set('uploaded-notebook', _uid);
            _t.hash = '';
            window.location.href = _t.toString();
            return;
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

        await createNewNotebook();
      }
    });

    commands.addCommand(Commands.clearStorage, {
      label: 'Clear storage',
      execute: async () => {
        const dirtyPaths: string[] = [];
        tracker.forEach(w => {
          if (w.context.model.dirty) dirtyPaths.push(w.context.path);
        });

        const body = dirtyPaths.length > 0
          ? `This will close all notebooks and delete all stored data from your browser. The following notebooks have unsaved changes that will be lost: "${dirtyPaths.join('", "')}".`
          : 'This will close all notebooks and delete all stored data from your browser. This cannot be undone.';

        const result = await showDialog({
          title: 'Clear storage',
          body,
          buttons: [
            Dialog.cancelButton({ label: 'Cancel', className: 'ck-btn' }),
            Dialog.okButton({ label: 'Clear storage', className: 'ck-btn' })
          ]
        });
        if (!result.button.accept) return;

        // Clear localStorage (notebook content + recents)
        const lsKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('uploaded-notebook') || k === 'jupytereverywhere:recent-notebooks')) {
            lsKeys.push(k);
          }
        }
        lsKeys.forEach(k => localStorage.removeItem(k));

        // Clear sessionStorage (VFS caches + download history)
        const ssKeys: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith('vfs-cache:') || k.startsWith('ck-last-downloaded:') || k === 'ck-fsa-notice')) {
            ssKeys.push(k);
          }
        }
        ssKeys.forEach(k => sessionStorage.removeItem(k));

        // Clear IndexedDB (file handles)
        indexedDB.deleteDatabase('jupytereverywhere-fs');
        setCurrentFileHandle(null);

        _ckIntentionalNav = true;
        tracker.forEach(w => { w.context.model.dirty = false; });
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.location.href = url.toString();
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
          () => notebookSourceUrl !== null && !tracker.currentWidget?.context.model.dirty,
          () => {
            void commands.execute(Commands.saveNotebookCommand);
          },
          () => !!tracker.currentWidget?.context.model.dirty,
          () => {
            void commands.execute(Commands.saveToFile);
          },
          () => {
            void commands.execute(Commands.closeNotebook);
          },
          () => {
            void commands.execute(Commands.clearStorage);
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
