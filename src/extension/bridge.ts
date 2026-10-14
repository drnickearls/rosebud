/**
 * The extension's ISOLATED-world content script: the page's only link to the extension.
 * page.js runs in the page's own world (MAIN), where chrome.* doesn't exist, so it asks here
 * for the form saved by the settings page.
 */

import { answerFormRequests } from '../savedForm/chromeStorage.js';

answerFormRequests();
