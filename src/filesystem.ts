const DB_NAME = 'jupytereverywhere-fs';
const DB_VERSION = 1;
const STORE_NAME = 'fileHandles';

// Shared state — both index.ts and notebook.tsx import this
let _currentFileHandle: FileSystemFileHandle | null = null;

export function getCurrentFileHandle(): FileSystemFileHandle | null {
  return _currentFileHandle;
}

export function setCurrentFileHandle(handle: FileSystemFileHandle | null): void {
  _currentFileHandle = handle;
}

export function isFileSystemAccessSupported(): boolean {
  return typeof (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker ===
    'function';
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function pickNotebookFile(): Promise<{
  handle: FileSystemFileHandle;
  text: string;
} | null> {
  type ShowOpenFilePicker = (opts: unknown) => Promise<FileSystemFileHandle[]>;
  const picker = (window as unknown as { showOpenFilePicker: ShowOpenFilePicker })
    .showOpenFilePicker;
  try {
    const [handle] = await picker({
      types: [{ description: 'Jupyter Notebooks', accept: { 'application/json': ['.ipynb'] } }],
      multiple: false
    });
    const file = await handle.getFile();
    const text = await file.text();
    return { handle, text };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

export async function pickSaveLocation(suggestedName: string): Promise<FileSystemFileHandle | null> {
  type ShowSaveFilePicker = (opts: unknown) => Promise<FileSystemFileHandle>;
  const picker = (window as unknown as { showSaveFilePicker: ShowSaveFilePicker })
    .showSaveFilePicker;
  try {
    return await picker({
      suggestedName,
      types: [{ description: 'Jupyter Notebooks', accept: { 'application/json': ['.ipynb'] } }]
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

export async function saveToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  type FSAHandle = FileSystemFileHandle & {
    queryPermission(o: { mode: string }): Promise<PermissionState>;
    requestPermission(o: { mode: string }): Promise<PermissionState>;
  };
  const fsa = handle as FSAHandle;
  let perm = await fsa.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    perm = await fsa.requestPermission({ mode: 'readwrite' });
  }
  if (perm !== 'granted') {
    throw new Error('Permission denied');
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function storeHandleForUpload(
  uploadId: string,
  handle: FileSystemFileHandle
): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, uploadId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function retrieveHandleForUpload(
  uploadId: string
): Promise<FileSystemFileHandle | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(uploadId);
    getReq.onsuccess = () => {
      store.delete(uploadId);
      db.close();
      resolve((getReq.result as FileSystemFileHandle) ?? null);
    };
    getReq.onerror = () => {
      db.close();
      reject(getReq.error);
    };
  });
}

export async function storeRecentHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, `recent:${key}`);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function retrieveRecentHandle(key: string): Promise<FileSystemFileHandle | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(`recent:${key}`);
    req.onsuccess = () => { db.close(); resolve((req.result as FileSystemFileHandle) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
