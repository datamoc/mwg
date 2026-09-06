import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MultiStageAbility } from '../src/roguelike/MultiStageAbility.ts';

function ability() {
	return new MultiStageAbility([
		{ name: 'windup', duration: 2 },
		{ name: 'active', duration: 1 },
		{ name: 'recovery', duration: 2 },
	]);
}

test('an empty stage list is refused at construction', () => {
	assert.throws(() => new MultiStageAbility([]), /at least one stage/);
});

test('not active until start()', () => {
	const move = ability();
	assert.equal(move.active, false);
	assert.equal(move.stage, null);
	assert.equal(move.advance(), null, 'advancing before start does nothing');
});

test('start enters the first stage; a second start is refused while active', () => {
	const move = ability();
	assert.equal(move.start(), true);
	assert.equal(move.active, true);
	assert.equal(move.stage?.name, 'windup');
	assert.equal(move.start(), false);
});

test('advance stays in a stage until its duration elapses, then reports the new stage name', () => {
	const move = ability();
	move.start();
	assert.equal(move.advance(), null, 'windup turn 1 of 2');
	assert.equal(move.advance(), 'active', 'windup finished, active begins');
	assert.equal(move.stage?.name, 'active');
});

test('the final stage finishing reports done and deactivates', () => {
	const move = ability();
	move.start();
	move.advance(); // windup turn 1 of 2
	move.advance(); // windup -> active
	assert.equal(move.advance(), 'recovery');
	assert.equal(move.advance(), null, 'recovery turn 1 of 2');
	assert.equal(move.advance(), 'done');
	assert.equal(move.active, false);
	assert.equal(move.stage, null);
});

test('cancel ends the ability early', () => {
	const move = ability();
	move.start();
	move.cancel();
	assert.equal(move.active, false);
	assert.equal(move.advance(), null);
});

test('a single-stage ability finishes in one advance', () => {
	const move = new MultiStageAbility([{ name: 'burst', duration: 1 }]);
	move.start();
	assert.equal(move.advance(), 'done');
});

test('round-trips through JSON', () => {
	const move = ability();
	move.start();
	move.advance(); // windup turn 1 of 2
	move.advance(); // now in 'active'

	const stages = [
		{ name: 'windup', duration: 2 },
		{ name: 'active', duration: 1 },
		{ name: 'recovery', duration: 2 },
	];
	const restored = MultiStageAbility.fromJSON(stages, move.toJSON());
	assert.equal(restored.stage?.name, 'active');
	assert.equal(restored.advance(), 'recovery');
});
