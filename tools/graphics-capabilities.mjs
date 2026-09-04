import { access } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const executablePath = process.env.CHROME_PATH ?? await findChrome();
const browser = await chromium.launch({ executablePath, headless: true });

try {
	const page = await browser.newPage();
	const result = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		const gl2 = canvas.getContext('webgl2');
		let webgpu = false;
		let wgsl = false;
		let webgpuError = null;
		if (navigator.gpu) {
			try {
				const adapter = await navigator.gpu.requestAdapter();
				const device = await adapter?.requestDevice();
				if (device) {
					webgpu = true;
					const shader = device.createShaderModule({ code: '@compute @workgroup_size(1) fn main() {}' });
					wgsl = (await shader.getCompilationInfo()).messages.length === 0;
				}
			} catch (error) {
				webgpuError = String(error);
			}
		}
		return {
			userAgent: navigator.userAgent,
			webgl1: Boolean(gl1),
			webgl2: Boolean(gl2),
			webgpu,
			wgsl,
			webgpuError,
		};
	});

	console.log(JSON.stringify(result, null, 2));
	if (!result.webgl1) throw new Error('a GPU-backed WebGL context is required; Canvas 2D is not a fallback');
} finally {
	await browser.close();
}

async function findChrome() {
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
