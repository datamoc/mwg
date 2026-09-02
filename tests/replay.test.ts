import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Signal } from '../src/core/Signal.ts';
import { Recorder, Player, serializeReplay, deserializeReplay } from '../src/core/Replay.ts';

function harness() {
	return { actions: new Signal<string>(), frames: new Signal<number>() };
}

test('actions are stamped with the frame count at dispatch time', () => {
	const { actions, frames } = harness();
	const recorder = new Recorder(actions, frames);

	actions.dispatch('up'); //frame 0
	frames.dispatch(1 / 60);
	frames.dispatch(1 / 60);
	actions.dispatch('confirm'); //frame 2

	assert.deepEqual(recorder.toJSON(), [
		{ frame: 0, action: 'up' },
		{ frame: 2, action: 'confirm' },
	]);
	recorder.stop();
});

test('several actions on one frame keep their order', () => {
	const { actions, frames } = harness();
	const recorder = new Recorder(actions, frames);

	actions.dispatch('left');
	actions.dispatch('left');
	actions.dispatch('confirm');

	assert.deepEqual(
		recorder.toJSON().map((e) => e.action),
		['left', 'left', 'confirm'],
	);
	recorder.stop();
});

test('recording never swallows the action it observes', () => {
	const { actions, frames } = harness();
	const recorder = new Recorder(actions, frames);
	let second = 0;
	actions.add(() => {
		second++;
	});

	actions.dispatch('up');

	assert.equal(second, 1);
	recorder.stop();
});

test('stop detaches both listeners', () => {
	const { actions, frames } = harness();
	const recorder = new Recorder(actions, frames);
	recorder.stop();
	recorder.stop(); //safe to call twice

	actions.dispatch('up');
	frames.dispatch(1 / 60);
	actions.dispatch('down');

	assert.deepEqual(recorder.toJSON(), []);
	assert.equal(actions.size, 0);
	assert.equal(frames.size, 0);
});

test('a replay survives serialisation', () => {
	const { actions, frames } = harness();
	const recorder = new Recorder(actions, frames);
	actions.dispatch('up');
	frames.dispatch(1 / 60);
	actions.dispatch('confirm');
	recorder.stop();

	const revived = deserializeReplay(serializeReplay(recorder.toJSON()));
	assert.deepEqual(revived, [
		{ frame: 0, action: 'up' },
		{ frame: 1, action: 'confirm' },
	]);
});

test('deserialisation rejects anything that is not a replay', () => {
	assert.throws(() => deserializeReplay('{"frame":0}'), /array/);
	assert.throws(() => deserializeReplay('[1]'), /non-negative integer/);
	assert.throws(() => deserializeReplay('[{"frame":-1,"action":"up"}]'), /non-negative integer/);
	assert.throws(() => deserializeReplay('[{"frame":1.5,"action":"up"}]'), /non-negative integer/);
	assert.throws(() => deserializeReplay('[{"frame":0}]'), /string/);
	assert.throws(() => deserializeReplay('null'), /array/);
});

test('the player re-dispatches each event on its recorded frame', () => {
	const { frames } = harness();
	const seen: Array<{ frame: number; action: string }> = [];
	let now = -1;
	const player = new Player(
		[
			{ frame: 0, action: 'up' },
			{ frame: 2, action: 'left' },
			{ frame: 2, action: 'confirm' },
		],
		(action) => seen.push({ frame: now, action }),
		frames,
	);

	for (now = 0; now < 4; now++) frames.dispatch(1 / 60);

	assert.deepEqual(seen, [
		{ frame: 0, action: 'up' },
		{ frame: 2, action: 'left' },
		{ frame: 2, action: 'confirm' },
	]);
	assert.equal(player.done, true);
	player.stop();
});

test('record then replay reproduces the same actions at the same frames', () => {
	const live = harness();
	const recorder = new Recorder(live.actions, live.frames);
	live.actions.dispatch('down');
	live.frames.dispatch(1 / 60);
	live.frames.dispatch(1 / 60);
	live.actions.dispatch('menu');
	recorder.stop();

	const replay = harness();
	const seen: Array<{ frame: number; action: string }> = [];
	let now = -1;
	const player = new Player(
		deserializeReplay(serializeReplay(recorder.toJSON())),
		(action) => seen.push({ frame: now, action }),
		replay.frames,
	);
	for (now = 0; now < 3; now++) replay.frames.dispatch(1 / 60);

	assert.deepEqual(seen, [
		{ frame: 0, action: 'down' },
		{ frame: 2, action: 'menu' },
	]);
	assert.equal(player.done, true);
	player.stop();
});
