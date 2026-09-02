import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QuestLog, type QuestDefinition } from '../src/rpg/Quest.ts';
import { GameState } from '../src/rpg/GameState.ts';

test('a quest with no prerequisites is available before it starts', () => {
	const log = new QuestLog();
	log.define({ id: 'intro', stages: [{}] });

	assert.equal(log.status('intro'), 'available');
	assert.equal(log.canStart('intro'), true);
});

test('starting a quest puts it on its first stage', () => {
	const log = new QuestLog();
	log.define({ id: 'intro', stages: [{ description: 'say hello' }, { description: 'wave goodbye' }] });

	log.start('intro');
	assert.equal(log.status('intro'), 'active');
	assert.deepEqual(log.currentStage('intro'), { description: 'say hello' });
});

test('a quest with an unmet prerequisite is unavailable, and refuses to start', () => {
	const log = new QuestLog();
	log.define({ id: 'a', stages: [{}] });
	log.define({ id: 'b', stages: [{}], requires: ['a'] });

	assert.equal(log.status('b'), 'unavailable');
	assert.throws(() => log.start('b'));
});

test('a quest becomes available once its prerequisite completes', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'a', stages: [{ condition: { switch: 'doneA', equals: true } }] });
	log.define({ id: 'b', stages: [{}], requires: ['a'] });

	log.start('a');
	assert.equal(log.status('b'), 'unavailable');

	state.setSwitch('doneA', true);
	assert.equal(log.advance('a', state), true);
	assert.equal(log.status('a'), 'complete');
	assert.equal(log.status('b'), 'available');
	assert.equal(log.canStart('b'), true);
});

test('advance does nothing while the current stage condition is unmet', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'q', stages: [{ condition: { switch: 'ready', equals: true } }] });
	log.start('q');

	assert.equal(log.advance('q', state), false);
	assert.equal(log.status('q'), 'active');
});

test('a counter stage completes once the tracked variable reaches its target', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'hunt', stages: [{ counter: { variable: 'ratsKilled', target: 5 } }] });
	log.start('hunt');

	state.setVariable('ratsKilled', 3);
	assert.equal(log.progress('hunt', state), 0.6);
	assert.equal(log.advance('hunt', state), false);

	state.setVariable('ratsKilled', 5);
	assert.equal(log.advance('hunt', state), true);
	assert.equal(log.status('hunt'), 'complete');
});

test('progress is null for a condition stage and for a quest not on a counter stage', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'q', stages: [{ condition: { switch: 'x', equals: true } }] });
	log.start('q');

	assert.equal(log.progress('q', state), null);
});

test('a stage with neither a condition nor a counter completes the instant it is current', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'q', stages: [{ description: 'milestone' }, {}] });
	log.start('q');

	assert.equal(log.advance('q', state), true);
	assert.equal(log.status('q'), 'active'); // second (also milestone) stage now current

	assert.equal(log.advance('q', state), true);
	assert.equal(log.status('q'), 'complete');
});

test('advancing a complete quest again does nothing further', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({ id: 'q', stages: [{}] });
	log.start('q');

	log.advance('q', state);
	assert.equal(log.status('q'), 'complete');
	assert.equal(log.advance('q', state), false);
});

test('a multi-stage quest advances one stage per call, even if two are already satisfied', () => {
	const log = new QuestLog();
	const state = new GameState();
	log.define({
		id: 'q',
		stages: [{ condition: { switch: 'a', equals: true } }, { condition: { switch: 'b', equals: true } }],
	});
	log.start('q');

	state.setSwitch('a', true);
	state.setSwitch('b', true); // already true too, but only one stage should move per call

	assert.equal(log.advance('q', state), true);
	assert.equal(log.status('q'), 'active');
	assert.equal(log.advance('q', state), true);
	assert.equal(log.status('q'), 'complete');
});

test('status and currentStage throw for an undefined quest', () => {
	const log = new QuestLog();
	assert.throws(() => log.status('ghost'));
	assert.throws(() => log.currentStage('ghost'));
});

test('toJSON/fromJSON round-trips a quest log, definitions supplied fresh', () => {
	const definitions: QuestDefinition[] = [
		{ id: 'a', stages: [{ condition: { switch: 'x', equals: true } }, {}] },
		{ id: 'b', stages: [{}], requires: ['a'] },
	];

	const log = new QuestLog();
	for (const q of definitions) log.define(q);
	log.start('a');
	const state = new GameState();
	state.setSwitch('x', true);
	log.advance('a', state);

	const restored = QuestLog.fromJSON(definitions, log.toJSON());
	assert.equal(restored.status('a'), 'active');
	assert.deepEqual(restored.currentStage('a'), {});
	assert.equal(restored.status('b'), 'unavailable');
});
