// The browser extension's manifest.
// - page.js (MAIN world) draws the button and makes RevolutionEHR's own read-only web calls
//   with the user's session.
// - bridge.js (ISOLATED world) is the page's only way to reach chrome.storage: it hands over
//   the form saved on the settings page.
// - options.html is the form settings page (an extension page, so RevolutionEHR's own page
//   rules never touch it); the toolbar button and "Extension options" open it.
import { readFileSync } from 'node:fs';

export const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

export function makeManifest() {
  return {
    manifest_version: 3,
    name: 'Rosebud for RevolutionEHR',
    version: VERSION,
    description: 'Pre-fills the practice Routing Form from RevolutionEHR and opens it as a PDF to print. Read-only.',
    permissions: ['storage'],
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    action: {
      default_title: 'Rosebud form settings',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' },
    },
    background: { service_worker: 'background.js' },
    options_ui: { page: 'options.html', open_in_tab: true },
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    content_scripts: [
      { matches: ['https://revolutionehr.com/static/*'], js: ['bridge.js'], run_at: 'document_start' },
      { matches: ['https://revolutionehr.com/static/*'], js: ['page.js'], world: 'MAIN', run_at: 'document_start' },
    ],
  };
}
