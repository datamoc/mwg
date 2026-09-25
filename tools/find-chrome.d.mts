import type { Browser } from 'playwright-core';

/** the Chrome or Chromium to drive: the platform's usual install, then Playwright's own, then PATH */
export function findChrome(): Promise<string>;

/** headless Chrome set up for `file://` pages; `CHROME_PATH` names the executable, `argsEnv` names the variable holding extra flags */
export function launchChrome(options?: { argsEnv?: string }): Promise<Browser>;
