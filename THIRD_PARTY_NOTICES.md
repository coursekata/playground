# Third-Party Notices — CourseKata Playground

CourseKata Playground incorporates components from the following open-source
projects. This file reproduces the copyright notices and license terms required
by each project's license.

**Last updated:** 2026  
**Status:** Updated to reflect full dependency audit of `coursekata/playground`.

---

## Contents

| #   | Component                                     | License      | Delivered to users? |
| --- | --------------------------------------------- | ------------ | ------------------- |
| 1   | Project Jupyter (JupyterLab / JupyterLite)    | BSD 3-Clause | Yes — JavaScript    |
| 2   | JupyterEverywhere                             | BSD 3-Clause | Yes — JavaScript    |
| 3   | xeus (Jupyter Kernel Protocol Library)        | BSD 3-Clause | Yes — WASM          |
| 4   | **xeus-r**                                    | **GPL-3.0**  | **Yes — WASM**      |
| 5   | R packages bundled in xeus-r kernel (GPL-2.0) | GPL-2.0      | Yes — WASM          |
| 6   | R packages bundled in xeus-r kernel (MIT)     | MIT          | Yes — WASM          |
| 7   | Lumino                                        | BSD 3-Clause | Yes — JavaScript    |
| 8   | Pyodide (Python kernel)                       | MPL 2.0      | Yes — WASM          |
| 9   | jupyterlite-pyodide-kernel                    | BSD 3-Clause | Yes — JavaScript    |
| 10  | jupyterlite-xeus                              | BSD 3-Clause | Yes — JavaScript    |
| 11  | React                                         | MIT          | Yes — JavaScript    |
| 12  | jsPDF                                         | MIT          | Yes — JavaScript    |

---

## 1. Project Jupyter (JupyterLab / JupyterLite)

**Source:** https://github.com/jupyterlab/jupyterlab  
 https://github.com/jupyterlite/jupyterlite  
**License:** BSD 3-Clause ("Modified BSD License")

```
Copyright (c) 2001–2015, IPython Development Team
Copyright (c) 2015–present, Jupyter Development Team
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The Jupyter Development Team uses a shared copyright model. Each contributor
maintains copyright over their contributions. The full list of contributors is
maintained at https://github.com/jupyterlab/jupyterlab/graphs/contributors.

---

## 2. JupyterEverywhere

**Source:** https://github.com/JupyterEverywhere/jupyterlite-extension  
**Copyright:** Copyright (c) CourseKata and Skew The Script  
**License:** BSD 3-Clause

JupyterEverywhere is a joint project of CourseKata and Skew The Script, funded
by the Bill & Melinda Gates Foundation.

```
BSD 3-Clause License

Copyright (c) 2024 CourseKata and Skew The Script
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

> **TODO before launch:** Verify the exact copyright year from the LICENSE file
> at https://github.com/JupyterEverywhere/jupyterlite-extension/blob/main/LICENSE
> and replace `[VERIFY YEAR]` above.

---

## 3. xeus (Jupyter Kernel Protocol Library)

**Source:** https://github.com/jupyter-xeus/xeus  
**License:** BSD 3-Clause

```
Copyright (c) QuantStack and contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

xeus uses a shared copyright model. Each contributor maintains copyright over
their contributions. See https://github.com/jupyter-xeus/xeus for the full
contributor list.

---

## 4. xeus-r (R Kernel)

**Source:** https://github.com/jupyter-xeus/xeus-r  
**License:** GNU General Public License v3 (GPL-3.0-only)

> ⚠️ **IMPORTANT — GPL-3.0 WASM DISTRIBUTION NOTICE**
>
> xeus-r is licensed under the GPL-3.0. In CourseKata Playground, xeus-r is
> compiled to WebAssembly (WASM) and delivered to users' browsers as part of
> the application. This constitutes distribution of GPL-licensed software under
> GPL-3.0 Section 4.
>
> **Source availability:** Users who receive this software are entitled to the
> corresponding xeus-r source code. The xeus-r source code is available at:
> https://github.com/jupyter-xeus/xeus-r
>
> **R packages also distributed in this kernel:** The xeus-r WASM kernel is
> bundled with additional R packages, some of which carry GPL-2.0 licenses
> (see Section 5). The entire kernel environment (xeus-r + bundled R packages)
> is distributed to users as a single WASM artifact. This deepens the copyleft
> exposure described in the overview document.
>
> **Proprietary feature interaction:** The extent to which GPL-3.0 obligations
> affect the proprietary features of CourseKata Playground — given that xeus-r
> runs as a WASM module in the same browser environment as those features — is
> subject to legal review. This product should not be redistributed or built
> upon without independent legal advice on GPL-3.0 compliance.
>
> **Version constraint (build-time):** xeus-r>=0.8.1
> ⚠️ **MAINTAINER NOTE (internal)**
> The exact xeus-r version distributed to users is determined at build time
> from `lite/xeus-environment.yml`. This file currently specifies:
>
>     xeus-r>=0.8.1
>
> For GPL compliance, this section must be updated to reflect the **exact**
> xeus-r version (or commit hash) compiled into the WASM kernel once it is known.
> Replace the line above with: **Version:** xeus-r=<EXACT VERSION OR COMMIT>
> Whenever the kernel build changes, update this value to match the distributed version.

```
GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

[Full license text: https://www.gnu.org/licenses/gpl-3.0.txt]
```

The complete GPL-3.0 license text is available at:
https://www.gnu.org/licenses/gpl-3.0.txt

As required by GPL-3.0, the source code for xeus-r is available at:
https://github.com/jupyter-xeus/xeus-r

---

## 5. R Packages Bundled in xeus-r Kernel — GPL-2.0

The following R packages are bundled inside the xeus-r WebAssembly kernel
environment and are distributed to users' browsers as part of the application.
They are licensed under the GNU General Public License v2 (GPL-2.0).

**ggplot2** — A grammar of graphics for R  
Source: https://github.com/tidyverse/ggplot2  
Version: 3.4.2  
Copyright: Copyright (c) Hadley Wickham, Winston Chang, and contributors  
License: GPL-2.0

**neuralnet** — Training of neural networks  
Source: https://github.com/bips-hb/neuralnet  
Version: 1.44.2  
Copyright: Copyright (c) Stefan Fritsch, Frauke Guenther, Marc Suling, and contributors  
License: GPL-2.0

> ⚠️ **GPL-2.0 DISTRIBUTION NOTICE**
>
> These packages are distributed to users as part of the xeus-r WASM kernel.
> The GNU General Public License v2 requires that the source code for these
> packages be made available to recipients. Source code is available at the
> respective GitHub repositories linked above.
>
> Note: GPL-2.0 and GPL-3.0 are not directly compatible under all combination
> scenarios. Legal counsel should assess whether the co-distribution of GPL-2.0
> and GPL-3.0 components in the same WASM kernel environment creates any
> additional compliance obligations.
>
> ⚠️ **MAINTAINER NOTE (internal)**
> The exact versions of ggplot2 and neuralnet must be determined from the built
> R WASM kernel (e.g., via `packageVersion("ggplot2")`). Do not infer from
> xeus-r. Update source references accordingly before release.

The complete GPL-2.0 license text is available at:
https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt

---

## 6. R Packages Bundled in xeus-r Kernel — MIT License

The following R packages are bundled inside the xeus-r WebAssembly kernel
environment and distributed to users' browsers. They are licensed under the
MIT License.

| Package      | Purpose                | Source                               |
| ------------ | ---------------------- | ------------------------------------ |
| r-dplyr      | Data manipulation      | https://github.com/tidyverse/dplyr   |
| r-tidyr      | Data tidying           | https://github.com/tidyverse/tidyr   |
| r-readr      | Data import            | https://github.com/tidyverse/readr   |
| r-purrr      | Functional programming | https://github.com/tidyverse/purrr   |
| r-tibble     | Tidy data frames       | https://github.com/tidyverse/tibble  |
| r-stringr    | String manipulation    | https://github.com/tidyverse/stringr |
| r-forcats    | Factor handling        | https://github.com/tidyverse/forcats |
| r-coursekata | CourseKata R package   | https://github.com/coursekata        |

Copyright for each package is held by its respective authors and contributors
(primarily the tidyverse authors: Hadley Wickham and contributors). See each
package's LICENSE file in its GitHub repository for the full copyright notice.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 7. Lumino

**Source:** https://github.com/jupyterlab/lumino  
**Copyright:** Copyright (c) 2019 Project Jupyter Contributors  
**License:** BSD 3-Clause

Lumino is a set of JavaScript packages for building interactive web applications.
It provides the core widget system and command infrastructure underlying JupyterLab
and this product. It is developed by QuantStack and Project Jupyter contributors
and is separate from the JupyterLab application packages listed in Section 1.

Packages used: `@lumino/commands`, `@lumino/coreutils`, `@lumino/messaging`,
`@lumino/widgets`.

```
BSD 3-Clause License

Copyright (c) 2019 Project Jupyter Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 8. Pyodide (Python Kernel)

**Source:** https://github.com/pyodide/pyodide  
**License:** Mozilla Public License 2.0 (MPL-2.0)

Pyodide is a Python distribution for the browser compiled to WebAssembly. It
powers the Python kernel in CourseKata Playground and is delivered to users'
browsers as a WASM module via the `jupyterlite-pyodide-kernel` package.

> ℹ️ **MPL-2.0 DISTRIBUTION NOTICE**
>
> The Mozilla Public License 2.0 is a weak copyleft ("file-level copyleft")
> license. It requires that modifications to MPL-2.0-licensed files be made
> available under the MPL-2.0, but it does not require surrounding code to be
> open-sourced. Unlike GPL, MPL-2.0 copyleft does not extend beyond the
> individual files containing MPL-licensed code. Legal counsel should confirm
> this interpretation applies to the WASM distribution context, though the
> consensus view is that MPL-2.0 poses significantly lower propagation risk
> than GPL-3.0.
>
> Pyodide is distributed to users as WASM, which constitutes distribution.
> Users are entitled to the Pyodide source code at the repository linked above.

```
Mozilla Public License Version 2.0

[Full license text: https://www.mozilla.org/en-US/MPL/2.0/]
```

The complete MPL-2.0 license text is available at:
https://www.mozilla.org/en-US/MPL/2.0/

Source code for Pyodide is available at: https://github.com/pyodide/pyodide

---

## 9. jupyterlite-pyodide-kernel

**Source:** https://github.com/jupyterlite/pyodide-kernel  
**License:** BSD 3-Clause

```
Copyright (c) JupyterLite Contributors
All rights reserved.

[BSD 3-Clause — same terms as Section 1 above]
```

---

## 10. jupyterlite-xeus

**Source:** https://github.com/jupyterlite/xeus  
**License:** BSD 3-Clause

jupyterlite-xeus is the JupyterLite addon that integrates xeus-based kernels
(including xeus-r) into JupyterLite.

```
Copyright (c) JupyterLite Contributors and QuantStack
All rights reserved.

[BSD 3-Clause — same terms as Section 1 above]
```

---

## 11. React

**Source:** https://github.com/facebook/react  
**Copyright:** Copyright (c) Meta Platforms, Inc. and affiliates.  
**License:** MIT License

Packages used: `react`, `react-dom`.

```
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 12. jsPDF

**Source:** https://github.com/parallax/jsPDF  
**Copyright:** Copyright (c) 2010 James Hall  
**License:** MIT License

jsPDF is used to provide PDF export functionality in CourseKata Playground.

```
MIT License

Copyright (c) 2010 James Hall, https://github.com/MrRio/jsPDF

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## How to Verify and Maintain These Notices

- Verify the exact copyright text for each component by checking the LICENSE
  file in each upstream repository. The upstream file controls in the event
  of any discrepancy.
- Pin and record the specific version of each component once the dependency
  lockfile is finalized, and update the version annotations in this file
  (particularly xeus-r — GPL compliance requires version traceability).
- Run a transitive dependency license audit (e.g., `license-checker` for npm,
  `pip-licenses` for Python) and add entries for any additional components with
  notice requirements.
- This file must be updated whenever a new dependency is added, an existing
  dependency is upgraded to a version with a different license, or a dependency
  is removed.

---

_Last updated: 2026_
