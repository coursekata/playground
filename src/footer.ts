import { JupyterFrontEnd } from '@jupyterlab/application';
import { Widget } from '@lumino/widgets';

/**
 * Command that opens JupyterLab's built-in third-party Licenses panel. It lists
 * the bundled application (JavaScript) libraries and is generated automatically
 * at build time, so we do not maintain those notices by hand. The kernel (R and
 * Python / WebAssembly) notices, which this panel does not cover, live on the
 * generated static page linked below.
 */
const LICENSES_COMMAND = 'apputils:licenses';

/**
 * Build the persistent footer shown beneath the notebook. It links to the
 * legal/compliance pages (served as static pages at the site root) and opens
 * the built-in Licenses panel for the bundled application libraries.
 */
export function createFooter(app: JupyterFrontEnd): Widget {
  const widget = new Widget();
  widget.id = 'ck-footer';
  widget.addClass('ck-Footer');

  const copyright = document.createElement('span');
  copyright.className = 'ck-Footer-copyright';
  copyright.textContent = '© CourseKata';

  const nav = document.createElement('nav');
  nav.className = 'ck-Footer-links';
  nav.setAttribute('aria-label', 'Legal and licensing');

  const addExternalLink = (label: string, href: string): void => {
    const anchor = document.createElement('a');
    anchor.className = 'ck-Footer-link';
    anchor.textContent = label;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    nav.appendChild(anchor);
  };

  addExternalLink('Terms of Service', '/terms/');
  addExternalLink('Privacy Policy', '/privacy/');
  addExternalLink('Notebook library notices', '/licenses/');

  // Only surface the application-libraries panel if the command is available in
  // this build; otherwise the footer degrades gracefully without it.
  if (app.commands.hasCommand(LICENSES_COMMAND)) {
    const anchor = document.createElement('a');
    anchor.className = 'ck-Footer-link';
    anchor.textContent = 'Open-source licenses';
    anchor.href = '#';
    anchor.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      void app.commands.execute(LICENSES_COMMAND);
    });
    nav.appendChild(anchor);
  }

  widget.node.appendChild(copyright);
  widget.node.appendChild(nav);

  return widget;
}
