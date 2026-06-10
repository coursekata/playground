# CourseKata Notebook — Getting Started

CourseKata Notebook runs entirely in your web browser — no installation required. You can write and run R or Python code, open notebooks shared by your instructor, and save your work.

---

## Which browser should I use?

**Chrome or Edge** gives the best experience: you can save notebooks directly to files on your computer, just like a word processor.

**Safari or Firefox** works well too, but saving works differently: notebooks are kept in your browser's storage rather than as files on your computer. Use **Download notebook** to get a copy on your hard drive.

---

## Opening a notebook

Click **File** in the toolbar to see your options:

| Option                  | What it does                                 |
| ----------------------- | -------------------------------------------- |
| **New R notebook**      | Start a fresh R notebook                     |
| **New Python notebook** | Start a fresh Python notebook                |
| **Open from file**      | Open a `.ipynb` file from your computer      |
| **Open from GitHub**    | Open a notebook by pasting a GitHub URL      |
| **Open from URL**       | Open a notebook from any public `.ipynb` URL |

Recently opened notebooks appear at the bottom of the File menu so you can get back to them quickly.

---

## Running code

- **Run a single cell:** click the play button (▶) to the left of the cell, or press **Shift + Enter**.
- **Run all cells:** use the **Run** button in the toolbar and choose **Run all cells**.
- **Restart and run all:** use **Run → Restart memory and run all cells** to clear all results and rerun everything from the top. You'll be asked to confirm.

The toolbar shows the current language (R or Python). You can switch languages from the toolbar, but note that existing code won't run in the new language.

---

## Saving your work

How saving works depends on your browser.

### Chrome or Edge

- **When you open a file from your computer**, the app remembers that file. **Save changes** (or **Cmd/Ctrl + S**) writes your changes directly back to that file — no dialog, no download.
- **When you open from GitHub or create a new notebook**, the notebook lives in your browser temporarily. Use **Save as file** (or **Cmd/Ctrl + S**) to save it as a `.ipynb` file on your computer. After that, **Save changes** updates that file automatically.

### Safari or Firefox

- **Save changes in browser** (or **Cmd/Ctrl + S**) saves the notebook into your browser's storage. It will ask you to name it the first time. Saved notebooks appear in the **File → Recent** list and survive closing and reopening the browser.
- Your browser can hold up to **10 notebooks**. If you exceed that, the oldest one is removed automatically to make room.
- To get a `.ipynb` file on your computer, use **File → Download notebook**.

### Closing a notebook

Choosing **File → Close notebook** removes the notebook from your browser's storage and opens the next recent notebook (or a new one). On Chrome, you'll be offered the option to **Save as file** first. On Safari, you'll be warned that the notebook will be removed from the browser.

> **Tip:** closing a notebook is the main way to free up browser storage on Safari. If your browser storage fills up, you'll see a message suggesting you clear storage or download the notebook first.

---

## Exporting

- **Download notebook** — saves a `.ipynb` file to your computer (available on Safari/Firefox; on Chrome, use **Save as file** instead).
- **Download as PDF** — opens a print-ready version in a new tab and triggers the print dialog. You can save it as a PDF from there.
- **Copy link to GitHub source** — if you opened the notebook from GitHub, this copies a shareable link that anyone can use to open the same notebook.

---

## Managing browser storage

Over time, notebooks accumulate in your browser's storage. You have a few ways to manage this:

- **File → Close notebook** — removes the current notebook from browser storage.
- **File → Clear storage** — removes all stored notebooks and resets the app completely. You'll be asked to confirm. This cannot be undone.

> **Note:** "Clear browser cache" in your browser's settings does _not_ clear notebook storage — notebook data is stored separately. Use **File → Clear storage** inside the app to remove it.

---

## Keyboard shortcuts

| Shortcut          | Action                            |
| ----------------- | --------------------------------- |
| **Shift + Enter** | Run current cell and move to next |
| **Cmd/Ctrl + S**  | Save                              |

---

## Frequently asked questions

**Does this work offline?**
Once the page has loaded, basic editing works offline. Running code requires an active connection to load the language kernel the first time; after that, short interruptions may be tolerated.

**I opened a notebook from a file, made changes, and now I don't see "Save changes" enabled. Did my changes save?**
"Save changes" is only enabled when there are unsaved changes. If it's greyed out, your last save was successful.

**My recent notebook isn't opening.**
Notebooks in **Recent** that were saved in the browser can only be reopened if they're still in browser storage. If you cleared storage or the notebook was evicted (storage was full), you'll need to reopen it from the original file or URL.

**Can I use this on a tablet or phone?**
The app is designed for laptop and desktop browsers. It may work on a tablet in landscape mode, but phones are too narrow for a comfortable coding experience.
