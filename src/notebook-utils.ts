import type { INotebookContent, MultilineString } from '@jupyterlab/nbformat';

const toText = (src?: MultilineString): string => (Array.isArray(src) ? src.join('') : (src ?? ''));

/**
 * Iterates over all cells of a notebook and returns true the notebook has no meaningful
 * content. We consider a notebook "non-empty" if at least one cell has a populated
 * non-whitespace source.
 * @param nb - the notebook to check if it's empty
 * @returns - a boolean indicating whether the notebook is empty or not.
 */
export function isNotebookEmpty(nb?: Partial<INotebookContent>): boolean {
  const cells = nb?.cells ?? [];
  if (cells.length === 0) {
    return true;
  }

  for (const cell of cells) {
    if (/\S/.test(toText(cell?.source as MultilineString | undefined))) {
      return false;
    }
  }
  return true;
}

/**
 * Generates a default notebook name based on the current date and time.
 *
 * @returns A string representing the default notebook name, with
 *          the format: "Notebook_YYYY-MM-DD_HH-MM-SS"
 */
export function generateDefaultNotebookName(): string {
  const now = new Date();

  const pad = (n: number) => n.toString().padStart(2, '0');

  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  return `Notebook_${date}_${time}`;
}

export function showSavedToast(message = 'Changes saved'): void {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'background:#f5f3ff',
    'color:#412c88',
    'border:2px solid #412c88',
    'padding:18px 48px',
    'border-radius:10px',
    'font-size:16px',
    'font-weight:600',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 4px 20px rgba(0,0,0,0.12)',
    'z-index:10000',
    'pointer-events:none',
    'opacity:1',
    'transition:opacity 0.4s ease',
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 1500);
}
