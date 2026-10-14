import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSceneControls } from '../src/testing/SceneControls.ts';
import { validateScenarioPlan, verifyScenarios } from '../tools/verify-scenarios.mjs';

test('scenario plans refuse empty coverage, duplicate IDs and missing bot or verification steps', () => {
	const entry = { id: 'one', enter: 'enter', turn: ['bot'], verify: 'verify' };
	assert.deepEqual(validateScenarioPlan([entry]), [entry]);
	for (const plan of [
		[],
		[entry, entry],
		[{ ...entry, turn: [] }],
		[{ ...entry, verify: '' }],
		[{ ...entry, leave: 3 }],
	])
		assert.throws(() => validateScenarioPlan(plan));
});

test('one file page runs all scenarios, all sides, checks and cleanup even after a failed scenario', async () => {
	const folder = mkdtempSync(join(tmpdir(), 'mwg-scenarios-'));
	const file = join(folder, 'index.html');
	try {
		writeFileSync(
			file,
			`<script>
			${createSceneControls.toString()}
			const controls = createSceneControls();
			let side = 0, turns = 0, cleaned = false;
			controls.register('bad', () => { throw new Error('broken scenario'); });
			controls.register('leave', () => { cleaned = true; });
			controls.register('good', () => { if (!cleaned) throw new Error('cleanup missed'); side = 0; });
			controls.register('humanBot', () => { if (side !== 0) throw new Error('wrong side'); side = 1; });
			controls.register('enemyBot', async () => { if (side !== 1) throw new Error('wrong side'); side = 0; turns++; });
			controls.register('verify', () => { if (side !== 0 || turns < 1) throw new Error('turn incomplete'); });
			controls.register('done', () => { if (turns !== 3) throw new Error('missing turns'); });
			window.__MWG_SCENARIOS__ = { controls, scenarios: [
				{ id: 'bad', enter: 'bad', turn: ['humanBot', 'enemyBot'], verify: 'verify', leave: 'leave' },
				{ id: 'good', enter: 'good', turn: ['humanBot', 'enemyBot'], verify: 'verify', leave: 'done' }
			] };
		</script>`,
		);
		const report = await verifyScenarios({ file });
		assert.equal(report.ok, false);
		assert.deepEqual(report.scenarios, [
			{ id: 'bad', turns: 0, ok: false },
			{ id: 'good', turns: 3, ok: true },
		]);
		assert.equal(report.failures.length, 1);
		assert.match(report.failures[0], /bad: .*broken scenario/);
		await assert.rejects(verifyScenarios({ file, only: 'absent' }), /no scenarios match/);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
});

test('a timed out scene step aborts the page without running cleanup or overlapping another scenario', async () => {
	const folder = mkdtempSync(join(tmpdir(), 'mwg-scenarios-timeout-'));
	const file = join(folder, 'index.html');
	try {
		writeFileSync(
			file,
			`<script>
			${createSceneControls.toString()}
			const controls = createSceneControls();
			controls.register('hang', () => new Promise(() => {}));
			controls.register('forbidden', () => { console.error('overlapping scenario'); });
			window.__MWG_SCENARIOS__ = { controls, scenarios: [
				{ id: 'hang', enter: 'hang', turn: ['forbidden'], verify: 'forbidden', leave: 'forbidden' },
				{ id: 'next', enter: 'forbidden', turn: ['forbidden'], verify: 'forbidden' }
			] };
		</script>`,
		);
		const report = await verifyScenarios({ file, timeoutMs: 2000 });
		assert.deepEqual(report.scenarios, [{ id: 'hang', turns: 0, ok: false }]);
		assert.equal(report.failures.length, 1);
		assert.match(report.failures[0], /scene step exceeded 2000 ms/);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
});

test('missing scene controls fail preflight before any scenario mutates game state', async () => {
	const folder = mkdtempSync(join(tmpdir(), 'mwg-scenarios-preflight-'));
	const file = join(folder, 'index.html');
	try {
		writeFileSync(
			file,
			`<script>
			${createSceneControls.toString()}
			const controls = createSceneControls();
			controls.register('enter', () => { throw new Error('should not enter'); });
			window.__MWG_SCENARIOS__ = { controls, scenarios: [
				{ id: 'one', enter: 'enter', turn: ['missingBot'], verify: 'enter' }
			] };
		</script>`,
		);
		await assert.rejects(verifyScenarios({ file }), /step is not registered: missingBot/);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
});
