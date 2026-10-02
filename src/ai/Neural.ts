import { spawn } from '../threads/index.ts';
import type { AIAction, AIBehavior, AIValue } from './index.ts';

/** Flat row-major weights: output neuron first, then input feature. */
export interface DenseLayer {
	inputSize: number;
	outputSize: number;
	weights: readonly number[];
	biases: readonly number[];
}

/** Game-owned, redistributable weights and an explicit observation-schema version. */
export interface NeuralModel {
	version: 1;
	observationVersion: string;
	layers: readonly DenseLayer[];
}

export interface NeuralObservation {
	input: readonly number[];
	/** Omitted means all actions are legal; false excludes an action. */
	mask?: readonly boolean[];
}

/**
 * The self-contained evaluator shared by the local policy and serialized worker tasks.
 * Limits apply before copying weights: at most 32 layers, 4096 neurons per layer and
 * one million weights plus biases. Activations reuse buffers; returned outputs are owned
 * by the caller. Hidden layers use ReLU, output scores remain linear.
 */
export function createNeuralEvaluator(model: NeuralModel): {
	predict(input: readonly number[], output?: Float64Array): Float64Array;
	select(observation: NeuralObservation, random?: () => number): number | null;
} {
	if (model?.version !== 1 || typeof model.observationVersion !== 'string' || !model.observationVersion.length)
		throw new TypeError('unsupported neural model or observation version');
	if (!Array.isArray(model.layers) || !model.layers.length || model.layers.length > 32)
		throw new RangeError('a neural model needs 1..32 layers');
	let parameters = 0;
	for (let index = 0; index < model.layers.length; index++) {
		const layer = model.layers[index];
		if (
			!layer ||
			!Number.isInteger(layer.inputSize) ||
			!Number.isInteger(layer.outputSize) ||
			layer.inputSize < 1 ||
			layer.outputSize < 1 ||
			layer.inputSize > 4096 ||
			layer.outputSize > 4096
		)
			throw new RangeError('neural layer dimensions must be integers in 1..4096');
		parameters += layer.inputSize * layer.outputSize + layer.outputSize;
		if (parameters > 1_000_000) throw new RangeError('neural model exceeds one million parameters');
		if (index && model.layers[index - 1].outputSize !== layer.inputSize)
			throw new RangeError('neural layer dimensions do not connect');
		if (
			!Array.isArray(layer.weights) ||
			!Array.isArray(layer.biases) ||
			layer.weights.length !== layer.inputSize * layer.outputSize ||
			layer.biases.length !== layer.outputSize ||
			!Array.from(layer.weights).every(Number.isFinite) ||
			!Array.from(layer.biases).every(Number.isFinite)
		)
			throw new TypeError('neural weights and biases must be finite and match layer dimensions');
	}
	const layers = model.layers.map((layer) => ({
		...layer,
		weights: Float64Array.from(layer.weights),
		biases: Float64Array.from(layer.biases),
		buffer: new Float64Array(layer.outputSize),
	}));
	const predict = (input: readonly number[], output?: Float64Array): Float64Array => {
		if (input.length !== layers[0].inputSize)
			throw new TypeError('neural input must be finite and match the model');
		for (let i = 0; i < input.length; i++)
			if (!Number.isFinite(input[i])) throw new TypeError('neural input must be finite');
		const last = layers[layers.length - 1];
		if (output && output.length !== last.outputSize)
			throw new RangeError('neural output buffer has the wrong size');
		let current: ArrayLike<number> = input;
		for (let index = 0; index < layers.length; index++) {
			const layer = layers[index];
			for (let row = 0; row < layer.outputSize; row++) {
				let sum = layer.biases[row];
				for (let col = 0; col < layer.inputSize; col++)
					sum += layer.weights[row * layer.inputSize + col] * current[col];
				if (!Number.isFinite(sum)) throw new RangeError('neural activation overflow');
				layer.buffer[row] = index === layers.length - 1 ? sum : Math.max(0, sum);
			}
			current = layer.buffer;
		}
		const result = output ?? new Float64Array(last.outputSize);
		result.set(last.buffer);
		return result;
	};
	const scores = new Float64Array(layers[layers.length - 1].outputSize);
	return {
		predict,
		select(observation, random) {
			const mask = observation.mask;
			if (
				mask &&
				(mask.length !== scores.length || !Array.from(mask).every((entry) => typeof entry === 'boolean'))
			)
				throw new TypeError('neural action mask must contain one boolean per output');
			predict(observation.input, scores);
			let best: number | null = null;
			for (let i = 0; i < scores.length; i++)
				if ((!mask || mask[i]) && (best === null || scores[i] > scores[best])) best = i;
			if (best === null || !random) return best;
			const draw = random();
			if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
				throw new RangeError('sampling random must return a value in [0, 1)');
			let total = 0;
			for (let i = 0; i < scores.length; i++) if (!mask || mask[i]) total += Math.exp(scores[i] - scores[best]);
			let remaining = draw * total;
			for (let i = 0; i < scores.length; i++) {
				if (mask && !mask[i]) continue;
				remaining -= Math.exp(scores[i] - scores[best]);
				if (remaining < 0) return i;
			}
			return best;
		},
	};
}

//One batch per worker, never a worker per agent. The evaluator source has no imports.
function inferenceBatch(source: string, model: NeuralModel, inputs: readonly (readonly number[])[]): Float64Array[] {
	const create = new Function(`return (${source});`)() as typeof createNeuralEvaluator;
	const evaluator = create(model);
	return inputs.map((input) => evaluator.predict(input));
}

/**
 * A small shared dense policy, usable inside existing JavaScriptAI behaviours.
 * Model weights are copied on construction. Supply a seeded random callback to sample
 * softmax scores; omit it for the first highest-scoring legal action. All-masked is idle.
 * Async batches return detached results, never mutate game state; callers must discard
 * results whose scene or position changed while awaiting them.
 *
 * @example
 * ```ts
 * import { NeuralPolicy, JavaScriptAI } from '@datamoc/mw_games/ai';
 * const policy = new NeuralPolicy({ version: 1, observationVersion: 'v1', layers: [
 *   { inputSize: 1, outputSize: 2, weights: [-1, 1], biases: [0, 0] },
 * ] });
 * console.log(policy.selectAction({ input: [2] })); // 1
 * const ai = new JavaScriptAI({ seed: 7 });
 * ai.register({ id: 'npc', behaviors: [policy.behavior('neural',
 *   [{ type: 'left' }, { type: 'right' }], () => ({ input: [2] }))] });
 * console.log(ai.decide('npc', { perception: null }).action?.type); // right
 * const scores = await policy.predictBatchAsync([[2], [-2]]);
 * ```
 */
export class NeuralPolicy {
	private readonly model: NeuralModel;
	private readonly evaluator: ReturnType<typeof createNeuralEvaluator>;

	constructor(model: NeuralModel) {
		this.evaluator = createNeuralEvaluator(model);
		this.model = structuredClone(model);
	}

	predict(input: readonly number[], output?: Float64Array): Float64Array {
		return this.evaluator.predict(input, output);
	}

	selectAction(observation: NeuralObservation, random?: () => number): number | null {
		return this.evaluator.select(observation, random);
	}

	exportModel(): NeuralModel {
		return structuredClone(this.model);
	}

	behavior(
		id: string,
		actions: readonly AIAction[],
		observe: (perception: AIValue) => NeuralObservation,
		sample = false,
	): AIBehavior {
		if (actions.length !== this.model.layers[this.model.layers.length - 1].outputSize)
			throw new RangeError('neural action mapping must match output size');
		const mapping = structuredClone(actions);
		return {
			id,
			decide: (context) => {
				context.checkpoint();
				const action = this.selectAction(observe(context.perception), sample ? context.random : undefined);
				return action === null ? null : structuredClone(mapping[action]);
			},
		};
	}

	/** One cancellable worker batch: at most 65536 observations and one million input or output values. */
	predictBatchAsync(
		inputs: readonly (readonly number[])[],
		options: { signal?: AbortSignal; timeout?: number } = {},
	): Promise<Float64Array[]> {
		const inputSize = this.model.layers[0].inputSize;
		const outputSize = this.model.layers[this.model.layers.length - 1].outputSize;
		if (inputs.length > 65536 || inputs.length * Math.max(inputSize, outputSize) > 1_000_000)
			return Promise.reject(new RangeError('neural batch exceeds its observation or value limit'));
		for (const input of inputs)
			if (!input || input.length !== inputSize)
				return Promise.reject(new TypeError('neural batch inputs must match the model'));
		return spawn(inferenceBatch, [createNeuralEvaluator.toString(), this.model, inputs], options);
	}
}
