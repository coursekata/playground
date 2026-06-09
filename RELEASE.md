# Releasing CourseKata Playground

CourseKata Playground is deployed as a static [JupyterLite](https://jupyterlite.readthedocs.io/)
site to **GitHub Pages** at <https://play.coursekata.org>. Deployment is automatic: the `deploy`
job in [`.github/workflows/build.yml`](.github/workflows/build.yml) publishes the built `dist/`
to GitHub Pages on every push to `main`.

There is no separate release tarball, GitHub Release, or external deployment step — **merging to
`main` is the release**.

## Cutting a release

1. Update the version in `package.json` (the Python package version is derived from it via
   `hatch-nodejs-version`). Use a major bump for breaking changes.
2. Add a `CHANGELOG.md` entry describing the changes.
3. Open a PR and merge to `main`. The `Build` workflow will:
   - build the `jupytereverywhere` extension wheel,
   - build the JupyterLite application (including the R and Python WebAssembly kernels), and
   - deploy `dist/` to GitHub Pages → <https://play.coursekata.org>.

## Updating Playwright snapshots

The integration tests compare against reference images generated on Linux in CI. To regenerate
them on a PR, comment `please update snapshots` on the PR; a CI job will rebuild the snapshots and
commit them to the PR branch. See [`ui-tests/README.md`](ui-tests/README.md) for details.

## Verifying a build locally

To build and serve the full application locally before releasing:

```bash
pip install -r lite/requirements.txt
jlpm build:all
python -m http.server --directory dist 3000
```
