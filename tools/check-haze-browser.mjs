import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// A painted harbour backdrop under two haze planes: the far plane breathes slowly, the
// near one thicker and faster, which is what reads as depth rather than one grey wash.
const scratch = resolve('.example-check/haze');
const results = resolve('benchmark-results/haze');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application, Texture } from 'pixi.js';
import { Sprite2D } from '../../src/two-d/index.ts';
import { HazeLayer } from '../../src/two-d/render/HazeLayer.ts';
(async () => {
const canvas = document.createElement('canvas');
canvas.width = 220; canvas.height = 150;
const context = canvas.getContext('2d')!;
const sky = context.createLinearGradient(0, 0, 0, 150);
sky.addColorStop(0, '#2b3f5c'); sky.addColorStop(0.7, '#7c6a55'); sky.addColorStop(1, '#3d4a35');
context.fillStyle = sky; context.fillRect(0, 0, 220, 150);
context.fillStyle = '#20242c';
for (let i = 0; i < 9; i++) context.fillRect(8 + i * 24, 96 - (i % 3) * 18, 14, 60);
context.fillStyle = '#c8a03c';
for (let i = 0; i < 9; i++) for (let w = 0; w < 3; w++) context.fillRect(11 + i * 24 + w * 4, 100 - (i % 3) * 18 + w * 7, 2, 3);
const app = new Application(); await app.init({ width: 440, height: 300, background: '#101018', preference: 'webgl' });
document.body.appendChild(app.canvas);
const harbour = new Sprite2D(Texture.from(canvas));
harbour.scale.set(2);
app.stage.addChild(harbour);
const far = new HazeLayer({ width: 440, height: 300, density: 0.3, tint: 0x9db8d6, drift: { x: 0.1, y: 0 }, seed: 11 });
const near = new HazeLayer({ width: 440, height: 300, density: 0.5, tint: 0xcfd8e6, drift: { x: 0.4, y: 0.05 }, seed: 23 });
app.stage.addChild(far, near);
(window as any).__PROBE__ = () => {
 for (let i = 0; i < 30; i++) { far.update(1 / 60); near.update(1 / 60); }
 app.renderer.render(app.stage);
 if (!(near.elapsed > far.elapsed - 1 && near.elapsed > 0)) throw new Error('the planes never drifted');
 return { elapsed: near.elapsed, backend: app.renderer.name, planes: 2 };
};
app.renderer.render(app.stage);
(window as any).__READY__ = true;
})().catch(console.error);
`,
);
writeFileSync(
	join(scratch, 'index.html'),
	'<html><head><meta charset="utf-8"></head><body style="margin:0"><script type="module" src="./entry.ts"></script></body></html>',
);
await build({
	configFile: false,
	root: scratch,
	logLevel: 'error',
	plugins: [mwgPage({ assets: false, sbom: false, compress: false })],
});
const browser = await launchChrome();
try {
	const page = await browser.newPage({ viewport: { width: 440, height: 300 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto(pathToFileURL(join(scratch, 'dist/index.html')).href);
	await page.waitForFunction(() => window.__READY__, undefined, { timeout: 10000 });
	await page.screenshot({ path: join(results, 'clear.png') });
	const probe = await page.evaluate(() => window.__PROBE__());
	assert.deepEqual(errors, []);
	assert.match(probe.backend, /webgl/i);
	assert.ok(probe.elapsed > 0);
	await page.screenshot({ path: join(results, 'hazed.png') });
	console.log(JSON.stringify(probe, null, 2));
} finally {
	await browser.close();
}
