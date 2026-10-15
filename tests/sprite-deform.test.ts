import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, TextureSource } from 'pixi.js';

import { DeformableSprite, PinnedDeform } from '../src/two-d/render/SpriteDeform.ts';

/**
 * Item 414: pinned-point sprite deformation. `PinnedDeform` is pure math and
 * `DeformableSprite` is Pixi's `MeshPlane` driven by one, so everything here
 * runs headless: the vertex buffers are plain `Float32Array`s until a renderer
 * uploads them. The browser check (`tools/check-sprite-deform-browser.mjs`)
 * proves the same drag renders through the real GPU path.
 */

function near(actual: number, expected: number, label: string): void {
	assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: expected ~${expected}, saw ${actual}`);
}

function wingTexture(): Texture {
	return new Texture({ source: new TextureSource({ width: 96, height: 64 }) });
}

function positionsOf(sprite: DeformableSprite): Float32Array {
	return Float32Array.from(sprite.geometry.getAttribute('aPosition').buffer.data as Float32Array);
}

function uvsOf(sprite: DeformableSprite): Float32Array {
	return Float32Array.from(sprite.geometry.getAttribute('aUV').buffer.data as Float32Array);
}

test('a new grid rests exactly on its rectangle, corners included', () => {
	const wing = new PinnedDeform({ columns: 4, rows: 3, width: 96, height: 64 });
	assert.equal(wing.count, 12);
	assert.deepEqual(wing.at(wing.indexOf(0, 0)), { x: 0, y: 0 });
	assert.deepEqual(wing.at(wing.indexOf(3, 0)), { x: 96, y: 0 });
	assert.deepEqual(wing.at(wing.indexOf(0, 2)), { x: 0, y: 64 });
	assert.deepEqual(wing.at(wing.indexOf(3, 2)), { x: 96, y: 64 });
	near(wing.at(wing.indexOf(1, 1)).x, 32, 'an interior column');
	near(wing.at(wing.indexOf(1, 1)).y, 32, 'an interior row');
	assert.equal(wing.movedCount(), 0);
});

test('dragging one wingtip point leaves every other point bit-identical', () => {
	const wing = new PinnedDeform({ columns: 4, rows: 4, width: 96, height: 64 });
	const before = wing.positions();
	const tip = wing.indexOf(3, 0);
	wing.drag(tip, 102, -6);
	assert.deepEqual(wing.at(tip), { x: 102, y: -6 });
	assert.equal(wing.movedCount(), 1);
	assert.equal(wing.isMoved(tip), true);
	const after = wing.positions();
	for (let index = 0; index < wing.count; index++) {
		if (index === tip) continue;
		assert.equal(after[index * 2], before[index * 2], `pinned point ${index} keeps its x`);
		assert.equal(after[index * 2 + 1], before[index * 2 + 1], `pinned point ${index} keeps its y`);
		assert.equal(wing.isMoved(index), false);
	}
});

test('a nudge accumulates onto the same point while the rest stay pinned', () => {
	const wing = new PinnedDeform({ columns: 3, rows: 3, width: 90, height: 60 });
	const tip = wing.indexOf(2, 0);
	wing.nudge(tip, 3, -2);
	wing.nudge(tip, 3, -2);
	assert.deepEqual(wing.at(tip), { x: 96, y: -4 });
	assert.equal(wing.movedCount(), 1);
	assert.deepEqual(wing.at(wing.indexOf(0, 0)), { x: 0, y: 0 });
});

test('resetting one point restores it while a second drag stays moved', () => {
	const wing = new PinnedDeform({ columns: 3, rows: 3, width: 90, height: 60 });
	const first = wing.indexOf(2, 0);
	const second = wing.indexOf(2, 2);
	wing.drag(first, 100, -10);
	wing.drag(second, 100, 70);
	wing.reset(first);
	assert.deepEqual(wing.at(first), wing.restAt(first));
	assert.deepEqual(wing.at(second), { x: 100, y: 70 });
	wing.reset();
	assert.equal(wing.movedCount(), 0);
	assert.deepEqual(wing.at(second), wing.restAt(second));
});

test('a grid smaller than 2x2 or without a positive size throws', () => {
	assert.throws(() => new PinnedDeform({ columns: 1, rows: 3, width: 96, height: 64 }), RangeError);
	assert.throws(() => new PinnedDeform({ columns: 3, rows: 1, width: 96, height: 64 }), RangeError);
	assert.throws(() => new PinnedDeform({ columns: 2.5, rows: 3, width: 96, height: 64 }), RangeError);
	assert.throws(() => new PinnedDeform({ columns: 3, rows: 3, width: 0, height: 64 }), RangeError);
	assert.throws(() => new PinnedDeform({ columns: 3, rows: 3, width: 96, height: -1 }), RangeError);
	assert.throws(() => new PinnedDeform({ columns: 3, rows: 3, width: Number.NaN, height: 64 }), RangeError);
});

test('unknown point indexes and wild coordinates throw', () => {
	const wing = new PinnedDeform({ columns: 3, rows: 3, width: 90, height: 60 });
	assert.throws(() => wing.at(9), RangeError);
	assert.throws(() => wing.indexOf(3, 0), RangeError);
	assert.throws(() => wing.indexOf(0, -1), RangeError);
	assert.throws(() => wing.drag(0, Number.NaN, 0), Error);
	assert.throws(() => wing.drag(0, 0, Number.POSITIVE_INFINITY), Error);
	assert.throws(() => wing.nudge(-1, 1, 1), RangeError);
	assert.throws(() => wing.reset(12), RangeError);
});

test('rebase adopts the given rest positions and clears every offset', () => {
	const wing = new PinnedDeform({ columns: 2, rows: 2, width: 10, height: 10 });
	wing.drag(3, 99, 99);
	wing.rebase(new Float32Array([0, 0, 20, 0, 0, 30, 20, 30]));
	assert.equal(wing.movedCount(), 0);
	assert.deepEqual(wing.at(3), { x: 20, y: 30 });
	assert.throws(() => wing.rebase(new Float32Array([0, 0, 0])), Error);
});

test('writePositions refuses a wrongly sized target', () => {
	const wing = new PinnedDeform({ columns: 2, rows: 2, width: 10, height: 10 });
	assert.throws(() => wing.writePositions(new Float32Array(3)), Error);
	const into = new Float32Array(8);
	wing.writePositions(into);
	assert.deepEqual(Array.from(into), [0, 0, 10, 0, 0, 10, 10, 10]);
});

test('a deformable sprite starts at rest with no whole-sprite rotation', () => {
	const wing = new DeformableSprite(wingTexture(), { columns: 4, rows: 4 });
	try {
		assert.equal(wing.count, 16);
		assert.equal(wing.rotation, 0);
		assert.equal(wing.movedCount(), 0);
		near(wing.vertexAt(wing.indexOf(3, 0)).x, 96, 'the wingtip rests at the texture edge');
		near(wing.vertexAt(wing.indexOf(0, 2)).y, 64 * (2 / 3), 'an interior pinned row');
	} finally {
		wing.destroy();
	}
});

test('omitted density builds a 4x4 grid and wild density throws', () => {
	const wing = new DeformableSprite(wingTexture());
	try {
		assert.equal(wing.columns, 4);
		assert.equal(wing.rows, 4);
	} finally {
		wing.destroy();
	}
	assert.throws(() => new DeformableSprite(wingTexture(), { columns: 1, rows: 4 }), RangeError);
});

test('dragging the wingtip vertex lands in the GPU buffer while pinned vertices stay', () => {
	const wing = new DeformableSprite(wingTexture(), { columns: 4, rows: 4 });
	try {
		const tip = wing.indexOf(3, 0);
		const before = positionsOf(wing);
		wing.dragVertex(tip, 102, -6);
		const after = positionsOf(wing);
		near(after[tip * 2], 102, 'the dragged tip x');
		near(after[tip * 2 + 1], -6, 'the dragged tip y');
		for (let index = 0; index < wing.count; index++) {
			if (index === tip) continue;
			assert.equal(after[index * 2], before[index * 2], `pinned vertex ${index} keeps its buffer x`);
			assert.equal(after[index * 2 + 1], before[index * 2 + 1], `pinned vertex ${index} keeps its buffer y`);
		}
		assert.equal(wing.rotation, 0, 'dragging never turns the whole sprite');
		assert.equal(wing.movedCount(), 1);
	} finally {
		wing.destroy();
	}
});

test('a drag leaves the mesh uvs untouched', () => {
	const wing = new DeformableSprite(wingTexture(), { columns: 4, rows: 4 });
	try {
		const before = uvsOf(wing);
		wing.dragVertex(wing.indexOf(3, 0), 102, -6);
		wing.nudgeVertex(wing.indexOf(3, 3), 4, 4);
		assert.deepEqual(uvsOf(wing), before);
	} finally {
		wing.destroy();
	}
});

test('resetVertices restores the mesh buffer to rest', () => {
	const wing = new DeformableSprite(wingTexture(), { columns: 4, rows: 4 });
	try {
		const rest = positionsOf(wing);
		const tip = wing.indexOf(3, 0);
		wing.dragVertex(tip, 102, -6);
		wing.resetVertices(tip);
		assert.deepEqual(positionsOf(wing), rest);
		wing.dragVertex(tip, 102, -6);
		wing.resetVertices();
		assert.deepEqual(positionsOf(wing), rest);
		assert.throws(() => wing.dragVertex(16, 0, 0), RangeError);
	} finally {
		wing.destroy();
	}
});

test('a batched wing flap updates only its selected rows and invalid batches change nothing', () => {
	const wing = new DeformableSprite(wingTexture(), { columns: 2, rows: 5 });
	try {
		const rest = positionsOf(wing);
		const tip = wing.indexOf(0, 0);
		const tip2 = wing.indexOf(1, 0);
		wing.dragVertices([
			{ index: tip, x: 0, y: 20 },
			{ index: tip2, x: 96, y: 20 },
		]);
		assert.equal(wing.vertexAt(tip).y, 20);
		assert.equal(wing.movedCount(), 2);
		for (let index = 2; index < wing.count; index++) {
			assert.equal(positionsOf(wing)[index * 2], rest[index * 2]);
			assert.equal(positionsOf(wing)[index * 2 + 1], rest[index * 2 + 1]);
		}
		const before = positionsOf(wing);
		assert.throws(
			() =>
				wing.dragVertices([
					{ index: tip, x: 0, y: 99 },
					{ index: 999, x: 0, y: 0 },
				]),
			/outside/,
		);
		assert.deepEqual(positionsOf(wing), before);
		assert.equal(wing.vertexAt(tip).y, 20);
	} finally {
		wing.destroy();
	}
});
