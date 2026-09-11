/**
 * Deterministic random numbers.
 *
 * A roguelike lives or dies on this: the same seed has to produce the same dungeon, on
 * any machine, in any browser, forever. `Math.random()` cannot do that: it is not
 * seedable and its algorithm is not specified.
 *
 * The generator is xoshiro128**, by David Blackman and Sebastiano Vigna, released into the
 * public domain. It is fast, passes the standard statistical test suites, and its state is
 * four 32-bit words, which JavaScript can hold exactly.
 *
 * Generators are kept on a stack. Level generation pushes a seeded one so a floor is
 * reproducible, then pops it, so unrelated rolls elsewhere do not consume from that
 * stream and shift the results.
 *
 * @example
 * ```ts
 * import { Random } from '@datamoc/mw_games/core';
 *
 * // a floor generated from a seed always comes out the same
 * Random.push(12345);
 * const roll = Random.int(1, 20);
 * const critical = Random.chance(0.05);
 * Random.pop();
 * ```
 */

/** splitmix32, used to expand a single seed into the four words of generator state */
function splitmix32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x9e3779b9) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
		t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
		return (t ^ (t >>> 15)) >>> 0;
	};
}

/**
 * The seeded generator class `Random`'s free functions wrap directly, for a game that wants
 * its own independent stream rather than sharing the ambient one.
 *
 * @example
 * ```ts
 * import { Generator } from '@datamoc/mw_games/core';
 *
 * const rng = new Generator(42); // same seed, same sequence, every time
 * const roll = rng.int(20);
 * const saved = rng.getState(); // resumable, for a save file
 * ```
 */
export class Generator {
	private s0 = 0;
	private s1 = 0;
	private s2 = 0;
	private s3 = 0;

	readonly seed: number;

	constructor(seed?: number) {
		//an unseeded generator still has to be deterministic once created, so a random seed
		//is drawn once and kept, rather than the state being seeded from entropy directly
		this.seed = seed === undefined ? (Math.random() * 0x100000000) >>> 0 : seed >>> 0;

		const next = splitmix32(this.seed);
		this.s0 = next();
		this.s1 = next();
		this.s2 = next();
		this.s3 = next();

		//an all-zero state is a fixed point of the generator; splitmix never produces one,
		//but a future change to the seeding must not either
		if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
	}

	/** the raw generator: a uniformly distributed unsigned 32-bit integer */
	nextUint32(): number {
		const result = (Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0) >>> 0;

		const t = (this.s1 << 9) >>> 0;

		this.s2 ^= this.s0;
		this.s3 ^= this.s1;
		this.s1 ^= this.s2;
		this.s0 ^= this.s3;
		this.s2 ^= t;
		this.s3 = rotl(this.s3, 11);

		return result;
	}

	/** a float in [0, 1), with 32 bits of resolution */
	float(): number {
		return this.nextUint32() / 0x100000000;
	}

	/**
	 * An integer in [0, bound), without modulo bias.
	 *
	 * The naive `nextUint32() % bound` favours the low values whenever bound does not
	 * divide 2^32; this rejects the unfair tail of the range instead.
	 */
	int(bound: number): number {
		if (bound <= 0) return 0;

		const limit = 0x100000000 - (0x100000000 % bound);
		let value = this.nextUint32();
		while (value >= limit) {
			value = this.nextUint32();
		}
		return value % bound;
	}

	/** captures the generator state, so a save file can resume the same stream */
	getState(): [number, number, number, number] {
		return [this.s0, this.s1, this.s2, this.s3];
	}

	setState(state: readonly [number, number, number, number]): void {
		[this.s0, this.s1, this.s2, this.s3] = state;
	}
}

function rotl(x: number, k: number): number {
	return ((x << k) | (x >>> (32 - k))) >>> 0;
}

const stack: Generator[] = [new Generator()];

const current = (): Generator => stack[stack.length - 1];

/** starts a reproducible stream; pair every call with `pop()` */
export function push(seed?: number): Generator {
	const generator = new Generator(seed);
	stack.push(generator);
	return generator;
}

export function pop(): void {
	if (stack.length === 1) {
		throw new Error('the base random generator cannot be popped');
	}
	stack.pop();
}

/** runs `body` with a seeded generator, popping it even if `body` throws */
export function withSeed<T>(seed: number, body: () => T): T {
	push(seed);
	try {
		return body();
	} finally {
		pop();
	}
}

export function reset(): void {
	stack.length = 0;
	stack.push(new Generator());
}

/** a float in [0, 1), or [0, max), or [min, max) */
export function float(min?: number, max?: number): number {
	if (min === undefined) return current().float();
	if (max === undefined) return current().float() * min;
	return min + current().float() * (max - min);
}

/** an integer in [0, max), or [min, max) */
export function int(min: number, max?: number): number {
	if (max === undefined) return current().int(min);
	return min + current().int(max - min);
}

/** an integer in [min, max], both ends included (the usual shape for dice) */
export function range(min: number, max: number): number {
	return min + current().int(max - min + 1);
}

/**
 * A triangular distribution over [min, max], peaking in the middle.
 *
 * Useful wherever a uniform roll feels wrong: damage, room sizes, item quality.
 */
export function normalRange(min: number, max: number): number {
	return min + Math.floor(((current().float() + current().float()) * (max - min + 1)) / 2);
}

export function chance(probability: number): boolean {
	return current().float() < probability;
}

/**
 * Every "pick one" function here reports "there was nothing to pick" as `null`, never as
 * `-1` or `undefined`.
 *
 * `weighted` used to return `-1` and the two functions built on it returned `undefined`,
 * which meant one call chain carried three different spellings of the same outcome and two
 * separate hand-written translations between them. One sentinel, checked one way.
 */

/** a random element, or `null` for an empty list */
export function element<T>(items: readonly T[]): T | null {
	return items.length > 0 ? items[current().int(items.length)] : null;
}

/** an index into `weights` drawn in proportion to its weight, or `null` if nothing has any */
export function weighted(weights: readonly number[]): number | null {
	let total = 0;
	for (const w of weights) total += w;
	if (total <= 0) return null;

	let value = current().float() * total;
	for (let i = 0; i < weights.length; i++) {
		value -= weights[i];
		if (value < 0) return i;
	}
	return weights.length - 1;
}

/** a key from `weights`, drawn in proportion to the value it maps to, or `null` if none has any */
export function weightedKey<K>(weights: ReadonlyMap<K, number>): K | null {
	const keys = [...weights.keys()];
	const index = weighted(keys.map((k) => weights.get(k) ?? 0));
	return index === null ? null : keys[index];
}

/** Fisher-Yates, in place */
export function shuffle<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = current().int(i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}

const MT_N = 624;
const MT_M = 397;
const MT_MATRIX_A = 0x9908b0df;
const MT_UPPER_MASK = 0x80000000;
const MT_LOWER_MASK = 0x7fffffff;

/** the engine state a `MersenneTwister` save or a named stream resumes from */
export interface MersenneTwisterState {
	/** the value `seed()` was last given */
	seed: number;

	/** the 624 words of engine state */
	state: number[];

	/** how many words have been drawn from the current block */
	index: number;

	/** how many values have been produced since the last seed, `mt_rng.get_discard()`'s number */
	discard: number;
}

/**
 * MT19937, the Mersenne Twister the reference strategy game's `mt_rng` wraps, with the same
 * `seed`/`discard` bookkeeping its save files use. The engine itself is exactly specified
 * (the paper's constants and the 32-bit seeding routine), so `nextUint32` matches that
 * engine bit for bit on any machine; a port that consumes the raw stream, or a replay of raw
 * draws, lines up.
 *
 * What is *not* portable is C++'s `std::uniform_int_distribution`, which the reference then
 * runs the engine through: the C++ standard leaves that mapping implementation-defined, so
 * two standard libraries do not agree on it. `int` here is the same unbiased rejection
 * `Generator` uses, which makes a replay deterministic within this framework rather than
 * bit-identical to any one C++ standard library.
 *
 * @example
 * ```ts
 * import { MersenneTwister } from '@datamoc/mw_games/core';
 *
 * const rng = new MersenneTwister(5489);
 * const first = rng.nextUint32(); // 3499211612, the engine's own first value for this seed
 * rng.discard(10); // skip ahead without consuming the values
 * const saved = rng.getState(); // { seed, state, index, discard } - restorable
 * ```
 */
export class MersenneTwister {
	private state = new Uint32Array(MT_N);
	private index = MT_N;
	private seedValue = 5489;
	private produced = 0;

	constructor(seed = 5489) {
		this.seed(seed);
	}

	/** re-seeds the engine and resets the discard count, as `mt_rng::seed` does */
	seed(seed: number): void {
		this.seedValue = seed >>> 0;
		this.state[0] = this.seedValue;
		for (let i = 1; i < MT_N; i++) {
			const previous = this.state[i - 1] ^ (this.state[i - 1] >>> 30);
			this.state[i] = (Math.imul(1812433253, previous) + i) >>> 0;
		}
		this.index = MT_N;
		this.produced = 0;
	}

	private generate(): void {
		for (let i = 0; i < MT_N; i++) {
			const y = (this.state[i] & MT_UPPER_MASK) | (this.state[(i + 1) % MT_N] & MT_LOWER_MASK);
			let value = this.state[(i + MT_M) % MT_N] ^ (y >>> 1);
			if (y & 1) value ^= MT_MATRIX_A;
			this.state[i] = value >>> 0;
		}
		this.index = 0;
	}

	/** the raw generator, tempered as MT19937 specifies */
	nextUint32(): number {
		if (this.index >= MT_N) this.generate();

		let y = this.state[this.index++];
		y ^= y >>> 11;
		y ^= (y << 7) & 0x9d2c5680;
		y ^= (y << 15) & 0xefc60000;
		y ^= y >>> 18;
		this.produced++;
		return y >>> 0;
	}

	/** a float in [0, 1), with 32 bits of resolution */
	float(): number {
		return this.nextUint32() / 0x100000000;
	}

	/** an integer in [0, bound), without modulo bias (the same rule `Generator.int` uses) */
	int(bound: number): number {
		if (bound <= 0) return 0;

		const limit = 0x100000000 - (0x100000000 % bound);
		let value = this.nextUint32();
		while (value >= limit) {
			value = this.nextUint32();
		}
		return value % bound;
	}

	/** advances the engine without using the values, as `mt_rng::discard` does */
	discard(count: number): void {
		for (let i = 0; i < count; i++) this.nextUint32();
	}

	/** how many values have been produced since the last seed - `get_discard()`'s number */
	get discardCount(): number {
		return this.produced;
	}

	getState(): MersenneTwisterState {
		return { seed: this.seedValue, state: [...this.state], index: this.index, discard: this.produced };
	}

	setState(state: MersenneTwisterState): void {
		this.seedValue = state.seed >>> 0;
		for (let i = 0; i < MT_N; i++) this.state[i] = (state.state[i] ?? 0) >>> 0;
		this.index = state.index;
		this.produced = state.discard;
	}
}

/** FNV-1a over a stream name, so a name deterministically derives its own seed */
function fnv1a(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

/**
 * Named, independent random streams over one base seed: `streams.stream('loot')` and
 * `streams.stream('ai:goblin-3')` each get their own MT19937 position, so one consumer
 * drawing more numbers never shifts another's results - the property a replay and a
 * per-entity stream both need, and one a single shared generator cannot give.
 *
 * A stream is created on first use, from `baseSeed ^ FNV-1a(name)`, and then kept. Creating
 * a stream later therefore does not disturb an existing one, which is what makes adding a
 * new consumer reproducible rather than a change to every draw after it.
 *
 * @example
 * ```ts
 * import { RandomStreams } from '@datamoc/mw_games/core';
 *
 * const streams = new RandomStreams(12345);
 * streams.stream('loot').int(100); // one stream
 * streams.stream('ai:goblin-3').int(6); // an unrelated one, unaffected by the loot draw
 *
 * const saved = streams.getState(); // every stream's engine state, for a save file
 * ```
 */
export class RandomStreams {
	private baseSeed: number;
	private streams = new Map<string, { seed: number; engine: MersenneTwister }>();

	constructor(seed = 0) {
		this.baseSeed = seed >>> 0;
	}

	/** the stream named `name`, created from the base seed on first use and kept after that */
	stream(name: string): MersenneTwister {
		let entry = this.streams.get(name);
		if (!entry) {
			const seed = (this.baseSeed ^ fnv1a(name)) >>> 0;
			entry = { seed, engine: new MersenneTwister(seed) };
			this.streams.set(name, entry);
		}
		return entry.engine;
	}

	/** the seed a stream was created from; undefined for one that has never been asked for */
	seedOf(name: string): number | undefined {
		return this.streams.get(name)?.seed;
	}

	/** drops every stream and re-bases future ones; existing streams are gone, not reset */
	reseed(seed: number): void {
		this.baseSeed = seed >>> 0;
		this.streams.clear();
	}

	/** the names that have been asked for, in creation order */
	names(): string[] {
		return [...this.streams.keys()];
	}

	getState(): Record<string, MersenneTwisterState> {
		const out: Record<string, MersenneTwisterState> = {};
		for (const [name, entry] of this.streams) out[name] = entry.engine.getState();
		return out;
	}

	/** restores what `getState` wrote; a stream missing from `state` stays as it was */
	setState(state: Readonly<Record<string, MersenneTwisterState>>): void {
		for (const [name, saved] of Object.entries(state)) {
			const engine = new MersenneTwister(saved.seed);
			engine.setState(saved);
			this.streams.set(name, { seed: saved.seed, engine });
		}
	}
}
