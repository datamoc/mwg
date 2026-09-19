import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	RPGM_AUTOTILE_SLOT_BASES,
	RPGM_AUTOTILE_SLOT_COUNTS,
	RPGM_FLOOR_AUTOTILE_TABLE,
	RPGM_WALL_AUTOTILE_TABLE,
	XP_AUTOTILE_PATTERNS,
	XP_NEIGHBORS_TO_PATTERN,
	assertAutotileLayout,
	autotileCellParts,
	rpgmAutotileFrame,
	rpgmAutotileSlot,
	xpAutotilePattern,
	xpAutotileRef,
} from '../src/two-d/render/RpgmAutotile.ts';

test('the slot address facts match the A-sheet geometry', () => {
	assert.deepEqual([...RPGM_AUTOTILE_SLOT_BASES], [2048, 2816, 4352, 5888]);
	assert.deepEqual([...RPGM_AUTOTILE_SLOT_COUNTS], [768, 1536, 1536, 2304]);
	assert.equal(RPGM_FLOOR_AUTOTILE_TABLE.length, 48);
	assert.equal(RPGM_WALL_AUTOTILE_TABLE.length, 16);
	//the wall table's thirteenth row borrows the left column, not the middle one
	assert.deepEqual(
		RPGM_WALL_AUTOTILE_TABLE[13].map((pair) => [...pair]),
		[
			[0, 2],
			[3, 2],
			[0, 3],
			[3, 3],
		],
	);
	assert.deepEqual(
		RPGM_FLOOR_AUTOTILE_TABLE[47].map((pair) => [...pair]),
		[
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		],
	);
});

test('rpgmAutotileSlot classifies raw MV ids by family range', () => {
	assert.equal(rpgmAutotileSlot(2048), 0);
	assert.equal(rpgmAutotileSlot(2815), 0);
	assert.equal(rpgmAutotileSlot(2816), 1);
	assert.equal(rpgmAutotileSlot(4351), 1);
	assert.equal(rpgmAutotileSlot(4352), 2);
	assert.equal(rpgmAutotileSlot(5887), 2);
	assert.equal(rpgmAutotileSlot(5888), 3);
	assert.equal(rpgmAutotileSlot(8191), 3);
	assert.equal(rpgmAutotileSlot(2047), null);
	assert.equal(rpgmAutotileSlot(8192), null);
	assert.equal(rpgmAutotileSlot(1536), null);
	assert.equal(rpgmAutotileSlot(42), null);
	assert.equal(rpgmAutotileSlot(-1), null);
	assert.equal(rpgmAutotileSlot(2048.5), null);
});

test('xpAutotileRef splits a cell into image and pattern', () => {
	assert.deepEqual(xpAutotileRef(1), { index: 0, pattern: 1 });
	assert.deepEqual(xpAutotileRef(47), { index: 0, pattern: 47 });
	assert.deepEqual(xpAutotileRef(48), { index: 1, pattern: 0 });
	assert.deepEqual(xpAutotileRef(97), { index: 2, pattern: 1 });
	assert.deepEqual(xpAutotileRef(383), { index: 7, pattern: 47 });
	assert.equal(xpAutotileRef(0), null);
	assert.equal(xpAutotileRef(-1), null);
	assert.equal(xpAutotileRef(384), null);
	assert.equal(xpAutotileRef(1000), null);
	assert.equal(xpAutotileRef(1.5), null);
});

test('the XP pattern table holds 48 mini-block quads on a 6-column grid', () => {
	assert.equal(XP_AUTOTILE_PATTERNS.length, 48);
	assert.deepEqual([...XP_AUTOTILE_PATTERNS[0]], [26, 27, 32, 33]);
	assert.deepEqual([...XP_AUTOTILE_PATTERNS[47]], [0, 1, 6, 7]);
	for (const pattern of XP_AUTOTILE_PATTERNS) {
		assert.equal(pattern.length, 4);
		for (const block of pattern) {
			assert.ok(block >= 0 && block < 48, `mini-block ${block} fits the 6 by 8 template grid`);
		}
	}
});

test('xpAutotilePattern reads the neighbourhood in engine bit order', () => {
	const calls: Array<[number, number]> = [];
	const probe = (dx: number, dy: number) => {
		calls.push([dx, dy]);
		return false;
	};
	assert.equal(xpAutotilePattern(probe), 46);
	assert.deepEqual(calls, [
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
	]);
	assert.equal(XP_NEIGHBORS_TO_PATTERN.length, 256);
	assert.equal(XP_NEIGHBORS_TO_PATTERN[255], 0);
	assert.equal(XP_NEIGHBORS_TO_PATTERN[0], 46);
	assert.equal(
		xpAutotilePattern(() => true),
		0,
	);
	//east and west open, everything else land: the horizontal strip pattern
	assert.equal(
		xpAutotilePattern((dx, dy) => dy === 0 && dx !== 0),
		33,
	);
	//north alone: mask 0x01 reads the table's second entry
	assert.equal(
		xpAutotilePattern((dx, dy) => dx === 0 && dy === -1),
		XP_NEIGHBORS_TO_PATTERN[1],
	);
});

test('assertAutotileLayout accepts sound layouts and names each defect', () => {
	assertAutotileLayout({ format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[0, 1, 2]] });
	assertAutotileLayout({ format: 'rpgm-mv', slot: 3, table: RPGM_WALL_AUTOTILE_TABLE, cycles: [] });
	assertAutotileLayout({ format: 'rpgm-xp', index: 2, frames: 1, single: false });
	assertAutotileLayout({ format: 'rpgm-xp', index: 7, frames: 4, single: true });

	assert.throws(
		() =>
			assertAutotileLayout({ format: 'rpgm-mv', slot: 4 as never, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [] }),
		/slot/,
	);
	assert.throws(() => assertAutotileLayout({ format: 'rpgm-mv', slot: 0, table: [], cycles: [] }), /empty/);
	assert.throws(
		() => assertAutotileLayout({ format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[]] }),
		/at least one kind/,
	);
	assert.throws(
		() => assertAutotileLayout({ format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[0, 16]] }),
		/outside slot 0/,
	);
	assert.throws(
		() => assertAutotileLayout({ format: 'rpgm-mv', slot: 1, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[15]] }),
		/outside slot 1/,
	);
	assert.throws(() => assertAutotileLayout({ format: 'rpgm-xp', index: 8, frames: 1, single: false }), /0-7/);
	assert.throws(() => assertAutotileLayout({ format: 'rpgm-xp', index: -1, frames: 1, single: false }), /0-7/);
	assert.throws(() => assertAutotileLayout({ format: 'rpgm-xp', index: 0, frames: 0, single: false }), /at least 1/);
	assert.throws(
		() => assertAutotileLayout({ format: 'rpgm-xp', index: 0, frames: 1.5, single: false }),
		/at least 1/,
	);
});

test('MV cells resolve to the same quadrants the frame geometry describes', () => {
	const layout = { format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [] } as const;
	for (const tile of [2048, 2049, 2095, 2096, 2143, 2815]) {
		const parts = autotileCellParts(layout, tile, 0);
		assert.ok(parts && parts.length === 4);
		const offset = tile - 2048;
		const described = rpgmAutotileFrame(
			Math.floor(offset / 48) * 48 + (offset % 48),
			0,
			offset % 48,
			RPGM_FLOOR_AUTOTILE_TABLE,
		);
		for (let q = 0; q < 4; q++) {
			assert.equal(parts[q].sourceX, described.quadrants[q].sourceX);
			assert.equal(parts[q].sourceY, described.quadrants[q].sourceY);
			assert.equal(parts[q].sourceWidth, 24);
			assert.equal(parts[q].sourceHeight, 24);
			assert.equal(parts[q].destX, (q % 2) / 2);
			assert.equal(parts[q].destY, Math.floor(q / 2) / 2);
			assert.equal(parts[q].destWidth, 1 / 2);
			assert.equal(parts[q].destHeight, 1 / 2);
		}
	}
	//the first A1 tile, pinned: shape zero samples the template's second row
	const first = autotileCellParts(layout, 2048, 0);
	assert.deepEqual(
		first?.map((part) => [part.sourceX, part.sourceY]),
		[
			[48, 96],
			[24, 96],
			[48, 72],
			[24, 72],
		],
	);
	//wall families cycle their 16-entry table across all 48 baked shapes
	const wall = { format: 'rpgm-mv', slot: 3, table: RPGM_WALL_AUTOTILE_TABLE, cycles: [] } as const;
	const wallParts = autotileCellParts(wall, 5888 + 47, 0);
	const wallDescribed = rpgmAutotileFrame(47, 3, 47 % 16, RPGM_WALL_AUTOTILE_TABLE);
	assert.deepEqual(
		wallParts?.map((part) => [part.sourceX, part.sourceY]),
		wallDescribed.quadrants.map((quadrant) => [quadrant.sourceX, quadrant.sourceY]),
	);
});

test('MV animation cycles remap kinds and wrap around', () => {
	const layout = { format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[0, 1, 2]] } as const;
	const frame1 = autotileCellParts(layout, 2048, 1);
	const kind1 = autotileCellParts({ ...layout, cycles: [] }, 2096, 0);
	assert.deepEqual(frame1, kind1);
	//frame 3 wraps back onto frame 0 for a 3-kind cycle
	assert.deepEqual(autotileCellParts(layout, 2048, 3), autotileCellParts(layout, 2048, 0));
	//a kind outside every cycle ignores the frame entirely
	const still = { format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [[0, 1, 2]] } as const;
	assert.deepEqual(autotileCellParts(still, 2288, 2), autotileCellParts(still, 2288, 0));
});

test('cell resolution blanks non-positive tiles and rejects the rest loudly', () => {
	const layout = { format: 'rpgm-mv', slot: 0, table: RPGM_FLOOR_AUTOTILE_TABLE, cycles: [] } as const;
	assert.equal(autotileCellParts(layout, 0, 0), null);
	assert.equal(autotileCellParts(layout, -1, 0), null);
	assert.throws(() => autotileCellParts(layout, 2047, 0), /outside slot 0/);
	assert.throws(() => autotileCellParts(layout, 2816, 0), /outside slot 0/);
	assert.throws(() => autotileCellParts(layout, 2048.5, 0), /outside slot 0/);
	assert.throws(() => autotileCellParts(layout, 2048, -1), /at or above zero/);
	assert.throws(() => autotileCellParts(layout, 2048, 1.5), /at or above zero/);

	const xp = { format: 'rpgm-xp', index: 2, frames: 1, single: false } as const;
	assert.equal(autotileCellParts(xp, 0, 0), null);
	assert.throws(() => autotileCellParts(xp, 96 - 48, 0), /outside XP autotile 2/);
	assert.throws(() => autotileCellParts(xp, 384, 0), /outside XP autotile 2/);
	assert.throws(() => autotileCellParts(xp, 97, -1), /at or above zero/);
});

test('XP template cells sample the 6-column mini-grid, one stripe per frame', () => {
	const layout = { format: 'rpgm-xp', index: 2, frames: 2, single: false } as const;
	//tile 97 is pattern 1: mini-blocks 4, 27, 32, 33
	const parts = autotileCellParts(layout, 97, 0);
	assert.deepEqual(
		parts?.map((part) => [part.sourceX, part.sourceY, part.sourceWidth, part.sourceHeight]),
		[
			[64, 0, 16, 16],
			[48, 64, 16, 16],
			[32, 80, 16, 16],
			[48, 80, 16, 16],
		],
	);
	assert.deepEqual(
		parts?.map((part) => [part.destX, part.destY, part.destWidth, part.destHeight]),
		[
			[0, 0, 0.5, 0.5],
			[0.5, 0, 0.5, 0.5],
			[0, 0.5, 0.5, 0.5],
			[0.5, 0.5, 0.5, 0.5],
		],
	);
	//the second stripe shifts every source rect one frame width east
	const framed = autotileCellParts(layout, 97, 1);
	assert.deepEqual(
		framed?.map((part) => [part.sourceX, part.sourceY]),
		parts?.map((part) => [part.sourceX + 96, part.sourceY]),
	);
	//frames wrap around the stripe count
	assert.deepEqual(autotileCellParts(layout, 97, 2), parts);
});

test('XP single-tile strips draw one whole tile per frame', () => {
	const layout = { format: 'rpgm-xp', index: 0, frames: 4, single: true } as const;
	const parts = autotileCellParts(layout, 3, 0);
	assert.equal(parts?.length, 1);
	assert.deepEqual(
		parts?.map((part) => [part.sourceX, part.sourceY, part.sourceWidth, part.sourceHeight]),
		[[0, 0, 32, 32]],
	);
	assert.deepEqual(
		parts?.map((part) => [part.destX, part.destY, part.destWidth, part.destHeight]),
		[[0, 0, 1, 1]],
	);
	assert.equal(autotileCellParts(layout, 3, 2)?.[0].sourceX, 64);
	assert.equal(autotileCellParts(layout, 3, 4)?.[0].sourceX, 0);
});
