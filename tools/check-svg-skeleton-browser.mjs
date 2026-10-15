import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { mwgPage } from './vite.mjs';
import { launchChrome } from './find-chrome.mjs';

// Optional local artwork and its manifest stay in ignored scratch output only.
const svgFile = process.argv[2];
const manifestFile = process.argv[3];
const source = svgFile
	? readFileSync(resolve(svgFile), 'utf8')
	: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80" viewBox="0 0 60 80"><defs><linearGradient id="cloth"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#ed7758"/></linearGradient></defs><g transform="translate(0 0)"><g id="torso" data-pivot-x="25" data-pivot-y="25"><rect x="18" y="18" width="18" height="30" rx="5" fill="#68c3d4"/></g><g id="arm-near" data-pivot-x="25" data-pivot-y="25"><rect x="22" y="25" width="6" height="18" rx="3" fill="url(#cloth)"/><g id="forearm-near" data-pivot-x="25" data-pivot-y="43"><rect x="22" y="43" width="6" height="16" rx="3" fill="#f2c29d"/></g></g><g id="head" data-pivot-x="25" data-pivot-y="14"><circle cx="25" cy="12" r="9" fill="#f2c29d"/></g></g></svg>';
let pivots;
if (manifestFile) {
	const manifest = JSON.parse(readFileSync(resolve(manifestFile), 'utf8'));
	const entry = Object.values(manifest).find(
		(art) => art.file?.endsWith('/' + basename(svgFile)) || art.file === basename(svgFile),
	);
	assert.ok(entry, 'manifest must contain the supplied artwork');
	pivots = Object.fromEntries(Object.entries(entry.pivots).map(([name, p]) => [name, { x: p[0], y: p[1] }]));
	// A torso anchored at the hip is a binding choice, not character geometry in the framework.
	if (pivots['leg-near']) pivots.torso = pivots['leg-near'];
	if (pivots['hair-back']) pivots.head = pivots['hair-back'];
}
const scratch = resolve('.example-check/svg-skeleton');
const results = resolve('benchmark-results/svg-skeleton');
mkdirSync(scratch, { recursive: true });
mkdirSync(results, { recursive: true });
writeFileSync(
	join(scratch, 'entry.ts'),
	`
import { Application } from 'pixi.js';
import { loadSvgSkeleton } from '../../src/two-d/render/SvgSkeleton.ts';
import { create, resolve as resolveBones } from '../../src/skeleton/index.ts';
import { setAssetMap } from '../../src/assets/paths.ts';
import { svgDataUri } from '../../src/assets/svg.ts';
(async () => {
const source = ${JSON.stringify(source)};
const explicit = ${JSON.stringify(pivots ?? null)} as Record<string, { x: number; y: number }> | null;
const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
const all = [...doc.querySelectorAll('g[id]')];
const pivots: Record<string, { x: number; y: number }> = {};
for (const group of all) {
 const pivot = explicit?.[group.id] ?? (group.hasAttribute('data-pivot-x') ? { x: Number(group.getAttribute('data-pivot-x')), y: Number(group.getAttribute('data-pivot-y')) } : undefined);
 if (pivot) pivots[group.id] = pivot;
}
const names = new Set(Object.keys(pivots));
const bones = Object.keys(pivots).map(name => {
 const group = all.find(g => g.id === name)!;
 let ancestor = group.parentElement;
 while (ancestor && !names.has(ancestor.id)) ancestor = ancestor.parentElement;
 const parent = ancestor?.id;
 const offset = parent ? pivots[parent] : { x: 0, y: 0 };
 return { name, parent, origin: { x: pivots[name].x - offset.x, y: pivots[name].y - offset.y } };
});
const skeleton = create(bones);
setAssetMap({ 'character.svg': svgDataUri(source) });
const loaded = await loadSvgSkeleton('character.svg', { skeleton, pivots: explicit ?? undefined, resolution: 2 });
const app = new Application(); await app.init({ width: 540, height: 380, background: '#263444', preference: 'webgl' });
document.body.appendChild(app.canvas);
const rig = loaded.sprite; rig.position.set(100, 30); rig.scale.set(4); app.stage.addChild(rig);
rig.setDiagnostics(true); rig.apply({});
app.renderer.render(app.stage);
const rest = Object.fromEntries(bones.map(b => [b.name, { x: rig.part(b.name)!.x, y: rig.part(b.name)!.y }]));
const count = Object.keys(loaded.textures).length;
const serialized = Object.values(loaded.textures).map(t => t.width);
if (serialized.some(width => width <= 0)) throw new Error('part texture has no dimensions');
// The authored child is isolated once, never baked into its parent's texture too.
const cacheAgain = await loadSvgSkeleton('character.svg', { skeleton, pivots: explicit ?? undefined, resolution: 2 });
if (cacheAgain.textures['arm-near'] !== loaded.textures['arm-near']) throw new Error('skeletal textures did not reuse cache');
cacheAgain.sprite.destroy({ children: true });
const failures: string[] = [];
for (const options of [
 { bindings: [{ bone: 'arm-near', group: 'missing' }] },
 { bindings: [{ bone: 'missing', group: 'arm-near' }] },
 { bindings: [{ bone: 'arm-near', pivot: { x: NaN, y: 0 } }] },
 { bindings: [{ bone: 'arm-near' }, { bone: 'arm-near' }] },
]) {
 try { await loadSvgSkeleton(source, { skeleton, pivots, ...options }); throw new Error('accepted invalid binding'); }
 catch (error) { if (String(error).includes('accepted invalid')) throw error; failures.push(String(error)); }
}
(window as any).__POSE__ = () => {
 rig.apply({ 'arm-near': -65 });
 const expected = new Map(resolveBones(skeleton, { 'arm-near': -65 }).map(b => [b.name, b]));
 const child = rig.part('forearm-near')!; const end = expected.get('forearm-near')!;
 if (Math.abs(child.x - end.x) > 1e-5 || Math.abs(child.y - end.y) > 1e-5) throw new Error('child did not follow joint');
 if (Math.abs(child.x - rest['forearm-near'].x) < 1) throw new Error('child did not move around parent pivot');
 const untouched = bones.filter(b => !['arm-near','forearm-near'].includes(b.name)).every(b => rig.part(b.name)!.x === rest[b.name].x && rig.part(b.name)!.y === rest[b.name].y);
 if (!untouched) throw new Error('posing arm moved unrelated parts');
 app.renderer.render(app.stage);
 return { count, backend: app.renderer.name, child: { x: child.x, y: child.y }, untouched, failures: failures.length };
};
// A nonzero authored rest angle reconstructs a downward limb, then rotates it horizontally.
const oriented = await loadSvgSkeleton('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="50"><g id="limb" data-pivot-x="10" data-pivot-y="10"><rect x="7" y="10" width="6" height="30" fill="#fbbf24"/></g></svg>', { skeleton: create([{ name: 'limb', origin: { x: 10, y: 10 }, rotation: 90, length: 30 }]) });
oriented.sprite.position.set(400, 70); oriented.sprite.scale.set(3); app.stage.addChild(oriented.sprite); oriented.sprite.setDiagnostics(true); oriented.sprite.apply({});
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
	const page = await browser.newPage({ viewport: { width: 540, height: 380 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(m.text());
	});
	await page.goto(pathToFileURL(join(scratch, 'dist/index.html')).href);
	await page.waitForFunction(() => window.__READY__, undefined, { timeout: 10000 });
	await page.screenshot({ path: join(results, 'rest.png') });
	const probe = await page.evaluate(() => window.__POSE__());
	assert.deepEqual(errors, []);
	assert.match(probe.backend, /webgl/i);
	assert.equal(probe.failures, 4);
	await page.screenshot({ path: join(results, 'posed.png') });
	console.log(JSON.stringify({ character: svgFile ?? 'generated fixture', ...probe }, null, 2));
} finally {
	await browser.close();
}
