import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * `playwright-core`, loaded on first use: it is an optional peer of the published package, so a
 * game that never runs a browser check does not need it installed.
 */
async function playwright() {
	try {
		return await import('playwright-core');
	} catch {
		throw new Error('the browser checks need playwright-core: npm install --save-dev playwright-core');
	}
}

/**
 * The browser to drive: the platform's usual Chrome (or, on Windows, Edge), then a Chromium that
 * Playwright itself installed (`PLAYWRIGHT_BROWSERS_PATH`, common in CI images and containers),
 * then whatever is on PATH. `CHROME_PATH` overrides all of them in `launchChrome`.
 */
export async function findChrome() {
	const candidates =
		process.platform === 'win32'
			? [
					'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
					'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
					'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
				]
			: process.platform === 'darwin'
				? [
						'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
						'/Applications/Chromium.app/Contents/MacOS/Chromium',
					]
				: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {}
	}
	const bundled = await playwrightChromium();
	if (bundled) return bundled;
	return process.platform === 'win32' ? 'chrome.exe' : 'google-chrome';
}

/**
 * The newest Chromium under Playwright's browsers folder, whatever revision it is: the one
 * `playwright-core` would pick is often not the one a CI image or container installed.
 */
async function playwrightChromium() {
	const roots = [
		process.env.PLAYWRIGHT_BROWSERS_PATH,
		process.platform === 'win32'
			? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
			: process.platform === 'darwin'
				? join(homedir(), 'Library', 'Caches', 'ms-playwright')
				: join(homedir(), '.cache', 'ms-playwright'),
	].filter(Boolean);
	const inside = [
		'chrome-linux64/chrome',
		'chrome-linux/chrome',
		'chrome-win64/chrome.exe',
		'chrome-win/chrome.exe',
		'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
		'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
	];
	for (const root of roots) {
		const revisions = (await readdir(root).catch(() => []))
			.filter((name) => /^chromium-\d+$/.test(name))
			.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
		for (const revision of revisions)
			for (const path of inside) {
				const candidate = join(root, revision, path);
				if (
					await access(candidate).then(
						() => true,
						() => false,
					)
				)
					return candidate;
			}
	}
	return null;
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
	const { chromium } = await playwright();
	return chromium.launch({
		executablePath,
		headless: true,
		args: ['--allow-file-access-from-files', ...extraArgs],
	});
}
