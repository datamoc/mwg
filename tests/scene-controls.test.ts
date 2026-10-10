import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSceneControls } from '../src/testing/SceneControls.ts';

test('scene controls register, list and run steps by name', async () => {
	const controls = createSceneControls();
	const seen: string[] = [];
	controls.register('enterScenario', () => {
		seen.push('enter');
	});
	controls.register('finishTurn', async () => {
		seen.push('finish');
	});
	assert.deepEqual(controls.steps(), ['enterScenario', 'finishTurn']);
	assert.equal(controls.has('enterScenario'), true);
	assert.equal(controls.has('advanceDialogue'), false);
	await controls.run('enterScenario');
	await controls.run('finishTurn');
	assert.deepEqual(seen, ['enter', 'finish']);
});

test('scene controls refuse duplicates, empties and unknown steps by name', async () => {
	const controls = createSceneControls();
	controls.register('finishTurn', () => {});
	assert.throws(() => controls.register('finishTurn', () => {}), /already registered: finishTurn/);
	assert.throws(() => controls.register('', () => {}), /needs a name/);
	await assert.rejects(() => controls.run('advanceDialogue'), /not registered: advanceDialogue/);
});
