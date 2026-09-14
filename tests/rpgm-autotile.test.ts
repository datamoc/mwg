import test from 'node:test';
import assert from 'node:assert/strict';
import { RpgmAutotileAtlas, rpgmAutotileFrame, type RpgmAutotileShapeTable } from '../src/two-d/render/RpgmAutotile.ts';

const table: RpgmAutotileShapeTable = Array.from(
	{ length: 48 },
	() =>
		[
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		] as const,
);

test('rpgmAutotileFrame composes quadrants in row-major output order', () => {
	const frame = rpgmAutotileFrame(7, 0, 3, table);

	assert.deepEqual(frame.quadrants, [
		{ sourceX: 0, sourceY: 0, destinationX: 0, destinationY: 0 },
		{ sourceX: 24, sourceY: 0, destinationX: 24, destinationY: 0 },
		{ sourceX: 0, sourceY: 24, destinationX: 0, destinationY: 24 },
		{ sourceX: 24, sourceY: 24, destinationX: 24, destinationY: 24 },
	]);
});

test('rpgmAutotileFrame follows each RPG Maker slot atlas origin', () => {
	for (const slot of [0, 1, 2, 3] as const) {
		const frame = rpgmAutotileFrame(0, slot, 0, table);
		assert.equal(frame.quadrants[0].sourceX, 0, `slot ${slot} x origin`);
		assert.equal(frame.quadrants[0].sourceY, 0, `slot ${slot} y origin`);
	}

	assert.equal(rpgmAutotileFrame(96, 0, 0, table).quadrants[0].sourceY, 144);
	assert.equal(rpgmAutotileFrame(48, 1, 0, table).quadrants[0].sourceX, 96);
	assert.equal(rpgmAutotileFrame(7, 0, 0, table).destinationX, 336);
	assert.equal(rpgmAutotileFrame(7, 0, 0, table).destinationY, 0);
});

test('RpgmAutotileAtlas caches a frame and can clear its cache', () => {
	const atlas = new RpgmAutotileAtlas(table);
	const first = atlas.get(12, 2, 4);
	assert.equal(atlas.get(12, 2, 4), first);
	atlas.clear();
	assert.notEqual(atlas.get(12, 2, 4), first);
});

test('RPG Maker autotile geometry rejects invalid ids, slots, shapes, and tables', () => {
	assert.throws(() => rpgmAutotileFrame(-1, 0, 0, table), /tileId must be non-negative/);
	assert.throws(() => rpgmAutotileFrame(0, 4 as never, 0, table), /slot must be 0, 1, 2, or 3/);
	assert.throws(() => rpgmAutotileFrame(0, 0, 48, table), /outside the table/);
	assert.throws(() => rpgmAutotileFrame(0, 0, 0, []), /cannot be empty/);
	assert.throws(() => new RpgmAutotileAtlas([[[0, 0]]] as never), /needs exactly 4 quadrants/);
});
