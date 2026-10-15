import { test } from 'node:test';
import { resolve as resolvePath } from 'node:path';
import assert from 'node:assert/strict';

import { FixedStepper, StoredValue, defaultStorage } from '../src/core/index.ts';
import { flowLayout } from '../src/two-d/ui/Layout.ts';
import { resolve } from '../src/assets/paths.ts';
import { synthesizeSound } from '../src/audio/Synth.ts';
import { fakeAudio } from '../src/testing/index.ts';
import { Camera } from '../src/two-d/render/Camera.ts';
import { Shape2D } from '../src/two-d/render/Shape2D.ts';
import { memoryStorage } from '../src/testing/index.ts';

const ROOT_DIR = resolvePath(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

test('FixedStepper runs whole steps, carries the remainder and bounds a slow frame', () => {
	const stepper = new FixedStepper(0.1, 3);
	let ticks = 0;
	assert.equal(
		stepper.advance(0.25, () => ticks++),
		2,
	);
	assert.ok(Math.abs(stepper.alpha - 0.5) < 1e-9, 'half a step is left over');
	assert.equal(
		stepper.advance(0.06, () => ticks++),
		1,
	);
	assert.equal(ticks, 3);
	assert.equal(
		stepper.advance(10, () => ticks++),
		3,
		'a long frame is capped at maxSubsteps',
	);
	assert.equal(stepper.alpha, 0, 'and the backlog is dropped rather than banked');
	assert.throws(() => new FixedStepper(0), /positive/);
});

test('StoredValue and defaultStorage are public and round-trip JSON', () => {
	const value = new StoredValue<{ solved: number[] }>(memoryStorage(), 'k');
	assert.deepEqual(value.read({ solved: [] }), { solved: [] });
	value.write({ solved: [1, 2] });
	assert.deepEqual(value.read({ solved: [] }), { solved: [1, 2] });
	assert.equal(typeof defaultStorage, 'function');
});

test('flowLayout wraps rows, aligns them and reports the height', () => {
	const items = [
		{ width: 40, height: 10 },
		{ width: 40, height: 20 },
		{ width: 40, height: 10 },
	];
	const { positions, height } = flowLayout(items, 100, { gap: 5 });
	assert.deepEqual(positions, [
		{ x: 0, y: 0 },
		{ x: 45, y: 0 },
		{ x: 0, y: 25 },
	]);
	assert.equal(height, 35);
	const centred = flowLayout(items, 100, { gap: 5, align: 'center' });
	assert.equal(centred.positions[2].x, 30, 'a lone item is centred in the width');
	assert.deepEqual(flowLayout([], 100), { positions: [], height: 0 });
	const wide = flowLayout([{ width: 300, height: 8 }], 100);
	assert.deepEqual(wide.positions, [{ x: 0, y: 0 }], 'an oversize item sits alone, not dropped');
});

test('a data: or blob: URL resolves to itself, so a synthesized tone composes with Sound', () => {
	assert.equal(resolve('data:audio/wav;base64,AAAA'), 'data:audio/wav;base64,AAAA');
	assert.equal(resolve('blob:null/1234'), 'blob:null/1234');
	const created: string[] = [];
	const sound = synthesizeSound({ duration: 0.01 }, { create: (u) => (created.push(u), fakeAudio()) });
	assert.ok(created.every((u) => u.startsWith('data:audio/wav')));
	sound.play(1, 1.2);
});

test('Camera.fit frames a fixed world inside the viewport', () => {
	const camera = new Camera();
	camera.setViewport(1600, 550);
	camera.fit(800, 550);
	assert.equal(camera.zoom, 1);
	assert.deepEqual(camera.toScreen(400, 275), { x: 800, y: 275 }, 'the world centre lands on the screen centre');
});

test('Shape2D.dashedLine chains and ignores a zero-length line', () => {
	const shape = new Shape2D();
	assert.equal(shape.dashedLine(0, 0, 100, 0, 10, 10), shape);
	assert.equal(shape.dashedLine(5, 5, 5, 5), shape);
});

test('buildDragSequence presses, moves with the button held, then releases at the end', async () => {
	const { buildDragSequence, pageDragSource } = await import('../tools/browser-driver.mjs');
	const events = buildDragSequence(0, 0, 80, 40, 4) as { type: string; x: number; y: number; buttons: number }[];
	assert.deepEqual(
		events.map((e) => e.type),
		['mouseMoved', 'mousePressed', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseMoved', 'mouseReleased'],
	);
	assert.deepEqual([events[5].x, events[5].y, events[5].buttons], [80, 40, 1]);
	assert.deepEqual([events[6].x, events[6].y, events[6].buttons], [80, 40, 0]);
	assert.match(pageDragSource(0, 0, 10, 10, 2), /pointerdown[\s\S]*pointermove[\s\S]*pointerup/);
});

test('the vite plugin and the build tools can be require()d (no top-level await)', async () => {
	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	for (const tool of ['vite', 'emit-page', 'compile-resources', 'compress-dist', 'single-file', 'sbom']) {
		assert.doesNotThrow(() => require(`../tools/${tool}.mjs`), tool);
	}
});

test('mwgPage drops the EMPTY_IMPORT_META noise and keeps every other log', async () => {
	const { mwgPage } = await import('../tools/vite.mjs');
	const config = mwgPage().config() as {
		build: {
			rollupOptions: { onLog: (level: string, log: { code: string }, next: (...a: unknown[]) => void) => void };
		};
	};
	const seen: string[] = [];
	const next = (_level: unknown, log: unknown) => seen.push((log as { code: string }).code);
	config.build.rollupOptions.onLog('warn', { code: 'EMPTY_IMPORT_META' }, next);
	config.build.rollupOptions.onLog('warn', { code: 'OTHER' }, next);
	assert.deepEqual(seen, ['OTHER']);
});

test('packages/mwg, the @datamoc/mwg alias, is what the generator writes and re-exports real entry points', async () => {
	const { readFileSync, readdirSync, statSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { aliasFiles } = await import('../tools/make-alias-package.mjs');
	const main = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'));
	const files = aliasFiles(main);
	for (const [path, content] of Object.entries(files)) {
		assert.equal(
			//a Windows checkout may hand text files over as CRLF
			readFileSync(join(ROOT_DIR, 'packages', 'mwg', path), 'utf8').replace(/\r\n/g, '\n'),
			content,
			`${path} is stale - run npm run alias:write`,
		);
	}
	const committed: string[] = [];
	const walk = (dir: string, prefix: string) => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
			else committed.push(prefix + name);
		}
	};
	walk(join(ROOT_DIR, 'packages', 'mwg'), '');
	assert.deepEqual(
		committed.sort(),
		Object.keys(files).sort(),
		'no file in packages/mwg the generator does not write',
	);
	const alias = JSON.parse(files['package.json']);
	assert.equal(alias.name, '@datamoc/mwg');
	assert.equal(alias.dependencies['@datamoc/mw_games'], main.version, 'pinned to the exact matching version');
	assert.ok(alias.exports['./two-d'] && alias.exports['.'] && alias.exports['./tools/vite']);
	for (const [key, entry] of Object.entries(alias.exports) as [string, { import: string } | string][]) {
		if (typeof entry === 'string') {
			assert.ok(key in main.exports, `${key} exists in the main package`);
			continue;
		}
		const specifier = key === '.' ? '@datamoc/mw_games' : `@datamoc/mw_games/${key.slice(2)}`;
		assert.equal(files[entry.import.slice(2)], `export * from '${specifier}';\n`);
		assert.ok(key === '.' || key in main.exports, `${key} exists in the main package`);
	}
});

test('importing a build tool never runs its command line, whatever the importing file is called', async () => {
	//`compress-dist.mjs` ends in `t.mjs`: a suffix test on the file name took any importer called `t.mjs` for it
	const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { spawnSync } = await import('node:child_process');
	const dir = mkdtempSync(join(tmpdir(), 'mwg-ismain-'));
	try {
		const file = join(dir, 't.mjs');
		const tool = new URL('../tools/compress-dist.mjs', import.meta.url).href;
		writeFileSync(file, `import ${JSON.stringify(tool)};\nconsole.log('imported quietly');\n`);
		const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });
		assert.equal(run.stdout.trim(), 'imported quietly');
		assert.equal(run.stderr, '');
		assert.equal(run.status, 0);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('DropdownView opens a list of buttons and a pick selects, closes and fires onChange', async () => {
	const { DropdownView } = await import('../src/two-d/ui/DropdownView.ts');
	const { Button } = await import('../src/two-d/ui/Button.ts');
	const { Label } = await import('../src/two-d/ui/Label.ts');
	//text measuring needs a DOM canvas, which Node has not: a label is 10x10 here
	for (const side of ['width', 'height'])
		Object.defineProperty(Label.prototype, side, { get: () => 10, set() {}, configurable: true });
	const view = new DropdownView({ width: 120, options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
	const picked: number[] = [];
	view.model.onChange.add(({ index }) => void picked.push(index));
	const rows = () => (view.children[1] as unknown as { children: InstanceType<typeof Button>[] }).children;
	assert.equal(rows().length, 0, 'closed: no list');
	(view.children[0] as InstanceType<typeof Button>).onClick.dispatch();
	assert.equal(view.model.isOpen, true);
	assert.equal(rows().length, 3);
	assert.equal(rows()[0].selected, true, 'the current choice is marked');
	rows()[2].onClick.dispatch();
	assert.deepEqual(picked, [2]);
	assert.equal(view.model.isOpen, false);
	assert.equal(rows().length, 0);
});

test('Input.attachPointer reports down, move, drag past the threshold, and up with dragged', async () => {
	const { attachPointer } = await import('../src/core/Input.ts');
	const target = new EventTarget() as EventTarget & { getBoundingClientRect: () => { left: number; top: number } };
	target.getBoundingClientRect = () => ({ left: 10, top: 20 });
	const fire = (type: string, x: number, y: number, pointerId = 1) =>
		target.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerId }));
	const pointer = attachPointer(target, { dragThreshold: 5, toWorld: (x, y) => ({ x: x / 2, y: y / 2 }) });
	const log: string[] = [];
	pointer.down.add((p) => void log.push(`down ${p.x},${p.y} w${p.worldX},${p.worldY}`));
	pointer.drag.add((p) => void log.push(`drag ${p.dx},${p.dy}`));
	pointer.up.add((p) => void log.push(`up ${p.dragged}`));

	fire('pointerdown', 30, 60);
	fire('pointermove', 32, 60);
	fire('pointermove', 40, 70);
	fire('pointerdown', 99, 99, 2);
	fire('pointermove', 50, 80, 2);
	fire('pointerup', 40, 70, 2);
	fire('pointerup', 40, 70);
	fire('pointerdown', 30, 60);
	fire('pointerup', 30, 60);
	assert.deepEqual(log, ['down 20,40 w10,20', 'drag 10,10', 'up true', 'down 20,40 w10,20', 'up false']);
	pointer.detach();
	fire('pointerdown', 0, 0);
	assert.equal(log.length, 5, 'detached: nothing more is reported');
});

test('compileResources turns assets/credits.json into CREDITS.txt and does not embed it', async () => {
	const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { compileResources, creditsText } = await import('../tools/compile-resources.mjs');
	const dir = mkdtempSync(join(tmpdir(), 'mwg-credits-'));
	try {
		const from = join(dir, 'assets');
		mkdirSync(from);
		writeFileSync(join(from, 'a.png'), Buffer.from([1, 2, 3]));
		writeFileSync(
			join(from, 'credits.json'),
			JSON.stringify({ credits: [{ name: 'Cars', author: 'CraftPix', license: 'Free', url: 'https://x' }] }),
		);
		const result = await compileResources({ from, to: join(dir, 'out') });
		assert.equal(result.credits, 'Cars by CraftPix\nLicense: Free\nhttps://x\n');
		assert.equal(readFileSync(join(dir, 'out', 'CREDITS.txt'), 'utf8'), result.credits);
		assert.ok(!readFileSync(join(dir, 'out', 'assets.js'), 'utf8').includes('credits.json'));
		assert.equal(
			result.groups.reduce((n, g) => n + g.count, 0),
			1,
			'only the png is an asset',
		);
		assert.throws(() => creditsText([{ name: 'No licence' }]), /needs a "name" and a "license"/);
		assert.throws(() => creditsText({}), /must be an array/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('mwg-init writes a buildable starter that uses the published package names and refuses a used folder', async () => {
	const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { initProject, initFiles } = await import('../tools/init.mjs');
	const dir = mkdtempSync(join(tmpdir(), 'mwg-init-'));
	try {
		const target = join(dir, 'My Game');
		const { files } = initProject(target);
		assert.ok(
			['package.json', 'vite.config.mts', 'index.html', 'src/main.ts', 'assets/.gitkeep'].every((f) =>
				files.includes(f),
			),
		);
		const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
		assert.equal(pkg.name, 'my-game');
		assert.match(pkg.dependencies['@datamoc/mw_games'], /^\^\d+\.\d+\.\d+$/);
		assert.match(readFileSync(join(target, 'vite.config.mts'), 'utf8'), /mwgPage/);
		assert.match(initFiles('x')['src/main.ts'], /@datamoc\/mw_games\/two-d/);
		writeFileSync(join(target, 'keep.txt'), 'mine');
		assert.throws(() => initProject(target), /not empty/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
