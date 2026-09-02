/**
 * A character's numbers: base attributes, values derived from them, and the modifiers -
 * equipment, buffs, states - that push either around.
 *
 * This is deliberately the *shape*, not a formula. A game names its own base attributes
 * (`strength`, `sanity`, whatever it needs) and its own derived ones (`maxHp` from
 * `vitality`, say); mwg supplies the machinery that combines a base value with however many
 * modifiers are active, in a stated order, and keeps it correct as either side changes.
 */

export type Stats = Record<string, number>;

/** how a modifier combines with a stat's running value */
export type ModifierOp = 'add' | 'multiply' | 'set';

export interface Modifier {
	stat: string;
	op: ModifierOp;
	value: number;

	/**
	 * Modifiers apply in ascending order within their own op (see `resolve`). Equal order
	 * preserves the order they were added in.
	 */
	order?: number;

	/** whatever granted this modifier - an equipped item, an active buff - for bulk removal */
	source?: unknown;
}

export interface DerivedStat {
	name: string;
	/** reads every base attribute and any derived stat already resolved earlier in the list */
	from: (stats: Readonly<Stats>) => number;
}

export interface StatBlockOptions {
	base: Stats;
	derived?: DerivedStat[];
}

/**
 * Resolves one stat's modifiers into a single number.
 *
 * Every `add` modifier applies first (summed together), then every `multiply` (each
 * scaling the running total), then every `set` (the last one wins) - a stated, fixed order,
 * so a +10% ring and a cursed -2 sword combine the same way regardless of equip order, and
 * a `set` modifier (a polymorph, a stat drained to exactly zero) always wins over the rest.
 */
function resolve(base: number, modifiers: readonly Modifier[]): number {
	const byOp = (op: ModifierOp) =>
		modifiers.filter((m) => m.op === op).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

	let value = base;
	for (const m of byOp('add')) value += m.value;
	for (const m of byOp('multiply')) value *= m.value;
	for (const m of byOp('set')) value = m.value;
	return value;
}

export class StatBlock {
	private baseValues: Stats;
	private derived: DerivedStat[];
	private modifiers: Modifier[] = [];
	private cache: Stats | null = null;

	constructor(options: StatBlockOptions) {
		this.baseValues = { ...options.base };
		this.derived = options.derived ?? [];
	}

	/** the unmodified base value; 0 for a name that was never given one */
	base(name: string): number {
		return this.baseValues[name] ?? 0;
	}

	setBase(name: string, value: number): void {
		this.baseValues[name] = value;
		this.cache = null;
	}

	addModifier(modifier: Modifier): void {
		this.modifiers.push(modifier);
		this.cache = null;
	}

	removeModifier(modifier: Modifier): void {
		const i = this.modifiers.indexOf(modifier);
		if (i !== -1) this.modifiers.splice(i, 1);
		this.cache = null;
	}

	/** removes every modifier carrying this `source`, such as an item just unequipped */
	removeModifiersFrom(source: unknown): void {
		this.modifiers = this.modifiers.filter((m) => m.source !== source);
		this.cache = null;
	}

	/** the final value: a base attribute or a derived stat, with every modifier resolved */
	get(name: string): number {
		return this.resolveAll()[name] ?? 0;
	}

	private resolveAll(): Stats {
		if (this.cache) return this.cache;

		const result: Stats = { ...this.baseValues };
		for (const name of Object.keys(result)) {
			result[name] = resolve(result[name], this.modifiersFor(name));
		}
		for (const d of this.derived) {
			result[d.name] = resolve(d.from(result), this.modifiersFor(d.name));
		}

		this.cache = result;
		return result;
	}

	private modifiersFor(stat: string): Modifier[] {
		return this.modifiers.filter((m) => m.stat === stat);
	}
}
