import assert from 'node:assert/strict';
import test from 'node:test';
import { Texture, TextureSource } from 'pixi.js';

import { TiledSprite } from '../src/two-d/render/Shape2D.ts';
import { NinePatch } from '../src/two-d/ui/NinePatch.ts';

/**
 * `GameOptions.extensions`'s own doc comment promises a game never has to register a render
 * pipe for `TiledSprite`/`NinePatch`: Pixi's own `TilingSprite`/`NineSliceSprite` modules each
 * side-effect-import an `init` module that calls `extensions.add(...)` unconditionally (verified
 * directly in `node_modules/pixi.js`, not assumed - see ADR-009). This is Pixi's own guarantee,
 * not mwg's, but mwg's promise depends on it staying true, and nothing before this file checked
 * it: the one existing consumer to actually verify it did so with a private, uncommitted script
 * (`tools/scratch/pipe-registration-livecheck.mjs` in mwg-pixel-dungeon), after the guarantee
 * broke once already and cost a session to diagnose (a renderer built with the pipe missing
 * fails deep inside Pixi's own render-group walk, not at the call site). `renderPipeId` is the
 * public property a real renderer looks up to find the registered pipe; checking it here is the
 * same technique `color-transform-batcher.test.ts` already uses to verify
 * `registerColorTransform` without constructing a real WebGL/canvas renderer.
 */

function texture(): Texture {
	return new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
}

test("TiledSprite resolves to Pixi's own registered tiling-sprite pipe", () => {
	const tiled = new TiledSprite({ texture: texture(), width: 8, height: 8 });
	assert.equal((tiled as unknown as { renderPipeId: string }).renderPipeId, 'tilingSprite');
});

test("NinePatch's inner slice sprite resolves to Pixi's own registered nine-slice pipe", () => {
	const patch = new NinePatch(texture(), { border: 2 });
	const inner = (patch as unknown as { sprite: { renderPipeId: string } }).sprite;
	assert.equal(inner.renderPipeId, 'nineSliceSprite');
});
