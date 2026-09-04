import { access } from 'node:fs/promises';

/** the platform's usual Chrome (or, on Windows, Edge) install path, falling back to whatever's on PATH */
export async function findChrome() {
	const candidates = process.platform === 'win32'
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
