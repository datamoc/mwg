import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Level } from '../src/roguelike/Level.ts';
import { Secrets } from '../src/roguelike/Secrets.ts';
import { Doors } from '../src/roguelike/Doors.ts';
import { GameState } from '../src/rpg/GameState.ts';
import { Blob } from '../src/core/Blob.ts';

/**
 * Saves written by an earlier release must still load.
 *
 * The round-trip tests prove a value survives being written and read by the *same* build.
 * These fixtures are frozen blobs committed to the repository, so a schema change that stops
 * an already-shipped save from loading fails here, at the version it breaks, rather than in a
 * bug report from a player who carried a save across an update.
 *
 * When a shape genuinely changes, add a migration and a new fixture beside the old one rather
 * than editing the committed blob: the old file is what a player's browser still holds.
 */

const FIXTURES = resolve(import.meta.dirname, 'fixtures', 'saves');

// `fromJSON` takes the game's own terrain kind table, so it is not part of a saved blob and is
// supplied here the same way a loading game supplies it. Must match the ids the fixture was
// written against: 3 and 4 are a door's open and closed terrain, 2 a secret's real terrain.
const KINDS = [
	{ passable: false, transparent: false },
	{ passable: true, transparent: true },
	{ passable: true, transparent: true },
	{ passable: true, transparent: true },
	{ passable: false, transparent: false },
];

function fixture<T>(name: string): T {
	return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as T;
}

test('a released floor fixture still restores terrain, rooms, secrets and doors', () => {
	const data = fixture<{
		level: Parameters<typeof Level.fromJSON>[1];
		secrets: Parameters<typeof Secrets.fromJSON>[1];
		doors: Parameters<typeof Doors.fromJSON>[1];
	}>('floor.json');

	const level = Level.fromJSON(KINDS, data.level);
	assert.equal(level.width, 8);
	assert.equal(level.height, 8);
	assert.equal(level.get(2, 2), 3, 'open door terrain');
	assert.deepEqual(level.rooms, [{ left: 1, top: 1, right: 6, bottom: 6 }]);

	const secrets = Secrets.fromJSON(level, data.secrets);
	assert.equal(secrets.isSecret(4, 4), true, 'a concealed cell is still concealed');

	const doors = Doors.fromJSON(level, data.doors);
	assert.equal(doors.isOpen(2, 2), true);
});

test('a released game-state fixture still restores switches and variables', () => {
	const state = GameState.fromJSON(fixture<Parameters<typeof GameState.fromJSON>[0]>('game-state.json'));

	assert.equal(state.switch('metShopkeeper'), true);
	assert.equal(state.switch('foundSword'), false);
	assert.equal(state.variable('gold'), 50);
	assert.equal(state.variable('depth'), 3);
});

test('a released blob fixture still restores per-cell volume', () => {
	const blob = Blob.fromJSON(fixture<Parameters<typeof Blob.fromJSON>[0]>('blob.json'));

	assert.equal(blob.width, 4);
	assert.equal(blob.volumeAt(1, 1), 5);
	assert.equal(blob.volumeAt(2, 2), 2);
	assert.equal(blob.total(), 7);
});
