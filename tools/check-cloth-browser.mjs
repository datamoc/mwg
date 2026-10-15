import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// Optional local consumer artwork is embedded only in ignored scratch output, never committed.
const garment = process.argv[2];
let textureSource;
if (garment) {
	const ext = extname(garment).toLowerCase();
	if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
		throw new Error(`cloth check takes a raster garment (.png/.jpg/.webp), saw ${garment}`);
	}
	const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
	textureSource = `data:${mime};base64,${readFileSync(resolve(garment)).toString('base64')}`;
}
const scratch = resolve('.example-check/cloth');
const results = resolve('benchmark-results/cloth');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application, Texture } from 'pixi.js';
import { ClothSprite } from '../../src/two-d/render/ClothSprite.ts';
(async () => {
const uri = ${JSON.stringify(textureSource ?? null)};
const image = uri ? Object.assign(new Image(), { src: uri }) : null;
if (image) await image.decode();
const canvas = document.createElement('canvas');
canvas.width = 96; canvas.height = 96;
const context = canvas.getContext('2d')!;
if (image) context.drawImage(image, 0, 0, 96, 96);
else for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
 context.fillStyle = (x + y) % 2 === 0 ? '#4caf50' : '#2e7d32';
 context.fillRect(x * 12, y * 12, 12, 12);
}
const texture = Texture.from(canvas);
const app = new Application(); await app.init({ width: 440, height: 300, background: '#1a2030', preference: 'webgl' });
document.body.appendChild(app.canvas);
const cloth = new ClothSprite(texture, { segmentsX: 6, segmentsY: 6, gravity: { x: 0, y: 900 } });
cloth.position.set(60, 20);
app.stage.addChild(cloth);
const rest = Array.from(cloth.geometry.getAttribute('aPosition').buffer.data as Float32Array);
const uvs = Array.from(cloth.geometry.getAttribute('aUV').buffer.data as Float32Array);
(window as any).__PROBE__ = () => {
 for (let i = 0; i < 60; i++) cloth.update(1 / 60);
 app.renderer.render(app.stage);
 const live = Array.from(cloth.geometry.getAttribute('aPosition').buffer.data as Float32Array);
 for (let column = 0; column <= 6; column++) {
  const index = cloth.indexOf(column, 0);
  if (live[index * 2] !== rest[index * 2] || live[index * 2 + 1] !== rest[index * 2 + 1])
   throw new Error('the waistband moved');
 }
 const draped = cloth.pointPosition(cloth.indexOf(3, 6));
 if (!(draped.y > 96)) throw new Error('the hem never draped below rest');
 cloth.setWind(500, 0);
 for (let i = 0; i < 60; i++) cloth.update(1 / 60);
 app.renderer.render(app.stage);
 const hem = cloth.pointPosition(cloth.indexOf(3, 6));
 if (!(hem.x > draped.x)) throw new Error('the gust never shoved the hem downwind');
 if (JSON.stringify(Array.from(cloth.geometry.getAttribute('aUV').buffer.data as Float32Array)) !== JSON.stringify(uvs))
  throw new Error('drape changed UVs');
 if (cloth.rotation !== 0) throw new Error('drape rotated the whole sprite');
 return { moved: cloth.movedCount(), hemX: hem.x, hemY: hem.y, backend: app.renderer.name, pinned: true, uvs: true, rotation: 0 };
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
	await page.screenshot({ path: join(results, 'rest.png') });
	const probe = await page.evaluate(() => window.__PROBE__());
	assert.deepEqual(errors, []);
	assert.match(probe.backend, /webgl/i);
	assert.ok(probe.moved > 0);
	assert.ok(probe.hemX > 48);
	await page.screenshot({ path: join(results, 'draped.png') });
	console.log(JSON.stringify({ garment: garment ?? 'generated fixture', ...probe }, null, 2));
} finally {
	await browser.close();
}
