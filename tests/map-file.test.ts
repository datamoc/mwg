import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMapFile } from '../src/mwl/MapFile.ts';

/**
 * A `.map` file is a `key=value` header and then comma-separated terrain rows. The loader keeps
 * the header, hands the grid to the same `parseTerrain` an inline `[map] terrain=` uses, and does
 * not pretend to understand what `usage` or `border_size` mean.
 */

test('a header is split off and the grid is parsed', () => {
	const map = parseMapFile('border_size=1\nusage=map\n\nGg, Gg, Gg\nGg, Gg, Gg\n');

	assert.deepEqual(map.header, { border_size: '1', usage: 'map' });
	assert.equal(map.width, 3);
	assert.equal(map.height, 2);
	assert.deepEqual(map.codes, ['Gg', 'Gg', 'Gg', 'Gg', 'Gg', 'Gg']);
});

test('a file with no header is a bare grid', () => {
	const map = parseMapFile('Gg, Gg\nGg, Gg\n');

	assert.deepEqual(map.header, {});
	assert.equal(map.width, 2);
	assert.equal(map.height, 2);
});

test('overlays are kept exactly as written', () => {
	const map = parseMapFile('Gg^Vh, Gg^Efm\n');

	assert.deepEqual(map.codes, ['Gg^Vh', 'Gg^Efm']);
});

test('a trailing separator or spaces do not become an empty cell', () => {
	const map = parseMapFile('Gg, Gg,   \nGg, Gg,\n');

	assert.equal(map.width, 2, 'the trailing comma is not a third column');
	assert.deepEqual(map.codes, ['Gg', 'Gg', 'Gg', 'Gg']);
});

test('a short row is padded with off-map, as an inline terrain string is', () => {
	const map = parseMapFile('Gg, Gg, Gg\nGg\n');

	assert.equal(map.width, 3);
	assert.deepEqual(map.codes, ['Gg', 'Gg', 'Gg', 'Gg', '_off^_usr', '_off^_usr']);
});

test('a side-marked start is reported, the same as inline terrain', () => {
	const map = parseMapFile('Gg, 1 Ke, Gg\nGg, Gg, Gg\n');

	assert.deepEqual(map.codes, ['Gg', 'Ke', 'Gg', 'Gg', 'Gg', 'Gg']);
	assert.deepEqual(map.starts, { 1: [{ x: 1, y: 0 }] });
});

test('an empty file is an empty map rather than an error', () => {
	const map = parseMapFile('');

	assert.deepEqual(map.header, {});
	assert.equal(map.width, 0);
	assert.equal(map.height, 0);
	assert.deepEqual(map.codes, []);
	assert.deepEqual(map.starts, {});
});
