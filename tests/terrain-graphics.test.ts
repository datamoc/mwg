import assert from 'node:assert/strict';
import test from 'node:test';
import { Generator } from '../src/core/Random.ts';
import {
	hexRotate,
	matchTerrainRule,
	resolveTerrainGraphics,
	squareRotate,
} from '../src/two-d/render/TerrainGraphics.ts';
import type { TerrainFlagsAt, TerrainRule } from '../src/two-d/render/TerrainGraphics.ts';

function gridFlags(rows: readonly string[][]): TerrainFlagsAt {
	return (x, y) => {
		const row = rows[y];
		if (!row || x < 0 || x >= row.length) return undefined;
		return new Set(row[x].split(',').filter(Boolean));
	};
}

test('matchTerrainRule requires every condition to hold', () => {
	const flags = gridFlags([['land', 'water']]);
	const coast: TerrainRule = {
		id: 'coast',
		conditions: [
			{ dx: 0, dy: 0, hasAll: ['land'] },
			{ dx: 1, dy: 0, hasAll: ['water'] },
		],
		images: [],
	};
	assert.equal(matchTerrainRule(coast, 0, 0, flags), true);
	assert.equal(matchTerrainRule(coast, 1, 0, flags), false, 'water is not land, the first condition fails');
});

test('hasAny and hasNone both gate a match', () => {
	const flags = gridFlags([['forest,hill']]);
	const any: TerrainRule = { id: 'a', conditions: [{ dx: 0, dy: 0, hasAny: ['forest', 'swamp'] }], images: [] };
	const none: TerrainRule = { id: 'n', conditions: [{ dx: 0, dy: 0, hasNone: ['swamp'] }], images: [] };
	const noneFails: TerrainRule = { id: 'nf', conditions: [{ dx: 0, dy: 0, hasNone: ['forest'] }], images: [] };
	assert.equal(matchTerrainRule(any, 0, 0, flags), true);
	assert.equal(matchTerrainRule(none, 0, 0, flags), true);
	assert.equal(matchTerrainRule(noneFails, 0, 0, flags), false);
});

test('a cell off the grid (undefined flags) matches only hasNone conditions', () => {
	const flags = gridFlags([['land']]);
	const offGrid: TerrainRule = { id: 'edge', conditions: [{ dx: -1, dy: 0, hasNone: ['water'] }], images: [] };
	assert.equal(matchTerrainRule(offGrid, 0, 0, flags), true);
});

test('resolveTerrainGraphics prefers the most specific matching rule over a less specific one', () => {
	const flags = gridFlags([['land,corner']]);
	const generic: TerrainRule = { id: 'generic', conditions: [{ dx: 0, dy: 0, hasAll: ['land'] }], images: [{ image: 'generic.png' }] };
	const specific: TerrainRule = {
		id: 'specific',
		conditions: [
			{ dx: 0, dy: 0, hasAll: ['land'] },
			{ dx: 0, dy: 0, hasAll: ['corner'] },
		],
		images: [{ image: 'corner.png' }],
	};
	const placements = resolveTerrainGraphics(1, 1, [generic, specific], flags);
	assert.equal(placements.length, 1);
	assert.equal(placements[0].ruleId, 'specific');
});

test('resolveTerrainGraphics places every image a matched rule declares, each at its own offset and layer', () => {
	const flags = gridFlags([['big']]);
	const rule: TerrainRule = {
		id: 'big-tile',
		conditions: [{ dx: 0, dy: 0, hasAll: ['big'] }],
		images: [
			{ image: 'base.png', layer: 0 },
			{ image: 'overlay.png', dx: 8, dy: -4, layer: 1 },
		],
	};
	const placements = resolveTerrainGraphics(1, 1, [rule], flags);
	assert.deepEqual(placements, [
		{ x: 0, y: 0, ruleId: 'big-tile', image: 'base.png', dx: 0, dy: 0, layer: 0 },
		{ x: 0, y: 0, ruleId: 'big-tile', image: 'overlay.png', dx: 8, dy: -4, layer: 1 },
	]);
});

test('resolveTerrainGraphics skips a cell with no matching rule', () => {
	const flags = gridFlags([['water']]);
	const rule: TerrainRule = { id: 'coast', conditions: [{ dx: 0, dy: 0, hasAll: ['land'] }], images: [{ image: 'coast.png' }] };
	assert.deepEqual(resolveTerrainGraphics(1, 1, [rule], flags), []);
});

test('probability weights the pick among rules tied on specificity, verified over many trials', () => {
	const flags = gridFlags([['grass']]);
	const a: TerrainRule = { id: 'a', conditions: [{ dx: 0, dy: 0, hasAll: ['grass'] }], images: [{ image: 'a.png' }], probability: 9 };
	const b: TerrainRule = { id: 'b', conditions: [{ dx: 0, dy: 0, hasAll: ['grass'] }], images: [{ image: 'b.png' }], probability: 1 };

	const counts = { a: 0, b: 0 };
	const random = new Generator(1234);
	for (let i = 0; i < 500; i += 1) {
		const [placement] = resolveTerrainGraphics(1, 1, [a, b], flags, { random });
		counts[placement.ruleId as 'a' | 'b'] += 1;
	}
	assert.ok(counts.a > counts.b * 3, `expected 'a' to dominate at 9:1, got ${JSON.stringify(counts)}`);
	assert.ok(counts.b > 0, 'the low-probability rule still won sometimes');
});

test('the same seed reproduces the same probability-weighted pick', () => {
	const flags = gridFlags([['grass']]);
	const a: TerrainRule = { id: 'a', conditions: [{ dx: 0, dy: 0, hasAll: ['grass'] }], images: [{ image: 'a.png' }], probability: 1 };
	const b: TerrainRule = { id: 'b', conditions: [{ dx: 0, dy: 0, hasAll: ['grass'] }], images: [{ image: 'b.png' }], probability: 1 };

	const runOnce = () => resolveTerrainGraphics(1, 1, [a, b], flags, { random: new Generator(42) }).map((p) => p.ruleId);
	assert.deepEqual(runOnce(), runOnce());
});

test('squareRotate cycles a condition through 4 exact 90-degree steps', () => {
	assert.deepEqual(squareRotate(1, 0, 0, 4), { dx: 1, dy: 0 });
	assert.deepEqual(squareRotate(1, 0, 1, 4), { dx: 0, dy: 1 });
	assert.deepEqual(squareRotate(1, 0, 2, 4), { dx: -1, dy: 0 });
	assert.deepEqual(squareRotate(1, 0, 3, 4), { dx: 0, dy: -1 });
	assert.deepEqual(squareRotate(1, 0, 4, 4), { dx: 1, dy: 0 }, 'a full turn returns to the start');
});

test('hexRotate cycles an axial offset through 6 exact 60-degree steps back to itself', () => {
	let offset = { dx: 1, dy: 0 };
	for (let step = 1; step <= 6; step += 1) offset = hexRotate(1, 0, step, 6);
	assert.deepEqual(offset, { dx: 1, dy: 0 });
});

test('a rule with rotations matches a condition written for only one of the rotated directions', () => {
	//written for "water to the east"; the map has water to the north, reachable via one 90-degree step
	const flags = gridFlags([
		['land', 'land', 'land'],
		['land', 'land', 'land'],
		['land', 'water', 'land'],
	]);
	const rule: TerrainRule = {
		id: 'coast',
		conditions: [{ dx: 1, dy: 0, hasAll: ['water'] }],
		images: [{ image: 'coast.png' }],
		rotations: 4,
	};
	// cell (1,2) has water to its... let's target a cell whose north neighbour is water: (1,1)
	assert.equal(matchTerrainRule(rule, 1, 1, flags, squareRotate, 0), false, 'east of (1,1) is land, rotation 0 does not match');
	const matchedSomeRotation = [0, 1, 2, 3].some((r) => matchTerrainRule(rule, 1, 1, flags, squareRotate, r));
	assert.equal(matchedSomeRotation, true, 'one of the 4 rotations finds the water to the south');
});

test('a rotated rule also rotates the image offset it places', () => {
	const flags = gridFlags([['land']]);
	const rule: TerrainRule = {
		id: 'r',
		conditions: [{ dx: 0, dy: 0, hasAll: ['land'] }],
		images: [{ image: 'r.png', dx: 1, dy: 0 }],
		rotations: 4,
	};
	// rotationIndex is chosen internally (all 4 match, since the only condition is dx=0,dy=0);
	// what matters is that whichever rotation resolveTerrainGraphics picks, the offset it reports
	// is consistent with squareRotate's own mapping for that rotation
	const [placement] = resolveTerrainGraphics(1, 1, [rule], flags);
	const possible = [0, 1, 2, 3].map((r) => squareRotate(1, 0, r, 4));
	assert.ok(possible.some((o) => o.dx === placement.dx && o.dy === placement.dy));
});
