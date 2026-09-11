import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';
import { TerrainGraphicsLayer } from '../src/two-d/render/TerrainGraphicsLayer.ts';
import type { TerrainPlacement } from '../src/two-d/render/TerrainGraphics.ts';
import type { Sprite2D } from '../src/two-d/render/Shape2D.ts';

/**
 * The renderer half of `[terrain_graphics]`: turning resolved placements into drawables. A sprite
 * exists without a renderer, so where each one lands and in what order it is added are checkable
 * here; only the pixels would need a screenshot.
 */

function placement(overrides: Partial<TerrainPlacement> & Pick<TerrainPlacement, 'x' | 'y'>): TerrainPlacement {
	return { ruleId: 'coast', image: 'coast.png', dx: 0, dy: 0, layer: 0, ...overrides };
}

/** the layer's sprites in draw order, each as the pixel position it was placed at */
function positions(layer: TerrainGraphicsLayer): Array<[number, number]> {
	return (layer.children as unknown as Sprite2D[]).map((sprite) => [sprite.x, sprite.y]);
}

const cellProjection = (x: number, y: number, dx: number, dy: number): { x: number; y: number } => ({
	x: (x + dx) * 32,
	y: (y + dy) * 32,
});

test('each placement lands where the caller projects its cell plus its own offset', () => {
	const layer = new TerrainGraphicsLayer({
		placements: [placement({ x: 1, y: 2, dx: 1, dy: -1 })],
		project: cellProjection,
		resolveImage: () => Texture.WHITE,
	});

	assert.deepEqual(positions(layer), [[64, 32]]);
});

test('a lower layer is added before a higher one, so the higher draws on top', () => {
	const calls: string[] = [];
	const layer = new TerrainGraphicsLayer({
		placements: [
			placement({ x: 0, y: 0, image: 'transition.png', layer: 5 }),
			placement({ x: 0, y: 0, image: 'base.png', layer: 0 }),
		],
		project: () => ({ x: 0, y: 0 }),
		resolveImage: (path) => {
			calls.push(path);
			return Texture.WHITE;
		},
	});

	assert.deepEqual(calls, ['base.png', 'transition.png'], 'resolved, and so added, in layer order');
	assert.equal(layer.children.length, 2);
});

test('placements sharing a layer keep the order the rule pass emitted', () => {
	const layer = new TerrainGraphicsLayer({
		placements: [placement({ x: 1, y: 0 }), placement({ x: 0, y: 0 })],
		project: (x, y) => ({ x, y }),
		resolveImage: () => Texture.WHITE,
	});

	assert.deepEqual(
		positions(layer),
		[
			[1, 0],
			[0, 0],
		],
		'a stable sort must not reorder equal layers',
	);
});

test('setPlacements replaces what the layer draws rather than adding to it', () => {
	const options = {
		placements: [placement({ x: 0, y: 0 }), placement({ x: 1, y: 0 })],
		project: (x: number, y: number) => ({ x, y }),
		resolveImage: () => Texture.WHITE,
	};
	const layer = new TerrainGraphicsLayer(options);

	layer.setPlacements([placement({ x: 9, y: 9 })]);

	assert.equal(layer.children.length, 1);
	assert.deepEqual(positions(layer), [[9, 9]]);
});

test('an empty placement list draws nothing', () => {
	const layer = new TerrainGraphicsLayer({
		placements: [],
		project: cellProjection,
		resolveImage: () => Texture.WHITE,
	});

	assert.equal(layer.children.length, 0);
});

test('every placement resolves its own image through the resolver', () => {
	const resolved: string[] = [];
	new TerrainGraphicsLayer({
		placements: [placement({ x: 0, y: 0, image: 'a.png' }), placement({ x: 1, y: 0, image: 'b.png' })],
		project: (x, y) => ({ x, y }),
		resolveImage: (path) => {
			resolved.push(path);
			return Texture.WHITE;
		},
	});

	assert.deepEqual(resolved, ['a.png', 'b.png']);
});
