import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TileMap, EMPTY } from '../src/render/TileMap.ts';
import { SpriteSheet } from '../src/render/SpriteSheet.ts';
import { Texture, TextureSource } from 'pixi.js';
import { automap, type AutomapRule } from '../src/rpg/automap.ts';

function sheet(): SpriteSheet {
	const source = new TextureSource({ width: 64, height: 64 });
	return SpriteSheet.fromTexture(new Texture({ source }), 16, 16);
}

/** a 4x1 map with one layer, for single-row rules */
function strip(cells: number[]): TileMap {
	const map = new TileMap({ width: 4, height: 1, sheet: sheet() });
	map.addLayer('ground', cells);
	return map;
}

test('a matching pattern is replaced, and the rest of the map is untouched', () => {
	const map = strip([1, 1, 2, 2]);
	const rule: AutomapRule = {
		width: 2,
		height: 1,
		input: { ground: [1, 1] },
		outputs: [{ ground: [7, 7] }],
	};

	assert.equal(automap(map, [rule]), 1);
	assert.deepEqual(
		[map.getTile('ground', 0, 0), map.getTile('ground', 1, 0), map.getTile('ground', 2, 0), map.getTile('ground', 3, 0)],
		[7, 7, 2, 2]
	);
});

test('an empty input cell constrains nothing, and an empty output cell writes nothing', () => {
	const map = strip([1, 5, 1, 9]);
	const rule: AutomapRule = {
		width: 2,
		height: 1,
		input: { ground: [1, EMPTY] },
		outputs: [{ ground: [EMPTY, 8] }],
	};

	assert.equal(automap(map, [rule]), 2);
	assert.deepEqual(
		[map.getTile('ground', 0, 0), map.getTile('ground', 1, 0), map.getTile('ground', 2, 0), map.getTile('ground', 3, 0)],
		[1, 8, 1, 8]
	);
});

test('rules apply in order, so a later rule overrides an earlier one', () => {
	const map = strip([1, 1, 1, 1]);

	const matches = automap(map, [
		{ name: 'first', width: 1, height: 1, input: { ground: [1] }, outputs: [{ ground: [2] }] },
		{ name: 'second', width: 1, height: 1, input: { ground: [2] }, outputs: [{ ground: [3] }] },
	]);

	assert.equal(matches, 8); //four origins times two rules
	assert.deepEqual(
		[map.getTile('ground', 0, 0), map.getTile('ground', 3, 0)],
		[3, 3]
	);
});

test('a rule never sees its own writes within one pass', () => {
	const map = strip([1, 1, 1, 1]);

	//if writes were visible mid-pass, the fresh 2s would match again and cascade to 3
	const matches = automap(map, [
		{ width: 1, height: 1, input: { ground: [1] }, outputs: [{ ground: [2] }] },
	]);

	assert.equal(matches, 4);
	assert.equal(map.getTile('ground', 0, 0), 2);
});

test('several outputs are random variation, picked per match', () => {
	const map = strip([1, 1, 1, 1]);
	const picked: number[] = [];

	const matches = automap(
		map,
		[{ width: 1, height: 1, input: { ground: [1] }, outputs: [{ ground: [2] }, { ground: [3] }] }],
		{
			pick: (variants) => {
				assert.equal(variants, 2);
				picked.push(1);
				return 1;
			},
		}
	);

	assert.equal(matches, 4);
	assert.deepEqual(picked, [1, 1, 1, 1]);
	assert.equal(map.getTile('ground', 2, 0), 3);
});

test('a pattern larger than the map matches nowhere', () => {
	const map = strip([1, 1, 1, 1]);
	assert.equal(
		automap(map, [{ width: 5, height: 1, input: { ground: [1, 1, 1, 1, 1] }, outputs: [{ ground: [2, 2, 2, 2, 2] }] }]),
		0
	);
	assert.equal(map.getTile('ground', 0, 0), 1);
});

test('a misshapen rule is an authoring error', () => {
	const map = strip([1, 1, 1, 1]);
	assert.throws(
		() => automap(map, [{ name: 'bad', width: 2, height: 1, input: { ground: [1] }, outputs: [{ ground: [2, 2] }] }]),
		/input "ground" has 1 cells, but the pattern is 2/
	);
	assert.throws(
		() => automap(map, [{ width: 1, height: 1, input: { ground: [1] }, outputs: [] }]),
		/no outputs/
	);
	assert.throws(() => automap(map, [{ width: 0, height: 1, input: {}, outputs: [{}] }]), /positive width/);
});
