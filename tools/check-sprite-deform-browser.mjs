import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// Optional local consumer artwork is embedded only in ignored scratch output, never committed.
const bird = process.argv[2];
const svg = bird
	? readFileSync(resolve(bird), 'utf8')
	: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="28" viewBox="0 0 44 28"><g id="wing-back"><path d="M20 16L14 3L29 16" fill="#6f94b0"/></g><ellipse cx="23" cy="18" rx="12" ry="5" fill="#f3dba0"/><circle cx="34" cy="15" r="4" fill="#f3dba0"/><path d="M37 14L43 16L37 18" fill="#ea9259"/><g id="wing"><path d="M18 16L6 1L28 16" fill="#5384a2"/></g></svg>';
const scratch = resolve('.example-check/sprite-deform');
const results = resolve('benchmark-results/sprite-deform');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application } from 'pixi.js';
import { loadSvgParts, setAssetMap } from '../../src/assets/index.ts';
import { svgDataUri } from '../../src/assets/svg.ts';
import { DeformableSprite } from '../../src/two-d/render/SpriteDeform.ts';
import { Sprite2D } from '../../src/two-d/index.ts';
(async () => {
const source = ${JSON.stringify(svg)};
const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
const root = documentSvg.documentElement;
const front = root.querySelector('g[id="wing"]')!;
const back = root.querySelector('g[id="wing-back"]')!;
if (!front || !back) throw new Error('bird needs wing and wing-back groups');
const body = documentSvg.createElementNS(root.namespaceURI, 'g'); body.id = 'body';
front.remove(); back.remove();
for (const child of [...root.children]) if (!['defs','style'].includes(child.localName)) body.appendChild(child);
root.append(back, body, front);
setAssetMap({ 'bird.svg': svgDataUri(new XMLSerializer().serializeToString(root)) });
const parts = await loadSvgParts('bird.svg', { resolution: 2 });
const app = new Application(); await app.init({ width: 440, height: 300, background: '#a7c7df', preference: 'webgl' });
document.body.appendChild(app.canvas);
const wings: DeformableSprite[] = [];
for (const name of ['wing-back','body','wing']) {
 const part = name === 'body' ? new Sprite2D(parts[name]) : new DeformableSprite(parts[name], { columns: 2, rows: Math.round(parts[name].height) + 1 });
 part.position.set(75, 65); part.scale.set(6);
 app.stage.addChild(part);
 if (part instanceof DeformableSprite) wings.push(part);
}
const rest = wings.map(wing => Array.from(wing.geometry.getAttribute('aPosition').buffer.data as Float32Array));
const uvs = wings.map(wing => Array.from(wing.geometry.getAttribute('aUV').buffer.data as Float32Array));
(window as any).__FLAP__ = () => {
 const moved: number[] = [];
 for (let w = 0; w < wings.length; w++) {
  const wing = wings[w]; const tipY = w === 0 ? 3 : 1;
  const points: {index: number; x: number; y: number}[] = [];
  for (let i = 0; i < wing.count; i++) {
   const p = wing.restAt(i);
   if (p.y < 13) points.push({ index: i, x: p.x, y: p.y + 20 * Math.max(0, Math.min(1, (13-p.y)/(13-tipY))) });
  }
  wing.dragVertices(points);
  const live = Array.from(wing.geometry.getAttribute('aPosition').buffer.data as Float32Array);
  if (!live.every((value, i) => i % 2 === 0 || rest[w][i] >= 13 ? value === rest[w][i] : value > rest[w][i])) throw new Error('flap must move tips downward and keep attachments fixed');
  if (JSON.stringify(Array.from(wing.geometry.getAttribute('aUV').buffer.data as Float32Array)) !== JSON.stringify(uvs[w])) throw new Error('flap changed UVs');
  if (wing.rotation !== 0) throw new Error('flap rotated the whole sprite');
  moved.push(wing.movedCount());
 }
 app.renderer.render(app.stage);
 return { moved, backend: app.renderer.name, pinned: true, uvs: true, rotation: 0 };
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
	const probe = await page.evaluate(() => window.__FLAP__());
	assert.deepEqual(errors, []);
	assert.match(probe.backend, /webgl/i);
	assert.ok(probe.moved.every((n) => n > 0));
	await page.screenshot({ path: join(results, 'dragged.png') });
	console.log(JSON.stringify({ bird: bird ?? 'generated fixture', ...probe }, null, 2));
} finally {
	await browser.close();
}
