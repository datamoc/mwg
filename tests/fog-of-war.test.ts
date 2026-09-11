import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FactionFog } from '../src/board/FogOfWar.ts';

test('faction fog unions current vision and keeps explored memory', () => {
	const fog = new FactionFog(4, 3);
	const cells = (source: { x: number; y: number }) => [source, { x: source.x + 1, y: source.y }];
	fog.sync(
		'red',
		[
			{ x: 0, y: 0 },
			{ x: 2, y: 2 },
		],
		cells,
	);
	assert.equal(fog.isVisible('red', 1, 0), true);
	assert.equal(fog.isVisible('red', 3, 2), true);
	fog.sync('red', [{ x: 0, y: 0 }], cells);
	assert.equal(fog.isVisible('red', 3, 2), false);
	assert.equal(fog.isExplored('red', 3, 2), true);
});

test('faction fog rejects invalid dimensions and ignores out-of-bounds vision', () => {
	assert.throws(() => new FactionFog(0, 2));
	const fog = new FactionFog(2, 2);
	fog.sync('blue', [{ x: -1, y: -1 }], () => [
		{ x: -1, y: -1 },
		{ x: 0, y: 0 },
	]);
	assert.deepEqual(fog.visibleCells('blue'), [0]);
});

test('reveal lifts shroud without changing current vision', () => {
	const fog = new FactionFog(3, 3);
	fog.sync('red', [{ x: 0, y: 0 }], (source) => [source]);
	fog.reveal('red', [
		{ x: 2, y: 2 },
		{ x: 9, y: 9 },
	]);
	assert.equal(fog.isExplored('red', 2, 2), true);
	assert.equal(fog.isVisible('red', 2, 2), false);
	assert.equal(fog.isExplored('red', 1, 1), false);
});

test('sees() answers exactly what isVisible() answers, and follows a later sync', () => {
	const fog = new FactionFog(3, 3);
	fog.sync('blue', [{ x: 1, y: 1 }], (source) => [source, { x: source.x + 1, y: source.y }]);

	const sees = fog.sees('blue');
	for (let y = 0; y < 3; y++) {
		for (let x = 0; x < 3; x++) {
			assert.equal(sees(x, y), fog.isVisible('blue', x, y), `cell ${x},${y} must read the same either way`);
		}
	}
	assert.equal(sees(2, 1), true);
	assert.equal(sees(0, 0), false);

	// the predicate is a view of the shroud, not a copy of it: a caller holding one across a sync
	// sees the update, which is what lets a score view be handed the same predicate every turn
	fog.sync('blue', [{ x: 0, y: 0 }], (source) => [source]);
	assert.equal(sees(2, 1), false);
	assert.equal(sees(0, 0), true);
});

test('nothing is shared until asked, and then the two see one map between them', () => {
	const fog = new FactionFog(4, 4);
	const cells = (source: { x: number; y: number }) => [source];
	fog.sync('blue', [{ x: 0, y: 0 }], cells);
	fog.sync('green', [{ x: 3, y: 3 }], cells);

	assert.equal(fog.isVisible('green', 0, 0), false, 'green sees nothing of blue s yet');
	assert.equal(fog.isVisible('blue', 3, 3), false, 'and blue nothing of green s');

	fog.share(['blue', 'green']);

	assert.equal(fog.isVisible('green', 0, 0), true, 'now blue s scout watches for green');
	assert.equal(fog.isVisible('blue', 3, 3), true, 'and the other way round');
	assert.equal(fog.isVisible('blue', 1, 1), false, 'sharing is not seeing the whole map');
});

test('sharing covers the remembered shroud as well as what is lit now', () => {
	const fog = new FactionFog(4, 4);
	fog.sync('blue', [{ x: 0, y: 0 }], (source) => [source]);
	fog.sync('blue', [], () => []); // the scout leaves: remembered, no longer visible
	fog.share(['blue', 'green']);

	assert.equal(fog.isVisible('green', 0, 0), false, 'nothing is lit there any more');
	assert.equal(fog.isExplored('green', 0, 0), true, 'but green knows what blue saw');
});

test('sharing again widens the group instead of replacing it', () => {
	const fog = new FactionFog(4, 4);
	fog.sync('teal', [{ x: 2, y: 2 }], (source) => [source]);

	fog.share(['blue', 'green']);
	fog.share(['green', 'teal']);

	assert.equal(fog.isVisible('blue', 2, 2), true, 'blue was not carved out of green s group');
	assert.equal(fog.isVisible('teal', 2, 2), true);
	assert.equal(fog.isVisible('green', 2, 2), true, 'and green still sees its own');
});

test('a share declared after a sync counts, because the group is read when asked', () => {
	const fog = new FactionFog(4, 4);
	fog.sync('red', [{ x: 1, y: 1 }], (source) => [source, { x: source.x + 1, y: source.y }]);

	assert.deepEqual(fog.visibleCells('red'), [5, 6], 'its own cells, in the order they were lit');

	fog.share(['red', 'orange']);
	assert.deepEqual(fog.visibleCells('orange'), [5, 6], 'orange reads the same cells');
	assert.deepEqual(fog.exploredCells('orange'), [5, 6]);
});

test('a shared view is the union of the group, sorted, and nobody else sees it', () => {
	const fog = new FactionFog(4, 4);
	fog.sync('blue', [{ x: 3, y: 3 }], (source) => [source]);
	fog.sync('green', [{ x: 0, y: 0 }], (source) => [source]);
	fog.sync('red', [{ x: 2, y: 0 }], (source) => [source]);
	fog.share(['blue', 'green']);

	assert.deepEqual(fog.visibleCells('blue'), [0, 15], 'lowest cell first, whoever lit it');
	assert.deepEqual(fog.visibleCells('green'), [0, 15]);
	assert.deepEqual(fog.visibleCells('red'), [2], 'a side outside the group keeps its own eyes');
	assert.equal(fog.isVisible('red', 0, 0), false);

	fog.share([]); // asked for nothing, so nothing changes
	assert.deepEqual(fog.visibleCells('blue'), [0, 15]);
});
