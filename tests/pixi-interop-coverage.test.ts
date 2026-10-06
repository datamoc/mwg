import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as render from '../src/two-d/render/index.ts';
import * as interop from '../src/two-d/pixi-interop.ts';

/**
 * P31: every Pixi primitive consumers reach past the facade for gets either new facade
 * coverage or a documented interop-only rationale on its own declaration. The facade
 * already names each family (below), so this test pins the second half: each histogram
 * symbol stays exported from the sanctioned hatch, with an `Interop-only:` note naming
 * the Pixi-typed seam that keeps it there, so a consumer budget can justify a use
 * instead of merely counting it.
 */

const PRIMITIVES: Record<string, string[]> = {
	Rectangle: ['Rectangle2D', 'Rect', 'rectOf'],
	Texture: ['Texture2D', 'TextureRegion'],
	Container: ['Container2D', 'Node2D'],
	Sprite: ['Sprite2D'],
	Graphics: ['Shape2D'],
	FillGradient: ['Gradient'],
	TilingSprite: ['TiledSprite'],
};

test('every histogram primitive has a facade family on the render barrel', () => {
	const facade = new Set(Object.keys(render));
	for (const [primitive, family] of Object.entries(PRIMITIVES)) {
		const covered = family.filter((name) => facade.has(name));
		assert.ok(covered.length > 0, `${primitive} has no facade family; extend the facade or stop re-exporting it`);
	}
});

test('every histogram primitive stays exported from pixi-interop with its interop-only rationale', () => {
	const source = readFileSync(new URL('../src/two-d/pixi-interop.ts', import.meta.url), 'utf8');
	const exported = new Set(Object.keys(interop));

	for (const primitive of Object.keys(PRIMITIVES)) {
		assert.ok(exported.has(primitive), `pixi-interop still re-exports ${primitive}`);
		const match = source.match(new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*export \\{[^}]*\\b${primitive}\\b`, ''));
		assert.ok(match, `${primitive} carries its own doc comment on its declaration`);
		assert.match(
			match[1],
			/Interop-only:/,
			`${primitive} states its interop-only rationale on its own declaration`,
		);
	}
});
