const RECENTS_KEY = 'jupytereverywhere:recent-notebooks';
const MAX_RECENTS = 5;

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
