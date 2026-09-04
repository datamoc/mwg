import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FactionFog } from '../src/board/FogOfWar.ts';

test('faction fog unions current vision and keeps explored memory', () => {
	const fog = new FactionFog(4, 3);
	const cells = (source: { x: number; y: number }) => [source, { x: source.x + 1, y: source.y }];
	fog.sync('red', [{ x: 0, y: 0 }, { x: 2, y: 2 }], cells);
	assert.equal(fog.isVisible('red', 1, 0), true);
	assert.equal(fog.isVisible('red', 3, 2), true);
	fog.sync('red', [{ x: 0, y: 0 }], cells);
	assert.equal(fog.isVisible('red', 3, 2), false);
	assert.equal(fog.isExplored('red', 3, 2), true);
});

test('faction fog rejects invalid dimensions and ignores out-of-bounds vision', () => {
	assert.throws(() => new FactionFog(0, 2));
	const fog = new FactionFog(2, 2);
	fog.sync('blue', [{ x: -1, y: -1 }], () => [{ x: -1, y: -1 }, { x: 0, y: 0 }]);
	assert.deepEqual(fog.visibleCells('blue'), [0]);
});
