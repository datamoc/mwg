import * as Random from '../core/Random.ts';

/**
 * Per-run appearance shuffling for unidentified items: which look each kind wears.
 *
 * A game with identification needs this the moment it has more than one unidentified
 * kind in a category - without it, every run's "red potion" would always be the same
 * kind, and identifying one would identify them all forever. The mapping is drawn once
 * per run (a seeded shuffle, so a run's seed fully determines it) and stays fixed until
 * the run ends; revealing a kind's true nature stays the game's own `identify()` call,
 * which keeps reading the mapping for the *unidentified* label only.
 */

export interface AppearanceTable {
	/** the item kinds sharing one pool of looks, e.g. every potion kind */
	kinds: readonly string[];

	/** the distinct looks to deal out; must cover every kind, extras stay unused */
	labels: readonly string[];
}

/**
 * Deals each kind a distinct label from a shuffled copy of the pool - pure, so a game
 * that wants the shuffle scoped (one seed per run, say) wraps it in `Random.withSeed`.
 */
export function assignAppearances(table: AppearanceTable): Map<string, string> {
	if (table.labels.length < table.kinds.length) {
		throw new Error(
			`not enough appearances: ${table.kinds.length} kinds but only ${table.labels.length} labels`
		);
	}
	const pool = [...table.labels];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Random.int(0, i + 1);
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	const out = new Map<string, string>();
	table.kinds.forEach((kind, index) => out.set(kind, pool[index]));
	return out;
}

export class Appearances {
	private tables: Record<string, AppearanceTable>;
	private assigned = new Map<string, Map<string, string>>();

	constructor(tables: Record<string, AppearanceTable>) {
		this.tables = tables;
	}

	/** the look `kind` wears this run in `category`, drawing the shuffle on first ask */
	appearanceOf(category: string, kind: string): string {
		let categoryMap = this.assigned.get(category);
		if (!categoryMap) {
			const table = this.tables[category];
			if (!table) throw new Error(`no such appearance category: "${category}"`);
			categoryMap = assignAppearances(table);
			this.assigned.set(category, categoryMap);
		}
		const label = categoryMap.get(kind);
		if (label === undefined) throw new Error(`"${kind}" is not in appearance category "${category}"`);
		return label;
	}

	toJSON(): { assigned: [string, [string, string][]][] } {
		return { assigned: [...this.assigned].map(([category, map]) => [category, [...map]]) };
	}

	/** rebuilds appearances from save data - the tables themselves are supplied fresh, the same as `QuestLog` definitions */
	static fromJSON(
		tables: Record<string, AppearanceTable>,
		data: { assigned: [string, [string, string][]][] }
	): Appearances {
		const appearances = new Appearances(tables);
		for (const [category, entries] of data.assigned) appearances.assigned.set(category, new Map(entries));
		return appearances;
	}
}
