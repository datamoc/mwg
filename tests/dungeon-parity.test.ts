import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Random from '../src/core/Random.ts';
import { generateDungeonGraph } from '../src/roguelike/generate.ts';
import { compareDungeonArtifacts, checkDeterminism, type DungeonArtifacts } from '../src/roguelike/DungeonParity.ts';

function artifactsFromSeed(seed: number): DungeonArtifacts {
	Random.push(seed);
	try {
		const { level, graph, retries, roomBuilders } = generateDungeonGraph({
			width: 30,
			height: 30,
			extraCorridors: 2,
		});
		return {
			graph,
			retries,
			roomBuilders,
			width: level.width,
			height: level.height,
			terrain: level.terrain,
			features: [],
			content: [],
			rngDraws: 0,
		};
	} finally {
		Random.pop();
	}
}

test('two runs from the same seed compare with no mismatches', () => {
	const mismatches = compareDungeonArtifacts(artifactsFromSeed(11), artifactsFromSeed(11));
	assert.deepEqual(mismatches, []);
});

test('different seeds produce a real mismatch, on the paint stage at least', () => {
	const mismatches = compareDungeonArtifacts(artifactsFromSeed(11), artifactsFromSeed(12));
	assert.ok(mismatches.length > 0);
	assert.ok(mismatches.some((m) => m.stage === 'paint'));
});

test('a graph-only difference is tagged graph, not paint', () => {
	const base = artifactsFromSeed(11);
	const differentGraph: DungeonArtifacts = { ...base, graph: [{ a: 0, b: 1, extra: true }] };
	const mismatches = compareDungeonArtifacts(base, differentGraph);
	assert.deepEqual(mismatches, [
		{ stage: 'graph', field: 'graph', expected: base.graph, actual: differentGraph.graph },
	]);
});

test('a retries-only difference is tagged graph', () => {
	const base = artifactsFromSeed(11);
	const differentRetries: DungeonArtifacts = { ...base, retries: base.retries + 1 };
	const mismatches = compareDungeonArtifacts(base, differentRetries);
	assert.deepEqual(mismatches, [
		{ stage: 'graph', field: 'retries', expected: base.retries, actual: differentRetries.retries },
	]);
});

test('a features-only difference is tagged paint, and feature order does not matter', () => {
	const base: DungeonArtifacts = {
		...artifactsFromSeed(11),
		features: [
			[3, 'sign'],
			[7, 'well'],
		],
	};
	const reordered: DungeonArtifacts = {
		...base,
		features: [
			[7, 'well'],
			[3, 'sign'],
		],
	};
	assert.deepEqual(compareDungeonArtifacts(base, reordered), []);

	const different: DungeonArtifacts = { ...base, features: [[3, 'sign']] };
	const mismatches = compareDungeonArtifacts(base, different);
	assert.deepEqual(mismatches, [
		{ stage: 'paint', field: 'features', expected: base.features, actual: different.features },
	]);
});

test('an rngDraws-only difference is tagged paint', () => {
	const base = artifactsFromSeed(11);
	const different: DungeonArtifacts = { ...base, rngDraws: base.rngDraws + 3 };
	const mismatches = compareDungeonArtifacts(base, different);
	assert.deepEqual(mismatches, [
		{ stage: 'paint', field: 'rngDraws', expected: base.rngDraws, actual: different.rngDraws },
	]);
});

test('checkDeterminism finds nothing wrong for an actually-deterministic generator', () => {
	const mismatches = checkDeterminism(() => artifactsFromSeed(5), 3);
	assert.deepEqual(mismatches, []);
});

test('checkDeterminism catches a generator that is not actually seeded', () => {
	let call = 0;
	const mismatches = checkDeterminism(() => artifactsFromSeed(100 + call++), 2);
	assert.ok(mismatches.length > 0);
});
