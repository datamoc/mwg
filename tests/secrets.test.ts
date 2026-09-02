import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { Secrets } from '../src/roguelike/Secrets.ts';

const WALL = 0;
const FLOOR = 1;
const TRAP = 2;

const KINDS = [
	{ passable: false, transparent: false }, // WALL
	{ passable: true, transparent: true }, // FLOOR
	{ passable: true, transparent: true }, // TRAP - passable, but reads differently once seen
];

test('a concealed secret door behaves exactly like the terrain it is disguised as', () => {
	const level = new Level(5, 5, KINDS, FLOOR);
	const secrets = new Secrets(level);

	secrets.conceal(2, 2, WALL, FLOOR);

	assert.equal(level.passable(2, 2), false);
	assert.equal(level.transparent(2, 2), false);
	assert.equal(secrets.isSecret(2, 2), true);
	assert.equal(secrets.isDiscovered(2, 2), false);
});

test('discovering swaps the cell to its revealed kind, exactly once', () => {
	const level = new Level(5, 5, KINDS, FLOOR);
	const secrets = new Secrets(level);
	secrets.conceal(2, 2, WALL, FLOOR);

	assert.equal(secrets.discover(2, 2), true);
	assert.equal(level.passable(2, 2), true);
	assert.equal(secrets.isSecret(2, 2), false);
	assert.equal(secrets.isDiscovered(2, 2), true);

	//a second search finds nothing new
	assert.equal(secrets.discover(2, 2), false);
});

test('a hidden trap stays passable while concealed, and only its rendered kind changes on discovery', () => {
	const level = new Level(5, 5, KINDS, FLOOR);
	const secrets = new Secrets(level);
	secrets.conceal(3, 1, FLOOR, TRAP);

	assert.equal(level.passable(3, 1), true);
	assert.equal(level.get(3, 1), FLOOR);

	secrets.discover(3, 1);
	assert.equal(level.get(3, 1), TRAP);
});

test('a cell with no secret is never discoverable', () => {
	const level = new Level(5, 5, KINDS, FLOOR);
	const secrets = new Secrets(level);

	assert.equal(secrets.isSecret(1, 1), false);
	assert.equal(secrets.discover(1, 1), false);
});

test('concealing a cell again resets its discovered state', () => {
	const level = new Level(5, 5, KINDS, FLOOR);
	const secrets = new Secrets(level);
	secrets.conceal(2, 2, WALL, FLOOR);
	secrets.discover(2, 2);

	secrets.conceal(2, 2, WALL, FLOOR);
	assert.equal(secrets.isSecret(2, 2), true);
	assert.equal(secrets.isDiscovered(2, 2), false);
});
