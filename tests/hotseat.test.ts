import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as Input from '../src/core/Input.ts';
import { Hotseat } from '../src/core/Hotseat.ts';
import { PlayerInput } from '../src/core/PlayerInput.ts';
import { fakeGamepad } from '../src/testing/index.ts';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

test('turns run in the listed order and wrap back to the first player', async () => {
	const hotseat = new Hotseat(['a', 'b', 'c']);
	hotseat.begin();

	assert.equal(hotseat.active, 'a');
	assert.equal(hotseat.activeIndex, 0);

	await hotseat.next();
	assert.equal(hotseat.active, 'b');
	assert.equal(hotseat.activeIndex, 1);

	await hotseat.next();
	assert.equal(hotseat.active, 'c');
	assert.equal(hotseat.activeIndex, 2);

	await hotseat.next();
	assert.equal(hotseat.active, 'a', 'the turn order should wrap');
	assert.equal(hotseat.activeIndex, 0);

	assert.deepEqual(hotseat.players, ['a', 'b', 'c']);
});

test('onTurnStart and onTurnEnd fire in order as the turn moves on', async () => {
	const log: string[] = [];
	const hotseat = new Hotseat(['a', 'b'], {
		onTurnStart: (player) => log.push(`start ${player}`),
		onTurnEnd: (player) => log.push(`end ${player}`),
	});

	hotseat.begin();
	assert.deepEqual(log, ['start a'], 'begin() starts the first turn');

	await hotseat.next();
	assert.deepEqual(log, ['start a', 'end a', 'start b']);
});

test('nothing is active before begin(), and next() there simply starts the first turn', async () => {
	const log: string[] = [];
	const hotseat = new Hotseat(['a', 'b'], {
		onTurnStart: (player) => log.push(`start ${player}`),
		onTurnEnd: (player) => log.push(`end ${player}`),
	});

	assert.equal(hotseat.active, null);
	assert.equal(hotseat.acceptsInput('a'), false);

	await hotseat.next();
	assert.deepEqual(log, ['start a']);
	assert.equal(hotseat.active, 'a');
});

test('requestHandOver is awaited before the next player becomes active', async () => {
	const gate = deferred();
	const log: string[] = [];
	const hotseat = new Hotseat(['a', 'b'], {
		onTurnStart: (player) => log.push(`start ${player}`),
		onTurnEnd: (player) => log.push(`end ${player}`),
		requestHandOver: (from, to) => {
			log.push(`handover ${from}->${to}`);
			return gate.promise;
		},
	});
	hotseat.begin();

	const advancing = hotseat.next();
	assert.deepEqual(log, ['start a', 'end a', 'handover a->b']);
	assert.equal(hotseat.active, null, 'nobody may act while the hand-over screen is up');
	assert.equal(hotseat.acceptsInput('b'), false);

	gate.resolve();
	await advancing;
	assert.deepEqual(log, ['start a', 'end a', 'handover a->b', 'start b']);
	assert.equal(hotseat.active, 'b');
});

test('a synchronous requestHandOver runs without deferring the new turn to a microtask', () => {
	const log: string[] = [];
	const hotseat = new Hotseat(['a', 'b'], {
		requestHandOver: (from, to) => {
			log.push(`handover ${from}->${to}`);
		},
	});
	hotseat.begin();

	void hotseat.next();
	assert.deepEqual(log, ['handover a->b']);
	assert.equal(hotseat.active, 'b', 'the turn should already have moved on');
});

test('gatedInput lets only the active player through, even when every real input reports the same press', async () => {
	const p1 = new PlayerInput('gate-p1', { padIndex: 70 });
	const p2 = new PlayerInput('gate-p2', { padIndex: 71 });
	p1.bindButton('confirm', [0]);
	p2.bindButton('confirm', [0]);

	const hotseat = new Hotseat(['gate-p1', 'gate-p2']);
	hotseat.begin();

	const gated1 = hotseat.gatedInput(p1);
	const gated2 = hotseat.gatedInput(p2);

	//both pads are pressed, so both real inputs report it
	Input.pollGamepads([fakeGamepad(70, [1]), fakeGamepad(71, [1])]);
	assert.equal(p1.isDown('confirm'), true);
	assert.equal(p2.isDown('confirm'), true);

	assert.equal(gated1.isDown('confirm'), true);
	assert.equal(gated2.isDown('confirm'), false, 'player 2 is not the active player');
	assert.equal(gated1.justPressed('confirm'), true);
	assert.equal(gated2.justPressed('confirm'), false);

	await hotseat.next();
	assert.equal(gated1.isDown('confirm'), false);
	assert.equal(gated2.isDown('confirm'), true, 'the gate should follow the active player');

	Input.pollGamepads([]);
	Input.endFrame();
});

test('the turn clock counts down and stops at zero without autoAdvance', () => {
	const hotseat = new Hotseat(['a', 'b'], { turnSeconds: 10 });
	hotseat.begin();

	assert.equal(hotseat.turnRemaining, 10);
	hotseat.update(4);
	assert.equal(hotseat.turnRemaining, 6);
	assert.equal(hotseat.expired, false);

	hotseat.update(6);
	assert.equal(hotseat.turnRemaining, 0);
	assert.equal(hotseat.expired, true);
	assert.equal(hotseat.active, 'a', 'an expired clock without autoAdvance leaves the turn where it is');

	hotseat.update(5);
	assert.equal(hotseat.turnRemaining, 0, 'the clock should not go negative');
});

test('an expired clock auto-advances when autoAdvance is on', () => {
	const hotseat = new Hotseat(['a', 'b'], { turnSeconds: 5, autoAdvance: true });
	hotseat.begin();
	assert.equal(hotseat.active, 'a');

	hotseat.update(3);
	assert.equal(hotseat.active, 'a');

	hotseat.update(2);
	assert.equal(hotseat.active, 'b', 'the clock running out should hand the turn to the next player');
	assert.equal(hotseat.turnRemaining, 5, 'the new turn starts on a full clock');
	assert.equal(hotseat.expired, false);
});

test('a game with no turn clock reports no remaining time and ignores update', () => {
	const hotseat = new Hotseat(['a', 'b']);
	hotseat.begin();

	assert.equal(hotseat.turnRemaining, null);
	hotseat.update(1000);
	assert.equal(hotseat.active, 'a');
	assert.equal(hotseat.expired, false);
});

test('reset stops the turn and makes the given index the next one to begin', async () => {
	const log: string[] = [];
	const hotseat = new Hotseat(['a', 'b', 'c'], { turnSeconds: 10, onTurnStart: (player) => log.push(player) });
	hotseat.begin();
	hotseat.update(4);

	hotseat.reset(2);
	assert.equal(hotseat.active, null);
	assert.equal(hotseat.turnRemaining, 10, 'reset should refill the clock');
	assert.equal(hotseat.activeIndex, 2);

	hotseat.begin();
	assert.equal(hotseat.active, 'c');
	assert.deepEqual(log, ['a', 'c']);

	await hotseat.next();
	assert.equal(hotseat.active, 'a', 'wrapping from the last player goes back to the first');

	assert.throws(() => hotseat.reset(3), /reset index/);
	assert.throws(() => hotseat.reset(-1), /reset index/);
});

test('an invalid player list throws rather than starting an impossible turn order', () => {
	assert.throws(() => new Hotseat([]), /at least two players/);
	assert.throws(() => new Hotseat(['a']), /at least two players/);
	assert.throws(() => new Hotseat(['a', 'a']), /listed twice/);
	assert.throws(() => new Hotseat(['a', '']), /non-empty id/);
	assert.throws(() => new Hotseat(['a', 'b'], { turnSeconds: 0 }), /turnSeconds/);
	assert.throws(() => new Hotseat(['a', 'b'], { turnSeconds: Number.NaN }), /turnSeconds/);
});
