/**
 * A move, as data: what it costs, what it targets, and its effects - whatever those are.
 * `mwg` does not interpret `effects`; a game's own battle loop reads it and decides what
 * happens, the same way `mwg/actors`' `Modifier` carries a stat and a number without the
 * framework knowing what "poisoned" means.
 */
export interface Move<TEffect = unknown> {
	id: string;
	type: string;

	/** energy, PP, an action point cost - whatever the game's resource is */
	cost?: number;

	/** a game-defined target shape: 'self', 'single-enemy', 'all-allies', anything else */
	target: string;

	effects?: TEffect;
}

export interface BattleAction<C = unknown> {
	actor: C;
	speed: number;

	/** higher acts first regardless of speed; ties fall back to speed */
	priority?: number;
}

/**
 * Turn order by speed, with move priority overriding it - one round's worth of ordering,
 * not a persistent queue. `mwg/roguelike`'s `Scheduler` already covers continuous
 * energy-cost time for a dungeon; a battle round picks everyone's action first and then
 * needs only this, a single stable sort.
 */
export function battleOrder<A extends { speed: number; priority?: number }>(actions: readonly A[]): A[] {
	return [...actions].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.speed - a.speed);
}
