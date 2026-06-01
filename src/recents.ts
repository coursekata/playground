const RECENTS_KEY = 'jupytereverywhere:recent-notebooks';
const MAX_RECENTS = 5;
const VFS_NOTEBOOK_LIMIT = 10;

export type RecentNotebook = {
  label: string;
  type: 'github' | 'file' | 'vfs';
  url?: string;
  handleKey?: string;
  path?: string;
};

export function getRecentNotebooks(): RecentNotebook[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as RecentNotebook[];
  } catch {
    return [];
  }
}

export function addRecentNotebook(nb: RecentNotebook): void {
  const existing = getRecentNotebooks().filter(r =>
    nb.url ? r.url !== nb.url : r.label !== nb.label
  );
  localStorage.setItem(RECENTS_KEY, JSON.stringify([nb, ...existing].slice(0, MAX_RECENTS)));
}

export function removeRecentNotebook(nb: { label?: string; url?: string }): void {
  const existing = getRecentNotebooks().filter(r =>
    nb.url ? r.url !== nb.url : r.label !== nb.label
  );
  localStorage.setItem(RECENTS_KEY, JSON.stringify(existing));
}

// Evicts oldest VFS notebooks (by recents order) that are not currentPath until
// the count is within VFS_NOTEBOOK_LIMIT. Returns evicted { label, path } pairs
// so the caller can delete from the VFS contents manager and show toasts.
export function enforceVfsLimit(currentPath?: string): Array<{ label: string; path: string }> {
  const recents = getRecentNotebooks();
  const vfsEntries = recents.filter(r => r.type === 'vfs');
  if (vfsEntries.length <= VFS_NOTEBOOK_LIMIT) return [];

  const toEvict = vfsEntries.length - VFS_NOTEBOOK_LIMIT;
  const evicted: Array<{ label: string; path: string }> = [];

  // Oldest entries are at the tail of the recents array
  for (let i = recents.length - 1; i >= 0 && evicted.length < toEvict; i--) {
    const nb = recents[i];
    if (nb.type === 'vfs' && nb.path && nb.path !== currentPath) {
      try { sessionStorage.removeItem(`vfs-cache:${nb.path}`); } catch { /* ignore */ }
      evicted.push({ label: nb.label, path: nb.path });
    }
  }

  if (evicted.length > 0) {
    const evictedPaths = new Set(evicted.map(e => e.path));
    const filtered = recents.filter(
      r => !(r.type === 'vfs' && r.path && evictedPaths.has(r.path))
    );
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(filtered)); } catch { /* ignore */ }
  }

  return evicted;
}
