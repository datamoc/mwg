import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	exportReplayFile,
	importReplayFile,
	LastRun,
	runCheckpoint,
	resumeRunPlayer,
	downloadReplayFile,
	readReplayFile,
	pickReplayFile,
	parseReplayEvents,
} from '../src/core/index.ts';
import { Recorder, Player, Signal } from '../src/core/index.ts';
import type { ReplayEvent } from '../src/core/index.ts';
import { memoryStorage } from '../src/testing/index.ts';

const EVENTS: ReplayEvent[] = [
	{ frame: 0, action: 'confirm' },
	{ frame: 12, action: 'right' },
];

test('a replay file round-trips through export and import with its seed and identity', () => {
	const json = exportReplayFile(EVENTS, { framework: '0.26.1', game: 'my-game', seed: 7, recordedAt: 5 });
	const file = importReplayFile(json, { framework: '0.26.1', game: 'my-game' });

	assert.deepEqual(file.events, EVENTS);
	assert.equal(file.seed, 7);
	assert.equal(file.game, 'my-game');
	assert.equal(file.framework, '0.26.1');
	assert.equal(file.recordedAt, 5);
});

test('import refuses a file from another game, naming both', () => {
	const json = exportReplayFile(EVENTS, { framework: '0.26.1', game: 'other-game' });

	assert.throws(() => importReplayFile(json, { framework: '0.26.1', game: 'my-game' }), /other-game.*my-game/);
});

test('import refuses a file from another framework build, naming both', () => {
	const json = exportReplayFile(EVENTS, { framework: '0.25.0', game: 'my-game' });

	assert.throws(() => importReplayFile(json, { framework: '0.26.1', game: 'my-game' }), /0\.25\.0.*0\.26\.1/);
});

test('import refuses a file that is not a mwg replay, by format marker and version', () => {
	assert.throws(() => importReplayFile('{"game":"g","framework":"f"}', { framework: 'f', game: 'g' }), /format/);
	assert.throws(
		() =>
			importReplayFile('{"format":"mwg-replay","version":2,"game":"g","framework":"f","events":[]}', {
				framework: 'f',
				game: 'g',
			}),
		/version 2.*not supported/,
	);
	assert.throws(() => importReplayFile('[]', { framework: 'f', game: 'g' }), /must be a JSON object/);
});

test('import treats the file as inbound data: a forbidden key is rejected before anything parses', () => {
	assert.throws(
		() =>
			importReplayFile(
				'{"format":"mwg-replay","version":1,"game":"g","framework":"f","events":[],"__proto__":{"x":1}}',
				{ framework: 'f', game: 'g' },
			),
		/proto/,
	);
});

test('export refuses an empty identity and a non-uint32 seed by name', () => {
	assert.throws(() => exportReplayFile(EVENTS, { framework: '', game: 'g' }), /non-empty framework/);
	assert.throws(() => exportReplayFile(EVENTS, { framework: 'f', game: 'g', seed: -1 }), /uint32/);
	assert.throws(() => exportReplayFile([{ frame: -1, action: 'x' }], { framework: 'f', game: 'g' }), /entry/);
});

test('parseReplayEvents validates an already-parsed array, not only a string', () => {
	assert.deepEqual(parseReplayEvents([{ frame: 3, action: 'a' }]), [{ frame: 3, action: 'a' }]);
	assert.throws(() => parseReplayEvents('not an array' as unknown), /must be an array/);
	assert.throws(() => parseReplayEvents([{ frame: 0.5, action: 'a' }]), /entry/);
});

test('the newest recording is always kept, bounded, and one deep', () => {
	const storage = memoryStorage();
	const last = new LastRun({ namespace: 'test', storage });

	assert.equal(last.load(), null);

	last.keep(EVENTS, 7);
	assert.deepEqual(last.load()?.events, EVENTS);
	assert.equal(last.load()?.seed, 7);

	const newer: ReplayEvent[] = [{ frame: 0, action: 'left' }];
	last.keep(newer);
	assert.deepEqual(last.load()?.events, newer);

	last.clear();
	assert.equal(last.load(), null);
});

test('an oversized recording keeps its newest events, never its oldest', () => {
	const storage = memoryStorage();
	const last = new LastRun({ namespace: 'test', storage, maxEvents: 3 });

	last.keep(Array.from({ length: 5 }, (_, index) => ({ frame: index, action: `a${index}` })));

	assert.deepEqual(last.load()?.events, [
		{ frame: 2, action: 'a2' },
		{ frame: 3, action: 'a3' },
		{ frame: 4, action: 'a4' },
	]);
});

test('a corrupt kept recording throws by name rather than inventing a run', () => {
	const storage = memoryStorage();
	storage.write('mwg-last-run:test', 'not json at all');
	const last = new LastRun({ namespace: 'test', storage });

	assert.throws(() => last.load(), /stored value|not json/);
});

test('a run checkpoint pairs the recording with the state at its current frame', () => {
	const onAction = new Signal<string>();
	const onFrame = new Signal<number>();
	const recorder = new Recorder(onAction, onFrame);
	onAction.dispatch('confirm');
	onFrame.dispatch(0);
	onFrame.dispatch(1);
	onFrame.dispatch(2);

	const checkpoint = runCheckpoint(recorder, { hp: 9 });

	assert.equal(checkpoint.version, 1);
	assert.equal(checkpoint.frame, 3);
	assert.deepEqual(checkpoint.events, [{ frame: 0, action: 'confirm' }]);
	assert.deepEqual(checkpoint.state, { hp: 9 });
});

test('a resumed player skips the events before the checkpoint and continues from its frame', () => {
	const recordFrames = new Signal<number>();
	const recorder = new Recorder(new Signal<string>(), recordFrames);
	recorder.stop();
	const checkpoint = runCheckpoint(recorder, { hp: 9 });

	const onFrame = new Signal<number>();
	const replayed: string[] = [];
	const player = resumeRunPlayer(checkpoint, (action) => replayed.push(action), onFrame);

	onFrame.dispatch(0);
	assert.deepEqual(replayed, []);
	assert.equal(player.done, true);
	player.stop();
});

test('a resumed recording stamps from the checkpoint frame, not from zero', () => {
	const onAction = new Signal<string>();
	const onFrame = new Signal<number>();
	const recorder = new Recorder(onAction, onFrame, { fromFrame: 40 });
	recorder.stop();

	const resumed = new Recorder(onAction, onFrame, { fromFrame: 40 });
	onAction.dispatch('later');
	onFrame.dispatch(0);

	assert.deepEqual(resumed.toJSON(), [{ frame: 40, action: 'later' }]);
	assert.equal(resumed.frame, 41);
	resumed.stop();
});

test('a mid-run restore resumes playback and keeps recording from the same frame', () => {
	const onAction = new Signal<string>();
	const onFrame = new Signal<number>();
	const recorder = new Recorder(onAction, onFrame);
	onAction.dispatch('early');
	onFrame.dispatch(0);
	onFrame.dispatch(1);
	const checkpoint = runCheckpoint(recorder, { hp: 9 });
	recorder.stop();

	//the restored session: playback skips 'early' (its effect is in the restored state)
	const replayed: string[] = [];
	const player = resumeRunPlayer(checkpoint, (action) => replayed.push(action), onFrame);
	assert.deepEqual(replayed, []);
	player.stop();

	//and a new recorder continues the recording from the checkpoint frame
	const continued = new Recorder(onAction, onFrame, { fromFrame: checkpoint.frame });
	onAction.dispatch('after-restore');
	assert.deepEqual(continued.toJSON(), [{ frame: 2, action: 'after-restore' }]);
	continued.stop();
});

test('a player rejects a negative fromFrame and resumes one landing past its start', () => {
	const onFrame = new Signal<number>();
	assert.throws(() => new Player(EVENTS, () => {}, onFrame, { fromFrame: -1 }), /non-negative fromFrame/);

	const replayed: string[] = [];
	const player = new Player(EVENTS, (action) => replayed.push(action), onFrame, { fromFrame: 12 });
	onFrame.dispatch(0);
	assert.deepEqual(replayed, ['right']);
	player.stop();
});

test('the browser download and picker refuse headless use by name, and a Blob reads anywhere', async () => {
	assert.throws(() => downloadReplayFile('{}', 'run.json'), /needs a browser document/);
	await assert.rejects(() => pickReplayFile(), /needs a browser document/);

	const json = exportReplayFile(EVENTS, { framework: '0.26.1', game: 'my-game' });
	const text = await readReplayFile(new Blob([json]));
	assert.deepEqual(importReplayFile(text, { framework: '0.26.1', game: 'my-game' }).events, EVENTS);
});
