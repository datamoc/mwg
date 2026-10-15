import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// A caller can supply a local consumer SVG. Only the generated fixture is stored in this
// repository; consumer artwork is embedded in the ignored scratch page for this run only.
const vehiclePath = process.argv[2];
const source = vehiclePath
	? readFileSync(resolve(vehiclePath), 'utf8')
	: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><defs><linearGradient id="paint"><stop stop-color="#1975ba"/><stop offset="1" stop-color="#67d0ce"/></linearGradient></defs><g id="body"><path d="M10 65V35H50L70 10H110L130 35H150V65Z" fill="url(#paint)"/></g><g id="wheel-rear"><circle cx="40" cy="65" r="16" fill="#334155"/><path d="M24 65H56" stroke="white" stroke-width="3"/></g><g id="wheel-front"><circle cx="120" cy="65" r="16" fill="#334155"/><path d="M104 65H136" stroke="white" stroke-width="3"/></g></svg>';
const scratch = resolve('.example-check/skeleton-extensions');
const results = resolve('benchmark-results/skeleton-extensions');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application } from 'pixi.js';
import { loadSvgParts, releaseSvgParts, setAssetMap } from '../../src/assets/index.ts';
import { svgDataUri } from '../../src/assets/svg.ts';
import { SkeletalSprite } from '../../src/two-d/render/SkeletalSprite.ts';
import { Sprite2D } from '../../src/two-d/index.ts';
import * as Skeleton from '../../src/skeleton/index.ts';
const source = ${JSON.stringify(source)};
const app = new Application();
await app.init({ width: 680, height: 320, background: '#15202b', preference: 'webgl' });
document.body.appendChild(app.canvas);
setAssetMap({ 'vehicle.svg': svgDataUri(source) });
const parts = await loadSvgParts('vehicle.svg', { resolution: 2 });
const cached = await loadSvgParts('vehicle.svg', { resolution: 2 });
const lowerResolution = await loadSvgParts(source, { resolution: 1 });
const keys = Object.keys(parts);
const car = app.stage.addChild(new SkeletalSprite(Skeleton.create(keys.map(name => ({ name })))));
car.position.set(30, 50);
for (const name of keys) car.bind(name, parts[name]);
car.apply({});
const cleanChildren = car.children.length;
const puppet = Skeleton.create([{ name: 'upper', origin: { x: 0, y: 0 }, length: 65 }, { name: 'lower', parent: 'upper', length: 55, limits: { min: 0, max: 160 } }]);
const leg = app.stage.addChild(new SkeletalSprite(puppet));
leg.position.set(400, 90);
const legArt = await loadSvgParts('<svg xmlns="http://www.w3.org/2000/svg" width="65" height="16"><g id="limb"><rect width="65" height="16" rx="8" fill="#d99869"/></g></svg>');
leg.bind('upper', legArt.limb).anchor.set(0, .5);
leg.bind('lower', legArt.limb).anchor.set(0, .5);
leg.setDiagnostics(true);
leg.apply(Skeleton.solveTwoBoneIK(puppet, 'upper', 'lower', { x: 75, y: 55 }));
app.renderer.render(app.stage);
let unknown = false;
try { await loadSvgParts(source, { groups: ['missing-part'] }); } catch (error) { unknown = String(error).includes('missing-part'); }
const first = keys[0];
const sample = { groups: keys, cached: parts[first] === cached[first], distinctResolution: parts[first] !== lowerResolution[first], resolution: parts[first].source.resolution, cleanChildren, unknown, backend: app.renderer.name };
(window as any).__PROBE__ = sample;
(window as any).__HIDE_DEBUG__ = () => { leg.setDiagnostics(false); leg.apply({}); app.renderer.render(app.stage); return leg.children.length; };
(window as any).__RELEASE__ = async () => { for (const sprite of car.children) sprite.destroy(); await releaseSvgParts(parts); await releaseSvgParts(lowerResolution); return parts[first].destroyed; };
`,
);
writeFileSync(
	join(scratch, 'index.html'),
	'<html><head><meta charset="utf-8"><title>Skeleton and SVG parts diagnostics</title></head><body style="margin:0"><script type="module" src="./entry.ts"></script></body></html>',
);
// Top-level await is intentionally avoided by wrapping the generated entry for IIFE output.
const entry = readFileSync(join(scratch, 'entry.ts'), 'utf8');
const lines = entry.split('\n');
const imports = lines.filter((line) => line.startsWith('import '));
writeFileSync(
	join(scratch, 'entry.ts'),
	imports.join('\n') +
		'\n(async () => {\n' +
		lines.filter((line) => !line.startsWith('import ')).join('\n') +
		'\n})().catch(error => { console.error(error); });',
);
await build({
	configFile: false,
	root: scratch,
	logLevel: 'error',
	plugins: [mwgPage({ assets: false, sbom: false, compress: false })],
});
const browser = await launchChrome();
try {
	const page = await browser.newPage({ viewport: { width: 680, height: 320 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto(pathToFileURL(join(scratch, 'dist/index.html')).href);
	await page.waitForFunction(() => window.__PROBE__, undefined, { timeout: 15000 });
	const probe = await page.evaluate(() => window.__PROBE__);
	assert.equal(probe.cached, true);
	assert.equal(probe.distinctResolution, true);
	assert.equal(probe.resolution, 2);
	assert.equal(probe.cleanChildren, probe.groups.length);
	assert.equal(probe.unknown, true);
	assert.match(probe.backend, /webgl/i);
	assert.deepEqual(errors, []);
	await page.screenshot({ path: join(results, 'diagnostics.png') });
	assert.equal(await page.evaluate(() => window.__HIDE_DEBUG__()), 2);
	await page.screenshot({ path: join(results, 'clean.png') });
	assert.equal(await page.evaluate(() => window.__RELEASE__()), true);
	console.log(
		JSON.stringify(
			{ vehicle: vehiclePath ?? 'generated fixture', ...probe, screenshot: join(results, 'diagnostics.png') },
			null,
			2,
		),
	);
} finally {
	await browser.close();
}
