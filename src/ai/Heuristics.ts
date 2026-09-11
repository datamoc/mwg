/** A single aspect's value: the shapes a game authors in content without inventing a type. */
export type AspectValue = number | string | boolean | readonly string[];
export interface AspectValues {
	readonly [name: string]: AspectValue | undefined;
}

/**
 * The named tuning knobs of a heuristic AI - Wesnoth's "aspects" - read by whatever stage is
 * scoring candidates. `mwg` ships no values, because the numbers are game content: a side sets
 * `aggression`, `caution`, `village_value`, `keep_away` and the rest to whatever its own balance
 * wants, and a difficulty level overrides a few of them.
 *
 * Typed readers give a stage a usable number without every caller casting: a missing aspect reads
 * as the fallback (`1` for a weight, so an unset aspect is neutral rather than zeroing a score).
 *
 * @example
 * ```ts
 * import { Aspects } from '@datamoc/mw_games/ai';
 *
 * const aspects = new Aspects({ aggression: 2, keep_away: 3 });
 * console.log(aspects.number('aggression')); // 2
 * console.log(aspects.number('caution')); // 0 - the fallback
 * ```
 */
export class Aspects {
	private values: Record<string, AspectValue> = {};

	constructor(defaults: AspectValues = {}) {
		for (const [name, value] of Object.entries(defaults)) {
			if (value !== undefined) this.values[name] = value;
		}
	}

	has(name: string): boolean {
		return this.values[name] !== undefined;
	}

	get(name: string): AspectValue | undefined {
		return this.values[name];
	}

	set(name: string, value: AspectValue): void {
		this.values[name] = value;
	}

	/** a numeric aspect, or `fallback` when it is missing or not a number */
	number(name: string, fallback = 0): number {
		const value = this.values[name];
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'boolean') return value ? 1 : 0;
		return fallback;
	}

	flag(name: string, fallback = false): boolean {
		const value = this.values[name];
		return typeof value === 'boolean' ? value : fallback;
	}

	/** a list aspect; a bare string reads as a one-entry list, anything else as empty */
	list(name: string): readonly string[] {
		const value = this.values[name];
		if (Array.isArray(value)) return value;
		if (typeof value === 'string') return [value];
		return [];
	}

	names(): string[] {
		return Object.keys(this.values);
	}

	/** a new store with `overrides` laid over this one, leaving this one untouched */
	with(overrides: AspectValues): Aspects {
		const next = new Aspects(this.values);
		for (const [name, value] of Object.entries(overrides)) {
			if (value !== undefined) next.set(name, value);
		}
		return next;
	}

	toJSON(): Record<string, AspectValue> {
		return { ...this.values };
	}

	static fromJSON(values: Readonly<Record<string, AspectValue>>): Aspects {
		return new Aspects(values);
	}
}

export interface DifficultyLevel {
	id: string;
	name?: string;
	/** the aspects this level changes from the game's base set */
	aspects?: AspectValues;
}

/**
 * Named difficulty levels, each a set of aspect overrides - Wesnoth's native difficulty ladder,
 * which is really "the same AI with different numbers". A level is applied on top of a base aspect
 * set, so a game writes its normal AI once and a level only lists what it changes.
 *
 * @example
 * ```ts
 * import { Aspects, Difficulty } from '@datamoc/mw_games/ai';
 *
 * const difficulty = new Difficulty(
 *   [{ id: 'hard', aspects: { aggression: 2, keep_away: 3 } }],
 *   { aggression: 1 },
 * );
 * console.log(difficulty.aspectsFor('hard').number('aggression')); // 2
 * ```
 */
export class Difficulty {
	private readonly levels = new Map<string, DifficultyLevel>();
	private readonly base: Aspects;

	constructor(levels: readonly DifficultyLevel[] = [], base: AspectValues = {}) {
		this.base = new Aspects(base);
		for (const level of levels) {
			if (this.levels.has(level.id)) throw new Error(`duplicate difficulty level: ${level.id}`);
			this.levels.set(level.id, level);
		}
	}

	get ids(): string[] {
		return [...this.levels.keys()];
	}

	get(id: string): DifficultyLevel | undefined {
		return this.levels.get(id);
	}

	/** the base aspects with a level's overrides applied; throws for an unknown level */
	aspectsFor(id: string): Aspects {
		const level = this.levels.get(id);
		if (!level) throw new Error(`unknown difficulty level: ${id}`);
		return this.base.with(level.aspects ?? {});
	}
}

export type GoalKind = 'attack' | 'defend' | 'retreat' | 'capture' | 'scout';

export interface Goal {
	unit: string;
	kind: GoalKind;
	/** what the goal is about: the enemy to attack, the village to hold */
	target?: string;
	/** a tiebreaker between goals, read by a stage's own `weigh`; defaults to 1 */
	priority?: number;
}

/**
 * Per-unit goals - "hold this village", "attack that leader" - kept as a small registry for a
 * stage's `weigh` to read. `mwg` does not decide what a goal is worth, the same way it ships no
 * damage formula: the registry answers *what* a unit has been told to do, and a game's weigh
 * decides how much that matters.
 *
 * @example
 * ```ts
 * import { Goals } from '@datamoc/mw_games/ai';
 *
 * const goals = new Goals();
 * goals.set({ unit: 'hero', kind: 'attack', target: 'rat', priority: 3 });
 * console.log(goals.get('hero')?.kind); // 'attack'
 * ```
 */
export class Goals {
	private readonly byUnit = new Map<string, Goal>();

	set(goal: Goal): void {
		this.byUnit.set(goal.unit, { ...goal });
	}

	clear(unit: string): void {
		this.byUnit.delete(unit);
	}

	get(unit: string): Goal | undefined {
		return this.byUnit.get(unit);
	}

	all(): readonly Goal[] {
		return [...this.byUnit.values()];
	}

	get isEmpty(): boolean {
		return this.byUnit.size === 0;
	}
}

/**
 * The order a side recruits in - Wesnoth's `recruitment_pattern`, e.g. `scout, fighter, archer` -
 * cycled by turn. A side with nothing left to recruit falls back to its `fallback`, and a side
 * with neither recruits nothing.
 *
 * @example
 * ```ts
 * import { RecruitmentPattern } from '@datamoc/mw_games/ai';
 *
 * const pattern = new RecruitmentPattern(['scout', 'fighter'], 'fighter');
 * console.log(pattern.at(0), pattern.at(1), pattern.at(2)); // scout fighter scout
 * ```
 */
export class RecruitmentPattern {
	private readonly order: readonly string[];
	private readonly fallback: string | null;

	constructor(order: readonly string[], fallback: string | null = null) {
		this.order = order;
		this.fallback = fallback;
	}

	get length(): number {
		return this.order.length;
	}

	/** the unit type at a position in the cycle, or the fallback when the pattern is empty */
	at(index: number): string | null {
		if (this.order.length === 0) return this.fallback;
		const wrapped = ((index % this.order.length) + this.order.length) % this.order.length;
		return this.order[wrapped];
	}

	/** the entry after `after` in the cycle, or the first when `after` is not in it */
	next(after: string | null): string | null {
		if (this.order.length === 0) return this.fallback;
		if (after === null) return this.order[0];
		const index = this.order.indexOf(after);
		return this.at(index < 0 ? 0 : index + 1);
	}
}

export interface HeuristicCandidate<A = unknown> {
	/** an id for tracing which candidate won */
	id: string;
	action: A;
	/** the unit the action belongs to, matched against `Goals` by a stage's own `weigh` */
	unit?: string;
	/**
	 * Aspect-named weights this candidate contributes, e.g. `{ aggression: 3, village_value: 2 }`.
	 * `distance` is special: with a `keep_away` aspect it is penalised by `keepAwayScore`.
	 */
	factors?: Readonly<Record<string, number>>;
	/** the acting unit's type, when the candidate carries one */
	type?: string;
	/** the acting unit's role/function, e.g. `leader` or `courier` */
	role?: string;
	/** whether the acting unit can recruit */
	can_recruit?: boolean;
	/** the acting unit's own name */
	name?: string;
}

export interface HeuristicContext {
	aspects: Aspects;
	goals?: Goals;
	turn?: number;
}

export interface HeuristicStage<A = unknown> {
	id: string;
	/** whether this stage runs at all; it always does when omitted */
	when?: (context: HeuristicContext) => boolean;
	/** score one candidate; higher wins. Defaults to `defaultWeigh` */
	weigh?: (candidate: HeuristicCandidate<A>, context: HeuristicContext) => number;
}

export interface HeuristicDecision<A = unknown> {
	candidate: HeuristicCandidate<A>;
	stage: string;
	score: number;
}

/**
 * The candidate-action pipeline at the heart of a Wesnoth-style AI: stages run in order, the first
 * one whose `when` passes scores every candidate with its `weigh`, and the highest score wins (the
 * earlier candidate on a tie, so a decision is stable across equal scores).
 *
 * The default `weigh` is the aspect-weighted sum of each candidate's `factors`, which is what makes
 * the aspects worth having: a game sets `aggression: 2` once and every candidate naming
 * `aggression` is worth twice as much. `keep_away` is honoured through a candidate's `distance`
 * factor. A stage that needs more - goal priorities, terrain, this turn's state - brings its own
 * `weigh`, and `mwg` stays out of the rules.
 *
 * @example
 * ```ts
 * import { Aspects, HeuristicAI } from '@datamoc/mw_games/ai';
 *
 * const ai = new HeuristicAI<{ kind: string }>({ stages: [{ id: 'best' }] });
 * const decision = ai.decide(
 *   [
 *     { id: 'wait', action: { kind: 'wait' }, factors: { caution: 2 } },
 *     { id: 'charge', action: { kind: 'attack' }, factors: { aggression: 3 } },
 *   ],
 *   { aspects: new Aspects({ aggression: 1, caution: 1 }) },
 * );
 * console.log(decision?.candidate.id); // 'charge'
 * ```
 */
export class HeuristicAI<A = unknown> {
	private readonly stages: readonly HeuristicStage<A>[];

	constructor(options: { stages: readonly HeuristicStage<A>[] }) {
		this.stages = options.stages;
	}

	/** the first stage's best candidate, or `null` when nothing applies or no candidate is given */
	decide(candidates: readonly HeuristicCandidate<A>[], context: HeuristicContext): HeuristicDecision<A> | null {
		if (candidates.length === 0) return null;
		for (const stage of this.stages) {
			if (stage.when && !stage.when(context)) continue;
			const weigh = stage.weigh ?? defaultWeigh<A>;
			let best: HeuristicDecision<A> | null = null;
			for (const candidate of candidates) {
				const score = weigh(candidate, context);
				if (!best || score > best.score) best = { candidate, stage: stage.id, score };
			}
			return best;
		}
		return null;
	}
}

/**
 * The default stage weight: each factor times the aspect of the same name (an unset aspect weighs
 * 1, so a factor on its own is not erased), minus a `keepAwayScore` penalty for a candidate's
 * `distance`.
 *
 * @example
 * ```ts
 * import { Aspects, defaultWeigh } from '@datamoc/mw_games/ai';
 *
 * const score = defaultWeigh(
 *   { id: 'charge', action: {}, factors: { aggression: 3 } },
 *   { aspects: new Aspects({ aggression: 2 }) },
 * );
 * console.log(score); // 6
 * ```
 */
export function defaultWeigh<A>(candidate: HeuristicCandidate<A>, context: HeuristicContext): number {
	let score = 0;
	for (const [name, weight] of Object.entries(candidate.factors ?? {})) {
		if (name === 'distance') continue;
		score += weight * context.aspects.number(name, 1);
	}
	const distance = candidate.factors?.distance;
	if (distance !== undefined) score += keepAwayScore(distance, context.aspects.number('keep_away', 0));
	return score;
}

/**
 * How much a candidate at `distance` loses for being inside a `keepAway` radius: 0 when there is no
 * radius or the candidate is outside it, otherwise the shortfall as a negative score.
 *
 * @example
 * ```ts
 * import { keepAwayScore } from '@datamoc/mw_games/ai';
 *
 * console.log(keepAwayScore(1, 3)); // -2, two tiles inside the radius
 * console.log(keepAwayScore(5, 3)); // 0, outside it
 * ```
 */
export function keepAwayScore(distance: number, keepAway: number): number {
	if (!(keepAway > 0) || distance >= keepAway) return 0;
	return -(keepAway - distance);
}

/**
 * What a stage's own weigh can add for a goal: its `priority`, or 1 when it has none.
 *
 * @example
 * ```ts
 * import { goalScore } from '@datamoc/mw_games/ai';
 *
 * console.log(goalScore({ unit: 'u1', kind: 'attack', priority: 3 })); // 3
 * console.log(goalScore(undefined)); // 0, no goal at all
 * ```
 */
export function goalScore(goal: Goal | undefined): number {
	return goal ? Math.max(0, goal.priority ?? 1) : 0;
}
