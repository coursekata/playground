import { test, expect, Page } from '@playwright/test';
import type { JupyterLab } from '@jupyterlab/application';
import type { JSONObject } from '@lumino/coreutils';

declare global {
  interface Window {
    jupyterapp: JupyterLab;
  }
}

async function runCommand(page: Page, command: string, args: JSONObject = {}) {
  return await page.evaluate(
    async ({ command, args }) => {
      return await window.jupyterapp.commands.execute(command, args);
    },
    { command, args }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('lab/index.html');
  await page.waitForSelector('.jp-LabShell');
});

test.describe('General', () => {
  test('Should load a notebook', async ({ page }) => {
    await page.waitForTimeout(1000);
    expect(
      await page.locator('.jp-LabShell').screenshot({
        mask: [page.locator('.jp-KernelStatus-widget')],
        maskColor: '#fff'
      })
    ).toMatchSnapshot('application-shell.png');
  });

  test('Dialog windows should shade the notebook area only', async ({ page }) => {
    const firstCell = page.locator('.jp-Cell');
    await firstCell
      .getByRole('textbox')
      .fill('The shaded area should cover the notebook content, but not the toolbar.');
    const promise = runCommand(page, 'notebook:restart-kernel');
    const dialog = page.locator('.jp-Dialog');

    expect(
      await dialog.screenshot({
        mask: [dialog.locator('.jp-Dialog-content'), page.locator('.jp-KernelStatus-widget')],
        maskColor: '#fff'
      })
    ).toMatchSnapshot('empty-dialog-over-notebook.png');

    // Close dialog
    await dialog.press('Escape');
    await promise;
  });
});

test.describe('Kernel networking', () => {
  const remoteUrl =
    'https://raw.githubusercontent.com/JupyterEverywhere/jupyterlite-extension/refs/heads/main/ui-tests/test-files/b-dataset.csv';
  const expectedContent = 'col1';

  test('R kernel should be able to fetch from a remote URL', async ({ page }) => {
    await page.goto('lab/index.html?kernel=r');
    await page.waitForSelector('.jp-NotebookPanel');

    const code = `read.csv("${remoteUrl}")`;
    const cell = page.locator('.jp-Cell').last();
    await cell.getByRole('textbox').fill(code);

    await runCommand(page, 'notebook:run-cell');

    const output = cell.locator('.jp-Cell-outputArea');
    await expect(output).toBeVisible({
      timeout: 60000 // kernel cold-start can be slow in CI
    });

    const text = await output.textContent();
    expect(text).toContain(expectedContent);
  });
  test('Python kernel should be able to fetch from a remote URL', async ({ page }) => {
    await page.goto('lab/index.html?kernel=python');
    await page.waitForSelector('.jp-NotebookPanel');

    const code = `import pandas; pandas.read_csv("${remoteUrl}")`;
    const cell = page.locator('.jp-Cell').last();
    await cell.getByRole('textbox').fill(code);

    await runCommand(page, 'notebook:run-cell');

    const output = cell.locator('.jp-Cell-outputArea');
    await expect(output).toBeVisible({
      timeout: 60000 // kernel cold-start can be slow in CI
    });

    const text = await output.textContent();
    expect(text).toContain(expectedContent);
  });
});

test.describe('Kernel URL param behaviour', () => {
  test('Should remove kernel param after kernel initializes', async ({ page }) => {
    await page.goto('lab/index.html?kernel=r');
    await page.waitForSelector('.jp-NotebookPanel');
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('kernel'));

    const url = new URL(page.url());
    expect(url.searchParams.has('kernel')).toBe(false);
  });
});

test.describe('Title of the pages should be "CourseKata Notebook"', () => {
  test('Notebook page title', async ({ page }) => {
    await page.goto('lab/index.html');
    const title = await page.title();
    expect(title).toBe('CourseKata Notebook');
  });
});

test.describe('Kernel commands should use memory terminology', () => {
  test('Restart memory command', async ({ page }) => {
    const dialog = page.locator('.jp-Dialog-content');

    const commandPromise = runCommand(page, 'notebook:restart-kernel');

    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/restart the notebook.*memory/i);
    expect(await dialog.screenshot()).toMatchSnapshot('restart-memory-dialog.png');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await commandPromise;
  });

  test('Restart memory and run all cells command', async ({ page }) => {
    const promise = runCommand(page, 'jupytereverywhere:restart-and-run-all');
    const dialog = page.locator('.jp-Dialog-content');

    await expect(dialog).toBeVisible();
    expect(await dialog.screenshot()).toMatchSnapshot('restart-memory-run-all-dialog.png');

    await dialog.press('Escape');
    await promise;
  });
});

test.describe('Placeholders in cells', () => {
  test.beforeEach(async ({ page }) => {
    await page.waitForSelector('.jp-NotebookPanel');
  });
  test('Code cell editor placeholder', async ({ page }) => {
    await runCommand(page, 'notebook:enter-command-mode');

    const cell = page.locator('.jp-CodeCell').first();
    expect(await cell.screenshot()).toMatchSnapshot('code-editor-placeholder.png');
  });
  test('Markdown cell editor placeholder', async ({ page }) => {
    await runCommand(page, 'notebook:change-cell-to-markdown');
    await runCommand(page, 'notebook:enter-command-mode');

    const cell = page.locator('.jp-MarkdownCell').first();
    expect(await cell.screenshot()).toMatchSnapshot('markdown-editor-placeholder.png');
  });
  test('Rendered Markdown cell placeholder', async ({ page }) => {
    await runCommand(page, 'notebook:change-cell-to-markdown');
    await runCommand(page, 'notebook:run-cell');

    const cell = page.locator('.jp-MarkdownCell').first();
    expect(await cell.screenshot()).toMatchSnapshot('rendered-markdown-placeholder.png');
  });
});

test.describe('Per cell run buttons', () => {
  test('Clicking the run button executes code and shows output', async ({ page }) => {
    await page.waitForSelector('.jp-NotebookPanel');

    const cell = page.locator('.jp-CodeCell').first();
    const editor = cell.getByRole('textbox');

    await editor.click(); // make it active so the run button is visible
    await editor.fill('print("hello from jupytereverywhere")');

    const runBtn = cell.locator('.je-cell-run-button');
    await expect(runBtn).toBeVisible();

    await runBtn.click();

    const output = cell.locator('.jp-Cell-outputArea');
    await expect(output).toBeVisible({ timeout: 20000 });
    await expect(output).toContainText('hello from jupytereverywhere', { timeout: 20000 });
  });

  test('Hides input execution count on hover/active', async ({ page }) => {
    await page.waitForSelector('.jp-NotebookPanel');

    // Ensure two cells so we can toggle active state cleanly, and
    // put some output in the first cell so it has an OutputPrompt.
    await runCommand(page, 'notebook:insert-cell-below');

    const firstCell = page.locator('.jp-CodeCell').first();
    const secondCell = page.locator('.jp-CodeCell').nth(1);

    await firstCell.getByRole('textbox').click();
    await firstCell.getByRole('textbox').fill('1+1');
    await firstCell.locator('.je-cell-run-button').click();
    await expect(firstCell.locator('.jp-Cell-outputArea')).toBeVisible({ timeout: 30000 });

    const inputIndicator = firstCell.locator('.jp-InputArea-prompt-indicator');

    // When the first cell is active, the input indicator should be hidden
    await firstCell.click();
    await expect(inputIndicator).toBeHidden();

    // Make another cell active, so the first is not active/selected
    await secondCell.click();
    await expect(inputIndicator).toBeVisible();

    // Hover over the first cell; input indicator should get hidden again
    await firstCell.hover();
    await expect(inputIndicator).toBeHidden();
  });

  test('For non-active/non-focused cells with an input execution count, there should not be an output execution count', async ({
    page
  }) => {
    await page.waitForSelector('.jp-NotebookPanel');

    // Ensure three cells so we can toggle active state cleanly.
    await runCommand(page, 'notebook:insert-cell-below');
    await runCommand(page, 'notebook:insert-cell-below');
    const firstCell = page.locator('.jp-CodeCell').first();
    const secondCell = page.locator('.jp-CodeCell').nth(1);
    const thirdCell = page.locator('.jp-CodeCell').nth(2);

    // Put some code in the first two cells and run them to get input
    // execution counts and an output prompt in the second cell.
    await firstCell.getByRole('textbox').click();
    await firstCell.getByRole('textbox').fill('x = 5');
    await firstCell.locator('.je-cell-run-button').click();

    await secondCell.getByRole('textbox').click();
    await secondCell.getByRole('textbox').fill('x');
    await secondCell.locator('.je-cell-run-button').click();

    // Go to the third cell so the first two are not active/focused
    await thirdCell.getByRole('textbox').click();

    // Wait for the execution counts to appear. Now, the second cell (inactive)
    // should have an input prompt, but no output prompt.
    const output = secondCell.locator('.jp-Cell-outputArea');
    await expect(output).toBeVisible({ timeout: 30000 });
    await expect(output).toContainText('5', { timeout: 30000 });

    const secondInputIndicator = secondCell.locator('.jp-InputPrompt');
    const secondOutputIndicator = secondCell.locator('.jp-OutputPrompt');
    await expect(secondInputIndicator).toBeVisible({ timeout: 10000 });
    await expect(secondOutputIndicator).toBeHidden({ timeout: 10000 });

    expect(
      await page.locator('.jp-LabShell').screenshot({
        mask: [page.locator('.jp-KernelStatus-widget')],
        maskColor: '#fff'
      })
    ).toMatchSnapshot('multiple-cells-prompt-indicators.png');
  });

  test('Run button is hidden on Raw cells and reappears on Code/Markdown cells', async ({
    page
  }) => {
    await page.waitForSelector('.jp-NotebookPanel');

    const cell = page.locator('.jp-Cell').first();
    const runBtn = cell.locator('.je-cell-run-button');

    await runCommand(page, 'notebook:change-cell-to-raw');
    await expect(runBtn).toBeHidden();

    await runCommand(page, 'notebook:change-cell-to-code');
    await cell.click();
    await expect(runBtn).toBeVisible();

    await runCommand(page, 'notebook:change-cell-to-markdown');
    await expect(runBtn).toBeVisible();
  });
});

test.describe('404 page', () => {
  test('Should load 404 page', async ({ page }) => {
    await page.goto('lab/404/');
    await page.waitForSelector('.je-NotFound');

    const notFoundWidget = page.locator('.je-NotFound');
    await expect(notFoundWidget).toBeVisible();

    expect(await page.locator('.jp-LabShell').screenshot()).toMatchSnapshot('404-full.png');
    await expect(page).toHaveURL(/\/lab\/404\/$/);
  });
});
