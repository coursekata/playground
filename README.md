<table border="0">
  <tr>
    <td width="120" align="center" valign="middle" style="padding-right: 10px;">
      <img src="style/logo.svg" alt="CourseKata Playground logo" width="120" height="120">
    </td>
    <td valign="top">
      <h1>CourseKata Playground</h1>
      <h2>A JupyterLite extension for K-12 education</h2>
      <p>CourseKata Playground is a notebook-based application for K-12 education, designed to provide a simplified, user-friendly interface for students and educators. It runs entirely in the browser — no installation required — making computational education accessible across all devices and operating systems. This repository hosts the source code for the JupyterLite extension that powers it, deployed at <a href="https://play.coursekata.org">play.coursekata.org</a>.</p>
    </td>
  </tr>
</table>

<div align="center">

[![Build Status]][Link to builds]
[![License]][License file]

[Build Status]: https://img.shields.io/github/actions/workflow/status/coursekata/playground/build.yml?branch=main&logo=github&label=build
[License]: https://img.shields.io/badge/license-BSD--3--Clause-blue.svg?logo=opensourceinitiative&logoColor=white
[Link to builds]: https://github.com/coursekata/playground/actions/workflows/build.yml
[License file]: https://github.com/coursekata/playground/blob/main/LICENSE

</div>

---

## Key features

- **In-browser computing**: runs entirely in the browser using WebAssembly; no installation required on any device or operating system
- **Multi-language support**: built-in Python (via [Pyodide](https://pyodide.org/)) and R (via [xeus-r](https://github.com/jupyter-xeus/xeus-r)) kernels
- **Multi-device access**: create, edit, and run notebooks from any modern web browser
- **K-12-focused design**: educational terminology and a simplified, classroom-friendly interface for newcomers to programming and notebooks
- **Single-document interface**: a focused workspace centered on one notebook at a time, reducing the complexity of a traditional Jupyter environment
- **Open notebooks from a link**: load a notebook directly from a URL (for example, one hosted on GitHub) and turn it into your own editable copy
- **Export options**: download notebooks as `.ipynb` files or as PDF documents
- **Local-first storage**: notebooks and settings are saved in your browser's local storage, with periodic reminders to download a copy — nothing is uploaded to CourseKata
- **Data files**: upload and download data files within the application
- **Ready-to-use packages**: popular data-science libraries — `numpy`, `pandas`, `matplotlib`, and `seaborn` for Python, and `ggplot2`, `dplyr`, and more for R — are available out of the box

## Requirements

Building this extension requires `jupyterlab==4.5.0a3` and the additional dependencies listed in `lite/requirements.txt`.

## Contributing

If you'd like to contribute (thanks!), please read the following instructions to set up your development environment.

### Development install

Note: You will need Node.js to build the extension package.

The `jlpm` command is provided by JupyterLab's pinned version of [`yarn`](https://yarnpkg.com/) that is installed with JupyterLab.

```bash
# Clone the repo to your local environment
# Change directory to the playground directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild the extension TypeScript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

To build the JupyterLite application after the extension has been installed into the environment, you can run the following commands from the root of this repository:

```bash
pip install -r lite/requirements.txt
jlpm build:all
```

which will install the necessary dependencies, install the extension into JupyterLite, and build the JupyterLite static assets. You can then serve the built JupyterLite application locally with a simple HTTP server, for example:

```bash
python -m http.server --directory dist 3000
```

### Linting

To ensure that the code follows the standard style and does not contain basic issues, run:

```bash
jlpm lint
```

You can have it run on relevant files automatically before each `git` commit, by installing [`pre-commit`](https://pre-commit.com/),
which will use the configuration provided in the `.pre-commit-config.yaml` file and install the necessary hooks:

```bash
pip install pre-commit
pre-commit install
```

### Development uninstall

```bash
pip uninstall jupytereverywhere
```

In development mode, you will also need to remove the symlink created by the `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. You can then remove the symlink named `jupytereverywhere` within that folder.

### Testing the extension

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration (snapshot) tests.

More information is provided in [the `ui-tests/README.md` document](ui-tests/README.md).

### Releases

See [RELEASE.md](RELEASE.md) for instructions on creating a new release of the extension and the bundled JupyterLite application.

## Acknowledgments

CourseKata Playground is built on the powerful foundation of [the Jupyter ecosystem](https://jupyter.org/): particularly, [JupyterLite](https://jupyterlite.readthedocs.io/) and [JupyterLab](https://jupyterlab.readthedocs.io/). Additionally, it is powered by the [Pyodide](https://pyodide.org/) and [Xeus](https://github.com/jupyter-xeus/xeus) projects, their intersections with the Jupyter ecosystem, and the broader scientific Python community. We are grateful to the maintainers, core developers, and contributors of these projects who make educational computing accessible to everyone.

This repository is a CourseKata fork of the upstream [Jupyter Everywhere](https://github.com/JupyterEverywhere/jupyterlite-extension) JupyterLite extension, originally developed as a joint effort of CourseKata and Skew The Script with funding from the Gates Foundation.
