import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// A dark lane with three lit signs: cyan steady, magenta breathing, amber small. The
// probe asserts the additive overlay, the baked falloff size and a live flicker.
const scratch = resolve('.example-check/glow');
const results = resolve('benchmark-results/glow');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application } from 'pixi.js';
import { NeonGlow } from '../../src/two-d/render/NeonGlow.ts';
(async () => {
const app = new Application(); await app.init({ width: 440, height: 300, background: '#08080c', preference: 'webgl' });
document.body.appendChild(app.canvas);
const cyan = new NeonGlow({ color: 0x37e0ff, radius: 60 });
const magenta = new NeonGlow({ color: 0xff3fd4, radius: 44, flicker: { amount: 0.2, frequency: 2 } });
const amber = new NeonGlow({ color: 0xffb02e, radius: 26, intensity: 0.8 });
cyan.position.set(110, 150); magenta.position.set(220, 150); amber.position.set(330, 150);
app.stage.addChild(cyan, magenta, amber);
(window as any).__PROBE__ = () => {
 for (let i = 0; i < 30; i++) { cyan.update(1 / 60); magenta.update(1 / 60); amber.update(1 / 60); }
 app.renderer.render(app.stage);
 for (const [name, sign] of [['cyan', cyan], ['magenta', magenta], ['amber', amber]] as const) {
  if (sign.blendMode !== 'add') throw new Error(name + ' stopped glowing additively');
  if (!(sign.alpha > 0)) throw new Error(name + ' went dark');
 }
 if (!(magenta.alpha !== 1 || magenta.elapsed > 0)) throw new Error('the flicker never breathed');
 if (cyan.texture.width !== 121) throw new Error('the falloff baked at the wrong size');
 return { alpha: magenta.alpha, backend: app.renderer.name, signs: 3 };
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
	const probe = await page.evaluate(() => window.__PROBE__());
	assert.deepEqual(errors, []);
	assert.match(probe.backend, /webgl/i);
	assert.ok(probe.alpha > 0 && probe.alpha <= 1);
	await page.screenshot({ path: join(results, 'signs.png') });
	console.log(JSON.stringify(probe, null, 2));
} finally {
	await browser.close();
}
