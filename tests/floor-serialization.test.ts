import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { Secrets } from '../src/roguelike/Secrets.ts';
import { Doors } from '../src/roguelike/Doors.ts';

const kinds = [
	{ passable: false, transparent: false },
	{ passable: true, transparent: true },
	{ passable: true, transparent: true },
	{ passable: true, transparent: true },
	{ passable: false, transparent: false },
];

function floor(): Level {
	const level = new Level(8, 8, kinds);
	level.fillRect({ left: 1, top: 1, right: 6, bottom: 6 }, 1);
	level.rooms = [{ left: 1, top: 1, right: 6, bottom: 6 }];
	return level;
}

test('a level round-trips terrain, shape and rooms', () => {
	const level = floor();
	level.set(2, 2, 3);
	const restored = Level.fromJSON(kinds, level.toJSON());
	assert.equal(restored.width, 8);
	assert.equal(restored.shape, 'square');
	assert.equal(restored.get(2, 2), 3);
	assert.equal(restored.passable(2, 2), true);
	assert.deepEqual(restored.rooms, [{ left: 1, top: 1, right: 6, bottom: 6 }]);
	//the restore is a copy, not an alias
	level.set(2, 2, 1);
	assert.equal(restored.get(2, 2), 3);
});

test('secrets round-trip concealed and discovered cells alike', () => {
	const level = floor();
	const secrets = new Secrets(level);
	secrets.conceal(2, 2, 1, 2);
	secrets.conceal(3, 3, 1, 2);
	secrets.discover(3, 3);

	const fresh = floor();
	const restored = Secrets.fromJSON(fresh, secrets.toJSON());
	assert.equal(restored.isSecret(2, 2), true, 'still hidden');
	assert.equal(restored.isSecret(3, 3), false, 'already discovered');
	assert.equal(restored.discover(2, 2), true);
	assert.equal(fresh.get(2, 2), 2, 'discovery still swaps the terrain');
});

test('doors round-trip open state and locks, and terrain follows', () => {
	const level = floor();
	const doors = new Doors(level);
	doors.place(2, 2, { open: 3, closed: 4, startOpen: false });
	doors.place(4, 4, { open: 3, closed: 4, locked: 'key', startOpen: false });
	doors.open(2, 2);

	const fresh = floor();
	const restored = Doors.fromJSON(fresh, doors.toJSON());
	assert.equal(restored.isOpen(2, 2), true);
	assert.equal(fresh.get(2, 2), 3, 'an open door restores as open terrain');
	assert.equal(restored.isLocked(4, 4), true);
	assert.equal(restored.requiredKey(4, 4), 'key');
	assert.equal(fresh.get(4, 4), 4, 'a locked door restores as closed terrain');
	assert.equal(restored.isDoor(5, 5), false);
});
