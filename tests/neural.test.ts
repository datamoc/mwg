import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeuralPolicy, JavaScriptAI } from '../src/ai/index.ts';
import type { NeuralModel } from '../src/ai/index.ts';
import { Generator } from '../src/core/Random.ts';

const model: NeuralModel = {
	version: 1,
	observationVersion: 'test-v1',
	layers: [
		{ inputSize: 2, outputSize: 2, weights: [1, -1, 2, 1], biases: [0, 1] },
		{ inputSize: 2, outputSize: 3, weights: [1, 0, 0, -1, 1, 1], biases: [1, 0, -2] },
	],
};

test('neural inference uses row-major weights, hidden ReLU and linear outputs', () => {
	const policy = new NeuralPolicy(model);
	assert.deepEqual(Array.from(policy.predict([1, 3])), [1, -6, 4]);
	const output = new Float64Array(3);
	assert.equal(policy.predict([1, 3], output), output);
	const kept = policy.predict([1, 3]);
	policy.predict([0, 0]);
	assert.deepEqual(Array.from(kept), [1, -6, 4]);
	assert.throws(() => policy.predict([1]), TypeError);
	assert.throws(() => policy.predict([NaN, 1]), TypeError);
	assert.throws(() => policy.predict([1, 1], new Float64Array(2)), RangeError);
});

test('neural models reject malformed dimensions, non-finite values and excessive size before inference', () => {
	const bad = (mutate: (m: NeuralModel) => void): void => {
		const m = structuredClone(model);
		mutate(m);
		assert.throws(() => new NeuralPolicy(m));
	};
	bad((m) => {
		m.version = 2 as 1;
	});
	bad((m) => {
		m.observationVersion = '';
	});
	bad((m) => {
		m.layers = [];
	});
	bad((m) => {
		m.layers[0].inputSize = 0;
	});
	bad((m) => {
		m.layers[1].inputSize = 3;
	});
	bad((m) => {
		m.layers[0].weights = [Infinity, 0, 0, 0];
	});
	bad((m) => {
		m.layers[0].weights = new Array(4);
	});
	bad((m) => {
		m.layers[0].biases = [];
	});
	bad((m) => {
		m.layers[0].inputSize = 4096;
		m.layers[0].outputSize = 4096;
	});
	bad((m) => {
		m.layers = Array.from({ length: 33 }, () => m.layers[0]);
	});
	const huge = new NeuralPolicy({
		version: 1,
		observationVersion: 'v1',
		layers: [{ inputSize: 1, outputSize: 1, weights: [Number.MAX_VALUE], biases: [0] }],
	});
	assert.throws(() => huge.predict([2]), RangeError);
});

test('neural policies own their weights and exports', () => {
	const m = structuredClone(model);
	const policy = new NeuralPolicy(m);
	m.layers[0].weights = [0, 0, 0, 0];
	policy.exportModel().layers[0].biases = [100, 100];
	assert.deepEqual(Array.from(policy.predict([1, 3])), [1, -6, 4]);
});

test('neural selection obeys masks, deterministic ties, seeded sampling and all-masked idle', () => {
	const policy = new NeuralPolicy(model);
	assert.equal(policy.selectAction({ input: [1, 3] }), 2);
	assert.equal(policy.selectAction({ input: [1, 3], mask: [true, true, false] }), 0);
	assert.equal(policy.selectAction({ input: [1, 3], mask: [false, false, false] }), null);
	assert.throws(() => policy.selectAction({ input: [1, 3], mask: [true] }), TypeError);
	assert.throws(() => policy.selectAction({ input: [1, 3] }, () => 1), RangeError);
	const tied = new NeuralPolicy({
		version: 1,
		observationVersion: 'v1',
		layers: [{ inputSize: 1, outputSize: 2, weights: [0, 0], biases: [0, 0] }],
	});
	assert.equal(tied.selectAction({ input: [0] }), 0);
	assert.equal(
		tied.selectAction({ input: [0] }, () => 0.75),
		1,
	);
	const a = new Generator(8),
		b = new Generator(8);
	assert.deepEqual(
		Array.from({ length: 20 }, () => tied.selectAction({ input: [0] }, () => a.float())),
		Array.from({ length: 20 }, () => tied.selectAction({ input: [0] }, () => b.float())),
	);
});

test('neural behaviour returns game action data and uses the existing AI idle result', () => {
	const policy = new NeuralPolicy(model);
	const ai = new JavaScriptAI({ seed: 3 });
	ai.register({
		id: 'agent',
		behaviors: [
			policy.behavior('brain', [{ type: 'a' }, { type: 'b' }, { type: 'c' }], (perception) => ({
				input: [1, 3],
				mask: perception === null ? [true, true, true] : [false, false, false],
			})),
		],
	});
	assert.equal(ai.decide('agent', { perception: null }).action?.type, 'c');
	assert.equal(ai.decide('agent', { perception: false }).status, 'idle');
	assert.throws(() => policy.behavior('bad', [], () => ({ input: [1, 3] })), RangeError);
});

test('neural worker batch agrees with local inference and reports aborts and failures', async () => {
	const policy = new NeuralPolicy(model);
	const inputs = [
		[1, 3],
		[-2, 1],
		[0, 0],
	];
	const result = await policy.predictBatchAsync(inputs);
	assert.deepEqual(
		result,
		inputs.map((input) => policy.predict(input)),
	);
	await assert.rejects(policy.predictBatchAsync([[1]]));
	const abort = new AbortController();
	abort.abort(new Error('cancel'));
	await assert.rejects(policy.predictBatchAsync(inputs, { signal: abort.signal }), /cancel/);
	await assert.rejects(policy.predictBatchAsync(new Array(65537)), RangeError);
	const wide = new NeuralPolicy({
		version: 1,
		observationVersion: 'wide',
		layers: [{ inputSize: 1, outputSize: 4096, weights: new Array(4096).fill(0), biases: new Array(4096).fill(0) }],
	});
	await assert.rejects(wide.predictBatchAsync(Array.from({ length: 245 }, () => [0])), RangeError);
});
