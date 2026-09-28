/** one draw of the generator, for a parity log */
export interface JavaRandomDraw {
	/** the bit count `next` was asked for (1 to 32) */
	bits: number;
	/** the value it returned: signed for 32 bits, otherwise non-negative */
	value: number;
}

export interface JavaRandomOptions {
	/**
	 * Called for every `next(bits)` draw, which every other method is built from. A port
	 * checking itself against a JVM run logs the draws on both sides and diffs them.
	 */
	onDraw?: (draw: JavaRandomDraw) => void;
}

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

/**
 * The 48-bit linear congruential generator behind `java.util.Random`, bit for bit, so a
 * game ported from the JVM can replay the same seed and get the same dungeon. The
 * algorithm is the one the Java documentation specifies; every method below follows that
 * specification, including the rejection loop of `nextInt(bound)`.
 *
 * Not a good general generator (use `Generator` for that): its only job is to agree with
 * Java. Seeds may be numbers or bigints; a 64-bit seed keeps its low 48 bits after the
 * documented scramble.
 *
 * @example
 * ```ts
 * import { JavaRandom } from '@datamoc/mw_games/core';
 *
 * const random = new JavaRandom(42);
 * console.log(random.nextInt()); // -1170105035, what `new Random(42).nextInt()` returns
 * console.log(random.nextInt(100)); // an int in 0..99
 * ```
 */
export class JavaRandom {
	private state = 0n;
	private readonly onDraw?: (draw: JavaRandomDraw) => void;

	constructor(seed: number | bigint = 0, options: JavaRandomOptions = {}) {
		this.onDraw = options.onDraw;
		this.setSeed(seed);
	}

	/** restarts the sequence, as `Random.setSeed` does */
	setSeed(seed: number | bigint): void {
		this.state = (BigInt.asIntN(64, BigInt(seed)) ^ MULTIPLIER) & MASK;
	}

	/** the next `bits` (1 to 32) pseudorandom bits; a 32-bit draw is signed, as in Java */
	next(bits: number): number {
		if (!Number.isInteger(bits) || bits < 1 || bits > 32) throw new Error(`next needs 1 to 32 bits, got ${bits}`);
		this.state = (this.state * MULTIPLIER + ADDEND) & MASK;
		const top = Number(this.state >> BigInt(48 - bits));
		const value = bits === 32 ? top | 0 : top;
		this.onDraw?.({ bits, value });
		return value;
	}

	/**
	 * With no argument, any int (`nextInt()`); with a positive `bound`, an int in
	 * `[0, bound)` (`nextInt(bound)`), drawn without modulo bias the way Java does.
	 */
	nextInt(bound?: number): number {
		if (bound === undefined) return this.next(32);
		if (!Number.isInteger(bound) || bound <= 0 || bound > 0x7fffffff) {
			throw new Error(`nextInt needs a bound from 1 to 2147483647, got ${bound}`);
		}
		if ((bound & -bound) === bound) return Math.floor((bound * this.next(31)) / 0x80000000);
		let bits: number;
		let value: number;
		do {
			bits = this.next(31);
			value = bits % bound;
		} while (bits - value + (bound - 1) > 0x7fffffff);
		return value;
	}

	/** a signed 64-bit integer, two 32-bit draws combined as Java does */
	nextLong(): bigint {
		const high = BigInt(this.next(32));
		const low = BigInt(this.next(32));
		return BigInt.asIntN(64, (high << 32n) + low);
	}

	/** a double in `[0, 1)` from 53 random bits */
	nextDouble(): number {
		return (this.next(26) * 0x8000000 + this.next(27)) / 2 ** 53;
	}

	/** a float in `[0, 1)` from 24 random bits */
	nextFloat(): number {
		return this.next(24) / 0x1000000;
	}

	nextBoolean(): boolean {
		return this.next(1) !== 0;
	}
}
