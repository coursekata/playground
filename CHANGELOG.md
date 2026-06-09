# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 2.0.0

Rebrand to CourseKata Playground and prepare the project for a public, open-source release.

- Rebrand from "Shareable Notebooks" / upstream "Jupyter Everywhere" to **CourseKata Playground** (app name, README, and browser storage keys — **breaking:** the storage-key change clears existing local browser data on first load).
- Add reachable **Terms of Service**, **Privacy Policy**, and **open-source license notices**, surfaced from an in-app footer; generate the kernel (R/Python WebAssembly) third-party notices with full GPL/AGPL/MPL license texts.
- Complete licensing/attribution: restore the BSD-3 `LICENSE`, add per-file copyright headers, and reserve the CourseKata marks and brand assets (not covered by the open-source license).
- Fix package/manifest identity (author, repository, homepage, description) to point at `coursekata/playground`.
- CI hardening: fix the wheel-build checkout permissions, cap CI artifact retention, disable Playwright video capture, and add Dependabot configuration.
- Remove unreferenced developer scratch and internal-only docs from the published repository.

<!-- <END NEW CHANGELOG ENTRY> -->
