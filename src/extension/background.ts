/** The extension's service worker: the toolbar button opens the form settings page. */

import { chromeApi } from '../platform/chrome.js';

chromeApi.action.onClicked.addListener(() => void chromeApi.runtime.openOptionsPage());
