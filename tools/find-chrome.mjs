import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

/** the platform's usual Chrome (or, on Windows, Edge) install path, falling back to whatever's on PATH */
export async function findChrome() {
	const candidates =
		process.platform === 'win32'
			? [
					'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
					'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
					'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
				]
			: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {}
	}
	return process.platform === 'win32' ? 'chrome.exe' : 'google-chrome';
}

/**
 * Launches headless Chrome for a page loaded from `file://`, the way every tool here wants it:
 * the same discovery, `--allow-file-access-from-files`, and machine-specific flags read from
 * `argsEnv` (a runner with no GPU passes `--use-gl=angle --use-angle=swiftshader` that way,
 * since that is a property of the machine rather than of the tool). Each caller keeps its own
 * page setup and assertions; this is the launch they all had in common.
 */
export async function launchChrome({ argsEnv = 'MWG_BENCHMARK_CHROME_ARGS' } = {}) {
	const executablePath = process.env.CHROME_PATH ?? (await findChrome());
	const extraArgs = (process.env[argsEnv] ?? '').split(' ').filter(Boolean);
	return chromium.launch({
		executablePath,
		headless: true,
		args: ['--allow-file-access-from-files', ...extraArgs],
	});
}
