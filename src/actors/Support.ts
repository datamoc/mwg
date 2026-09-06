/** A thresholded bond level between two named units. */
export interface SupportLevel {
	id: string;
	threshold: number;
	/** Optional game-facing bonus or dialogue key unlocked at this level. */
	bonus?: string;
}

export interface SupportChange {
	a: string;
	b: string;
	points: number;
	previousLevel: SupportLevel | null;
	level: SupportLevel | null;
}

export interface SupportSave {
	pairs: Array<[string, string, number]>;
}

/**
 * Stores persistent progress for a relationship between a specific pair of units.
 * Pair order is ignored, so `add('alice', 'bob', 1)` and the reverse address one bond.
 *
 * @example
 * ```ts
 * import { SupportLedger, type SupportLevel } from '@datamoc/mw_games/actors';
 *
 * const levels: SupportLevel[] = [{ id: 'C', threshold: 10 }, { id: 'B', threshold: 30 }];
 * const support = new SupportLedger(levels);
 *
 * support.add('hero', 'ally', 12); // proximity, a shared battle, whatever a game counts
 * console.log(support.level('ally', 'hero')?.id); // 'C' - pair order does not matter
 * ```
 */
export class SupportLedger {
	private levels: SupportLevel[];
	private points = new Map<string, number>();

	constructor(levels: readonly SupportLevel[]) {
		if (levels.some((level) => !level.id || !Number.isFinite(level.threshold) || level.threshold < 0)) {
			throw new Error('support levels need an id and a non-negative threshold');
		}
		this.levels = [...levels].sort((a, b) => a.threshold - b.threshold);
	}

	get(a: string, b: string): number {
		return this.points.get(pairKey(a, b)) ?? 0;
	}

	level(a: string, b: string): SupportLevel | null {
		const points = this.get(a, b);
		let found: SupportLevel | null = null;
		for (const level of this.levels) {
			if (level.threshold > points) break;
			found = level;
		}
		return found;
	}

	add(a: string, b: string, amount: number): SupportChange {
		if (!a || !b || a === b) throw new Error('support needs two different named units');
		if (!Number.isFinite(amount)) throw new Error(`support amount must be finite, got ${amount}`);
		const previousLevel = this.level(a, b);
		const key = pairKey(a, b);
		const points = Math.max(0, (this.points.get(key) ?? 0) + amount);
		this.points.set(key, points);
		return { a, b, points, previousLevel, level: this.level(a, b) };
	}

	toJSON(): SupportSave {
		const pairs = [...this.points].map(([key, points]) => {
			const [a, b] = key.split('\u0000');
			return [a, b, points] as [string, string, number];
		});
		return { pairs };
	}

	static fromJSON(levels: readonly SupportLevel[], data: SupportSave): SupportLedger {
		const ledger = new SupportLedger(levels);
		for (const [a, b, points] of data.pairs) {
			if (!a || !b || a === b || !Number.isFinite(points) || points < 0) throw new Error('invalid support save data');
			const key = pairKey(a, b);
			if (ledger.points.has(key)) throw new Error(`invalid support save data: duplicate pair "${a}" / "${b}"`);
			ledger.points.set(key, points);
		}
		return ledger;
	}
}

function pairKey(a: string, b: string): string {
	return [a, b].sort().join('\u0000');
}
