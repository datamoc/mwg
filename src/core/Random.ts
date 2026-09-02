/**
 * Deterministic random numbers.
 *
 * A roguelike lives or dies on this: the same seed has to produce the same dungeon, on
 * any machine, in any browser, forever. `Math.random()` cannot do that — it is not
 * seedable and its algorithm is not specified.
 *
 * The generator is xoshiro128**, by David Blackman and Sebastiano Vigna, released into the
 * public domain. It is fast, passes the standard statistical test suites, and its state is
 * four 32-bit words, which JavaScript can hold exactly.
 *
 * Generators are kept on a stack. Level generation pushes a seeded one so a floor is
 * reproducible, then pops it, so unrelated rolls elsewhere do not consume from that
 * stream and shift the results.
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

/** an integer in [min, max], both ends included — the usual shape for dice */
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

export function element<T>(items: readonly T[]): T | undefined {
	return items.length > 0 ? items[current().int(items.length)] : undefined;
}

/** an index into `weights`, each index drawn in proportion to its weight */
export function weighted(weights: readonly number[]): number {
	let total = 0;
	for (const w of weights) total += w;
	if (total <= 0) return -1;

	let value = current().float() * total;
	for (let i = 0; i < weights.length; i++) {
		value -= weights[i];
		if (value < 0) return i;
	}
	return weights.length - 1;
}

/** a key from `weights`, drawn in proportion to the value it maps to */
export function weightedKey<K>(weights: ReadonlyMap<K, number>): K | undefined {
	const keys = [...weights.keys()];
	const index = weighted(keys.map((k) => weights.get(k) ?? 0));
	return index === -1 ? undefined : keys[index];
}

/** Fisher-Yates, in place */
export function shuffle<T>(items: T[]): T[] {
	for (let i = items.length - 1; i > 0; i--) {
		const j = current().int(i + 1);
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
}
