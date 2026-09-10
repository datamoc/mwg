import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which modules are allowed to reach a renderer, enforced rather than documented.
 *
 * `mwg/3d` renders through Babylon and should cost a game nothing in Pixi. It used to import
 * Pixi anyway, transitively and invisibly: it needs `resolve` to look a path up in the
 * compiled `data:` URI map, `resolve` lived in `assets/index.ts`, and that file imported
 * Pixi's `Assets` loader at the top for the unrelated half of its job. Splitting `assets` into
 * `paths.ts` (no renderer) and `loader.ts` (Pixi) fixed it, and this test is what stops it
 * coming back the next time someone reaches for a convenient barrel import.
 *
 * Walks the real import graph from source rather than checking one file, since the whole point
 * is that the dependency was several hops away and nobody noticed.
 */

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolvePath(ROOT, 'src');
const EXAMPLES = resolvePath(ROOT, 'examples');

/** every `.ts` file reachable by relative import from `entry`, including itself */
function reachableFrom(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [resolvePath(SRC, entry)];

	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		//both `import ... from '...'` and a bare side-effect `import '...'`
		for (const match of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
			queue.push(resolvePath(dirname(file), match[1]));
		}
	}
	return [...seen];
}

function importsPixi(file: string): boolean {
	//a type-only import is erased at runtime and costs nothing, so it does not count
	return /^\s*import\s+(?!type\s)[^;]*from\s*['"]pixi\.js['"]/m.test(readFileSync(file, 'utf8'));
}

function importsBabylon(file: string): boolean {
	return /^\s*import\s+(?!type\s)[^;]*from\s*['"]@babylonjs\//m.test(readFileSync(file, 'utf8'));
}

test('nothing reachable from mwg/3d imports Pixi', () => {
	const offenders = reachableFrom('three-d/index.ts').filter(importsPixi);
	assert.deepEqual(
		offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
		[],
		'a Babylon-rendered game must not pull in Pixi - import from assets/paths.ts, not the assets barrel',
	);
});

/**
 * The reverse direction, which the doc calls out explicitly alongside the Pixi check above:
 * installing a 2D game should not pull Babylon in either. `two-d` never had a reason to
 * import it, but nothing enforced that - only the one-way "3D never imports Pixi" case had a
 * test, so a stray `@babylonjs/*` import reaching `two-d` transitively could have landed
 * unnoticed the same way the original Pixi-in-3d leak this file's own history describes did.
 */
test('nothing reachable from mwg/two-d imports Babylon', () => {
	const offenders = reachableFrom('two-d/index.ts').filter(importsBabylon);
	assert.deepEqual(
		offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
		[],
		'a Pixi-rendered game must not pull in Babylon',
	);
});

test('three-d really does still use Babylon, so the reverse-direction check is testing something', () => {
	const offenders = reachableFrom('three-d/index.ts').filter(importsBabylon);
	assert.ok(offenders.length > 0, 'mwg/3d is documented as depending on Babylon');
});

test('assets/paths.ts stays renderer-free on its own', () => {
	const offenders = reachableFrom('assets/paths.ts').filter(importsPixi);
	assert.deepEqual(offenders, [], 'path resolution is string work and must need no renderer');
});

/**
 * The exact set REFERENCE.md promises is renderer-free, verified rather than asserted.
 *
 * `core` is the one that matters most: it holds the loop-adjacent lifecycle, input, saves and
 * RNG that every game wants, and it is renderer-free only because `Game` and the display half
 * of `Scene` moved out to `two-d`. A single convenient import putting Pixi back into `core`
 * would quietly undo that for every Babylon game, and this is what catches it.
 *
 * `rpg` earned its place here: the event interpreter now takes a `DialoguePresenter` instead
 * of building a `MessageBox`, `automap` names the two grid methods it uses instead of the
 * whole `TileMap`, the movers name the members they touch instead of `AnimatedSprite`, and
 * `loadTiledMap` moved to `two-d/render`, where the `TileMap` and `SpriteSheet` it constructs
 * already lived. Only `two-d/*` is left as a deliberate Pixi dependency.
 */
const RENDERER_FREE = [
	'core',
	'i18n',
	'actors',
	'world',
	'battle',
	'simulation',
	'roguelike',
	'board',
	'audio',
	'rpg',
	'three-d',
];

test('every module documented as renderer-free stays that way', () => {
	for (const module of RENDERER_FREE) {
		const offenders = reachableFrom(`${module}/index.ts`).filter(importsPixi);
		assert.deepEqual(
			offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
			[],
			`mwg/${module} is documented as renderer-free`,
		);
	}
});

test('the modules that genuinely do need Pixi are not accidentally in that list', () => {
	//if one of these ever came back clean, either the graph walk broke or the module changed
	//shape enough that REFERENCE.md's own list needs revisiting rather than quietly widening
	for (const module of ['two-d', 'two-d/render', 'two-d/ui', 'two-d/stage']) {
		const offenders = reachableFrom(`${module}/index.ts`).filter(importsPixi);
		assert.ok(offenders.length > 0, `mwg/${module} is documented as depending on Pixi`);
	}
});

/**
 * The consumer side of the same rule: a normal 2D game should depend on `mwg`, not on
 * `pixi.js` directly. Every example used to import `pixi.js` for `Graphics`/`Text`/`Container`
 * construction that `two-d` doesn't wrap yet; they now import those through
 * `two-d/pixi-interop.ts`, the one sanctioned, visible escape hatch, so this checks each
 * example's own source (not `vite.config.ts`, and not `mwg`'s own `src/`, already covered
 * above) never names `pixi.js`/`@pixi/*` itself.
 */
function importsPixiDirectly(file: string): boolean {
	return /from\s*['"](?:pixi\.js|@pixi\/)/.test(readFileSync(file, 'utf8'));
}

test('example games import pixi.js only through two-d/pixi-interop, never directly', () => {
	const offenders: string[] = [];
	for (const example of readdirSync(EXAMPLES, { withFileTypes: true })) {
		if (!example.isDirectory()) continue;
		const dir = resolvePath(EXAMPLES, example.name);
		for (const entry of readdirSync(dir)) {
			if (!entry.endsWith('.ts') || entry === 'vite.config.ts') continue;
			const file = resolvePath(dir, entry);
			if (importsPixiDirectly(file)) offenders.push(`${example.name}/${entry}`);
		}
	}
	assert.deepEqual(
		offenders,
		[],
		'import Graphics/Text/Container etc. from two-d/pixi-interop.ts instead of pixi.js',
	);
});

test('the assets loader really does still use Pixi, so this suite is testing something', () => {
	//a guard on the guards: if Pixi detection silently stopped matching, every test above
	//would pass for the wrong reason
	assert.equal(importsPixi(resolvePath(SRC, 'assets/loader.ts')), true);
	assert.equal(importsPixi(resolvePath(SRC, 'two-d/Game.ts')), true);
});

/**
 * A rule dependent on `Math.random()` cannot be replayed, snapshotted, or tested for a
 * specific outcome - the entire point of `SimulationContext.random` (`simulation/Runtime.ts`)
 * is that a rule reaches for the RNG it was given, not the global. `core/Random.ts`'s own
 * `Math.random()` call is a legitimate, one-time seed draw when a `Generator` is built with no
 * explicit seed, so this scans only files physically under `simulation/`, not the transitive
 * import graph, which would otherwise reach `core/Random.ts` and produce a false failure.
 */
test('nothing under simulation/ calls Math.random() directly', () => {
	const dir = resolvePath(SRC, 'simulation');
	const offenders = readdirSync(dir)
		.filter((entry) => entry.endsWith('.ts'))
		.filter((entry) => /Math\.random\s*\(/.test(readFileSync(resolvePath(dir, entry), 'utf8')));
	assert.deepEqual(offenders, [], 'route randomness through SimulationContext.random instead');
});

/**
 * The consumer-facing half of the P0 boundary work: a game should never need to name a
 * `pixi.js` type to call a public `two-d` method or read a public field/interface property.
 * This is a heuristic, not a type-checker - it flags a bare `Texture`/`Container`/
 * `Rectangle`/`Sprite`/`Graphics` appearing in a non-private method/constructor/property
 * signature line, in the files that actually import those names from `pixi.js` at runtime.
 * `ColorTransformBatcher.ts` (documented Pixi-internals exception) and `pixi-interop.ts`
 * (the sanctioned escape hatch) are excluded on purpose. This exact broadening - from
 * "method signatures only" to "also plain property declarations" - is what caught
 * `ButtonSkin.texture`/`ButtonOptions.icon` after the narrower version had already shipped
 * clean, so the pattern deliberately errs wide rather than narrow.
 */
test('two-d/render and two-d/ui do not leak raw Pixi types into public signatures', () => {
	const PIXI_TYPE_NAMES = ['Texture', 'Container', 'Rectangle', 'Sprite', 'Graphics'];
	//Types2D.ts is the designated conversion boundary (`rectOf(rectangle: Rectangle)`) - the
	//one place a Pixi type is expected to appear, by design, in a function signature
	const EXEMPT = new Set(['ColorTransformBatcher.ts', 'pixi-interop.ts', 'Types2D.ts']);
	const offenders: string[] = [];

	for (const dir of ['two-d/render', 'two-d/ui']) {
		const absolute = resolvePath(SRC, dir);
		for (const entry of readdirSync(absolute)) {
			if (!entry.endsWith('.ts') || EXEMPT.has(entry)) continue;

			const file = resolvePath(absolute, entry);
			const source = readFileSync(file, 'utf8');
			const pixiImports = [...source.matchAll(/^\s*import\s+(?:type\s+)?\{([^}]+)\}\s*from\s*['"]pixi\.js['"]/gm)]
				.flatMap((match) => match[1].split(',').map((name) => name.trim().replace(/^type\s+/, '')))
				.filter((name) => PIXI_TYPE_NAMES.includes(name));
			if (pixiImports.length === 0) continue;

			const lines = source.split('\n');
			//tracks whether the nearest enclosing top-level (0-tab) declaration was an
			//exported interface/class - a non-exported helper type's own fields are an
			//implementation detail, not a public leak (caught for real: TileMap.ts's own
			//module-private `Layer` interface, which happens to hold a `Container` field)
			let insideExported = false;
			for (const line of lines) {
				if (/^\S/.test(line)) {
					insideExported = /^export\s+(default\s+)?(abstract\s+)?(interface|class)\b/.test(line);
				}
				if (!insideExported) continue;

				if (/^\s*(private|protected)\b/.test(line)) continue;
				//an `override` matches its Pixi superclass's own signature by construction -
				//e.g. `destroy(options?: Parameters<Container['destroy']>[0])` - not a new leak
				//beyond what extending that class already means
				if (/^\s*override\b/.test(line)) continue;
				//a local variable inside a method body is implementation detail, not a public
				//signature - only a top-level (one indent level) member/property line counts
				if (/^\t\t/.test(line)) continue;
				if (!/(?:\)\s*:\s*\w|constructor\s*\(|\w+\s*\(\s*\w+\s*:|^\s*\w+\??\s*:\s*\w)/.test(line)) continue;
				for (const name of pixiImports) {
					if (new RegExp(`\\b${name}\\b`).test(line) && !new RegExp(`${name}2D\\b`).test(line)) {
						offenders.push(`${dir}/${entry}: ${line.trim()}`);
					}
				}
			}
		}
	}

	assert.deepEqual(offenders, [], 'name Container2D/Texture2D/Rect/TextureRegion, or route through pixi-interop.ts');
});
