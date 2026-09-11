/**
 * The numbers behind a decision, for an AI that weighs outcomes instead of matching a behaviour.
 *
 * A rules agent decides from an opaque `perception` the game fills and from its own `state`, and a
 * score exists only inside `alphaBetaSearch`, as the `evaluate` callback the game hands its own
 * search. So a mind that wants to compare attacking against holding has nothing to weigh, and has
 * to re-derive the game's valuation out of the perception blob, which is the duplication the
 * envelope exists to prevent. These functions are that missing half: the framework owns how a view
 * is assembled, the game owns what anything is worth (`scoreOf`), and the mind owns what it cares
 * about (`ScorePersonality`).
 *
 * Both granularities the contract already names (`AIAgentDefinition.scope` is `'actor' |
 * 'controller'`) run the same code and differ in one thing only: the visibility set they are handed.
 * A unit's own sight for an actor, `FactionFog.sees(side)` for a whole side.
 */

/** A subject as a score view needs it: the game's own handle, its side, and where it stands. */
export interface ScoreSubject<T> {
	readonly id: T;

	/** who it fights for; sides are compared by name, so allies share one */
	readonly side: string;

	readonly x: number;
	readonly y: number;

	/** its unit type, when the game's world has one (a Wesnoth `[unit] type=`) */
	readonly type?: string;

	/** its role/function, e.g. `leader` or `courier` */
	readonly role?: string;

	/** whether it can recruit, i.e. is a leader; a missing value reads as `false` */
	readonly can_recruit?: boolean;

	/** its own name, when it has one */
	readonly name?: string;
}

/** What `subjectsWhere` selects on: the unit attributes a `ScoreSubject` may carry, each optional. */
export interface ScoreSubjectFilter {
	readonly side?: string;
	readonly type?: string;
	readonly role?: string;
	readonly can_recruit?: boolean;
	readonly name?: string;
}

/**
 * The subjects a filter selects, matching only the attributes the filter names.
 *
 * This is how a mind finds "the enemy leader" without re-deriving it from ids, the gap a bare
 * `ScoreSubject` left: `subjectsWhere(world, { side: 'red', can_recruit: true })`. `can_recruit`
 * reads a missing value as `false`, so `{ can_recruit: false }` selects everyone who is not a
 * leader, and `{ role: 'courier' }` selects a named function.
 *
 * @example
 * ```ts
 * import { subjectsWhere } from '@datamoc/mw_games/ai';
 *
 * const world = [
 *   { id: 'hero', side: 'blue', x: 0, y: 0, role: 'leader', can_recruit: true },
 *   { id: 'grunt', side: 'blue', x: 1, y: 0 },
 * ];
 * console.log(subjectsWhere(world, { can_recruit: true }).map((subject) => subject.id)); // ['hero']
 * ```
 */
export function subjectsWhere<T>(world: readonly ScoreSubject<T>[], filter: ScoreSubjectFilter): ScoreSubject<T>[] {
	return world.filter(
		(subject) =>
			(filter.side === undefined || subject.side === filter.side) &&
			(filter.type === undefined || subject.type === filter.type) &&
			(filter.role === undefined || subject.role === filter.role) &&
			(filter.can_recruit === undefined || (subject.can_recruit ?? false) === filter.can_recruit) &&
			(filter.name === undefined || subject.name === filter.name),
	);
}

/**
 * What one mind can see, and what it is worth.
 *
 * The totals stay separate because which of them matter, and how much, is the mind's business -
 * see `scoreWith`. Plain numbers, so a view crosses the AI boundary like any other `AIValue`.
 */
export interface ScoreView {
	/** the subject's own score; 0 for a whole side, which has no body of its own */
	readonly own: number;

	/** the summed score of everyone on the subject's side that it can see, itself excluded */
	readonly allies: number;

	/** the summed score of everyone on another side that it can see */
	readonly enemies: number;

	/** how many subjects it could see at all, itself included: a diagnostic, never a score */
	readonly seen: number;
}

/**
 * A personality, as data: how much of each total is its owner's business.
 *
 * Weights rather than code, on purpose. A selfish scout is `{ own: 1, allies: 0, enemies: 0 }` and
 * a loyal one `{ own: 0.5, allies: 1, enemies: 0 }`, both authored as content, and neither of them
 * needing an AI implementation of its own. An enemy weight is usually negative, since an enemy's
 * score rising is usually the subject's loss.
 */
export interface ScorePersonality {
	readonly own: number;
	readonly allies: number;
	readonly enemies: number;
}

/**
 * The view one subject has: its own score, and the scores of the allies and enemies it can see.
 *
 * `sees` is the visibility set, injected rather than assumed: a unit's own sight for an actor, the
 * union over a side's units for a whole-side mind. The subject sees its own score whether or not it
 * can see where it stands, so `own` is always read and `seen` always counts it.
 *
 * @example
 * ```ts
 * import { personalScoreView, scoreWith } from '@datamoc/mw_games/ai';
 *
 * const hero = { id: 'hero', side: 'blue', x: 2, y: 2 };
 * const world = [
 *   hero,
 *   { id: 'ally', side: 'blue', x: 3, y: 2 },
 *   { id: 'rat', side: 'red', x: 4, y: 2 },
 *   { id: 'dragon', side: 'red', x: 9, y: 9 },
 * ];
 * const worth = (id: string) => ({ hero: 10, ally: 4, rat: -2, dragon: -40 })[id] ?? 0;
 *
 * // what a scout with a two-cell reach can see
 * const sees = (x: number, y: number) => Math.abs(x - hero.x) + Math.abs(y - hero.y) <= 2;
 *
 * const view = personalScoreView(hero, world, worth, sees);
 * console.log(view); // { own: 10, allies: 4, enemies: -2, seen: 3 } - the dragon is out of reach
 * console.log(scoreWith(view, { own: 1, allies: 1, enemies: -1 })); // 16 - the rat is a nuisance
 * ```
 */
export function personalScoreView<T>(
	subject: ScoreSubject<T>,
	world: readonly ScoreSubject<T>[],
	scoreOf: (id: T) => number,
	sees: (x: number, y: number) => boolean,
): ScoreView {
	let allies = 0;
	let enemies = 0;
	let seen = 1;

	for (const other of world) {
		if (other.id === subject.id) continue;
		if (!sees(other.x, other.y)) continue;
		seen++;
		if (other.side === subject.side) allies += scoreOf(other.id);
		else enemies += scoreOf(other.id);
	}

	return { own: scoreOf(subject.id), allies, enemies, seen };
}

/**
 * The view a whole side has: every unit on it that the side can see, and every enemy it can see.
 *
 * `own` is 0, because a side has no body of its own - its units are what `allies` counts. Hand this
 * the union of a side's sight (`FactionFog.sees(side)` after syncing every unit of it) and the same
 * arithmetic that reads for one character reads for the player.
 *
 * @example
 * ```ts
 * import { FactionFog } from '@datamoc/mw_games/board';
 * import { scoreWith, sideScoreView } from '@datamoc/mw_games/ai';
 *
 * const fog = new FactionFog(10, 10);
 * const world = [
 *   { id: 'scout', side: 'blue', x: 1, y: 1 },
 *   { id: 'guard', side: 'blue', x: 7, y: 7 },
 *   { id: 'rat', side: 'red', x: 3, y: 1 },
 * ];
 * const worth = (id: string) => ({ scout: 6, guard: 9, rat: -3 })[id] ?? 0;
 *
 * // the side reads what its units see: the scout alone would miss the rat at (3, 1)
 * fog.sync('blue', [{ x: 4, y: 1 }], (source) => [source]);
 * console.log(sideScoreView('blue', world, worth, fog.sees('blue')).enemies); // -3
 * fog.sync('blue', [], () => []); // nobody watching, so nothing is read
 * console.log(sideScoreView('blue', world, worth, fog.sees('blue')).enemies); // 0
 * console.log(scoreWith(sideScoreView('blue', world, worth, fog.sees('blue')), { own: 0, allies: 1, enemies: -1 }));
 * ```
 */
export function sideScoreView<T>(
	side: string,
	world: readonly ScoreSubject<T>[],
	scoreOf: (id: T) => number,
	sees: (x: number, y: number) => boolean,
): ScoreView {
	let allies = 0;
	let enemies = 0;
	let seen = 0;

	for (const other of world) {
		if (!sees(other.x, other.y)) continue;
		seen++;
		if (other.side === side) allies += scoreOf(other.id);
		else enemies += scoreOf(other.id);
	}

	return { own: 0, allies, enemies, seen };
}

/**
 * A view collapsed into the one number a mind compares, according to what that mind cares about.
 *
 * @example
 * ```ts
 * import { scoreWith, type ScoreView } from '@datamoc/mw_games/ai';
 *
 * const view: ScoreView = { own: 10, allies: 4, enemies: -2, seen: 3 };
 *
 * console.log(scoreWith(view, { own: 1, allies: 0, enemies: 0 })); // 10 - out for itself
 * console.log(scoreWith(view, { own: 0, allies: 1, enemies: 0 })); // 4 - holds for the line
 * console.log(scoreWith(view, { own: 1, allies: 1, enemies: -1 })); // 16 - the enemy is the point
 * ```
 */
export function scoreWith(view: ScoreView, personality: ScorePersonality): number {
	return view.own * personality.own + view.allies * personality.allies + view.enemies * personality.enemies;
}
