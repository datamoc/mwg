import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { TARGETS } from './helpers/fuzz-worker.ts';

/**
 * Seeded fuzzing of every decoder that reads outside input (item 376): mutated saves, replays,
 * MWL, maps, expressions, Twee, dialogue text, Fluent, gettext and Ruby Marshal. Fixed seeds keep
 * it deterministic, so a failure here reproduces exactly; `MWG_FUZZ_ITERATIONS` runs longer
 * locally. Each target runs in a worker that is terminated after `TIME_LIMIT_MS`, which is what
 * turns an infinite loop into a failed test instead of a stuck test run.
 */
const ITERATIONS = Number(process.env.MWG_FUZZ_ITERATIONS ?? 400);
const TIME_LIMIT_MS = 20_000;

function runTarget(name: string, seed: number): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./helpers/fuzz-worker.ts', import.meta.url), {
			workerData: { name, iterations: ITERATIONS, seed },
		});
		const timer = setTimeout(() => {
			void worker.terminate();
			reject(new Error(`${name}: no result within ${TIME_LIMIT_MS} ms, a decoder is looping`));
		}, TIME_LIMIT_MS);
		worker.once('message', (result) => {
			clearTimeout(timer);
			void worker.terminate();
			resolve(result);
		});
		worker.once('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

for (const name of Object.keys(TARGETS)) {
	test(`fuzz: ${name} returns or throws a named Error for every mutated input`, async () => {
		assert.equal(await runTarget(name, 0x6d7767), null);
	});
}

//the defects the fuzzing found, pinned as ordinary regressions so they stay fixed at any seed
test('regression: deeply nested input fails with a message instead of overflowing the stack', async () => {
	const { parseExpression } = await import('../src/mwl/expression.ts');
	const { decodeMarshal } = await import('../src/rpg/Marshal.ts');
	assert.throws(() => parseExpression('('.repeat(20000) + '1'), /nested more than 256 deep/);
	assert.throws(() => parseExpression('2' + '^2'.repeat(5000)), /more than|nested/);
	assert.throws(() => parseExpression(Array(5000).fill('1').join('+')), /more than 4096 operators/);
	assert.equal(parseExpression('((1 + 2) * 3) ^ 2').kind, 'binary');
	const nested = [4, 8];
	for (let i = 0; i < 50000; i++) nested.push(0x5b, 6);
	nested.push(0x30);
	assert.throws(() => decodeMarshal(Uint8Array.from(nested)), /Marshal: values nested more than 1000 deep/);
});

test('regression: map text is parsed in linear time and bounded in size', async () => {
	const { parseMapFile } = await import('../src/mwl/MapFile.ts');
	const { parseTerrain } = await import('../src/mwl/runtime.ts');
	const start = performance.now();
	parseMapFile('Gg, Gg' + ' '.repeat(200_000) + '\nGg, Gg');
	assert.ok(performance.now() - start < 250, 'trailing whitespace is trimmed without backtracking');
	assert.equal(parseTerrain('Gg\n'.repeat(200_000)).height, 200_000, 'many rows do not overflow the stack');
	assert.throws(() => parseTerrain(`${','.repeat(2000)}\n`.repeat(1000)), /more than 1048576 cells/);
});
