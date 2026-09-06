import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '../src');

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

test('nothing reachable from mwg/3d imports Pixi', () => {
	const offenders = reachableFrom('three-d/index.ts').filter(importsPixi);
	assert.deepEqual(
		offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
		[],
		'a Babylon-rendered game must not pull in Pixi - import from assets/paths.ts, not the assets barrel'
	);
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
const RENDERER_FREE = ['core', 'i18n', 'actors', 'world', 'battle', 'simulation', 'roguelike', 'board', 'audio', 'rpg', 'three-d'];

test('every module documented as renderer-free stays that way', () => {
	for (const module of RENDERER_FREE) {
		const offenders = reachableFrom(`${module}/index.ts`).filter(importsPixi);
		assert.deepEqual(
			offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
			[],
			`mwg/${module} is documented as renderer-free`
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

test('the assets loader really does still use Pixi, so this suite is testing something', () => {
	//a guard on the guards: if Pixi detection silently stopped matching, every test above
	//would pass for the wrong reason
	assert.equal(importsPixi(resolvePath(SRC, 'assets/loader.ts')), true);
	assert.equal(importsPixi(resolvePath(SRC, 'two-d/Game.ts')), true);
});
