/**
 * The turn model a strategy game counts by: sides take turns one after another, a round is
 * every side taking one, and the time of day steps on once per round. This is deliberately
 * distinct from `TurnClock` (timed effects on a single actor) and `simulation.Scheduler`
 * (energy-cost turn order within a side): it is the outer loop a scenario runs on.
 *
 * The time schedule carries a `lawfulBonus` per entry, in percent, the number the reference
 * game's `[time] lawful_bonus=` writes (day `25`, night `-25`, dawn/dusk `0`). A unit's
 * alignment turns that into its own bonus, and a `TimeArea` can override the schedule for
 * part of the map, which is what makes the bonus per-hex rather than global.
 */

/** how a unit's damage answers the time of day, the reference's `align=` values */
export type Alignment = 'lawful' | 'neutral' | 'chaotic' | 'liminal';

export interface TimeOfDay {
	/** the time's own name: a game's content (`'morning'`, `'first_watch'`) */
	id: string;

	/** the schedule's own percentage a lawful unit gains and a chaotic one loses */
	lawfulBonus: number;
}

/** A part of the map on its own schedule, indexed in parallel with the global one. */
export interface TimeArea {
	/** the schedule this area's cells use instead of the global one */
	times: readonly TimeOfDay[];

	contains(x: number, y: number): boolean;
}

export interface SideTurnsOptions {
	/** the sides in the order they take turns within a round */
	sides: readonly string[];

	/** the time-of-day schedule, one entry per round, cycling */
	schedule: readonly TimeOfDay[];

	/** which side takes the first turn; 0 by default */
	sideIndex?: number;

	/** the first round, 1 by default (rounds are 1-based, as the reference's `turn` is) */
	round?: number;

	/** the schedule entry the first round uses; 0 by default */
	timeIndex?: number;

	/** per-cell schedule overrides; the first area containing a cell wins */
	areas?: readonly TimeArea[];
}

export interface SideTurn {
	side: string;
	round: number;

	/** true on the turn that opened a new round and advanced the time of day */
	newRound: boolean;
}

/** what `SideTurns.toJSON` writes and `fromJSON` resumes from */
export interface SideTurnState {
	round: number;
	sideIndex: number;
	timeIndex: number;
}

/**
 * Which side is taking its turn, which round it is, and what time of day applies - the
 * outer scenario loop. `advance()` moves to the next side; wrapping past the last side opens
 * a new round and steps the schedule on one entry, cycling. `timeOfDayAt(x, y)` and
 * `lawfulBonusAt(...)` read the schedule for a cell, so a time area can give one region a
 * different bonus without a second turn counter.
 *
 * @example
 * ```ts
 * import { SideTurns } from '@datamoc/mw_games/world';
 *
 * const turns = new SideTurns({
 *   sides: ['rebels', 'undead'],
 *   schedule: [
 *     { id: 'day', lawfulBonus: 25 },
 *     { id: 'night', lawfulBonus: -25 },
 *   ],
 * });
 *
 * console.log(turns.side, turns.round, turns.timeOfDay.id); // 'rebels' 1 'day'
 * console.log(turns.lawfulBonusAt('lawful', 4, 4)); // 25 - a lawful unit in the day
 * turns.advance(); // 'undead', still round 1
 * turns.advance(); // 'rebels', round 2, timeOfDay is now 'night'
 * ```
 */
export class SideTurns {
	readonly sides: readonly string[];
	readonly schedule: readonly TimeOfDay[];

	private readonly areas: readonly TimeArea[];
	private state: SideTurnState;

	constructor(options: SideTurnsOptions) {
		if (options.sides.length === 0) throw new Error('SideTurns needs at least one side');
		if (options.schedule.length === 0) throw new Error('SideTurns needs a non-empty schedule');

		const round = options.round ?? 1;
		const sideIndex = options.sideIndex ?? 0;
		const timeIndex = options.timeIndex ?? 0;
		if (!Number.isInteger(round) || round < 1) throw new Error('SideTurns round must be a positive integer');
		if (sideIndex < 0 || sideIndex >= options.sides.length) {
			throw new Error(`SideTurns side index ${sideIndex} is outside ${options.sides.length} sides`);
		}
		if (timeIndex < 0 || timeIndex >= options.schedule.length) {
			throw new Error(`SideTurns time index ${timeIndex} is outside ${options.schedule.length} times`);
		}

		this.sides = [...options.sides];
		this.schedule = [...options.schedule];
		this.areas = options.areas ?? [];
		this.state = { round, sideIndex, timeIndex };
	}

	get round(): number {
		return this.state.round;
	}

	/** the side whose turn it is */
	get side(): string {
		return this.sides[this.state.sideIndex];
	}

	get timeIndex(): number {
		return this.state.timeIndex;
	}

	/** the global time of day, before any time area overrides it */
	get timeOfDay(): TimeOfDay {
		return this.schedule[this.state.timeIndex];
	}

	get snapshot(): SideTurnState {
		return { ...this.state };
	}

	/** The time of day at a cell: the first containing time area's entry, else the global one. */
	timeOfDayAt(x: number, y: number): TimeOfDay {
		for (const area of this.areas) {
			if (!area.contains(x, y)) continue;
			return area.times[this.state.timeIndex] ?? this.timeOfDay;
		}
		return this.timeOfDay;
	}

	/** The percentage bonus `alignment` gets at a cell, through that cell's own time of day. */
	lawfulBonusAt(alignment: Alignment, x: number, y: number): number {
		return alignmentBonus(alignment, this.timeOfDayAt(x, y).lawfulBonus);
	}

	/** Moves to the next side, opening a new round and stepping the schedule on a wrap. */
	advance(): SideTurn {
		let newRound = false;
		this.state.sideIndex++;
		if (this.state.sideIndex >= this.sides.length) {
			this.state.sideIndex = 0;
			this.state.round++;
			this.state.timeIndex = (this.state.timeIndex + 1) % this.schedule.length;
			newRound = true;
		}
		return { side: this.side, round: this.state.round, newRound };
	}

	toJSON(): SideTurnState {
		return this.snapshot;
	}

	/** Resumes from `toJSON`, with the same sides/schedule/areas the game was created with. */
	static fromJSON(options: SideTurnsOptions, state: SideTurnState): SideTurns {
		return new SideTurns({
			...options,
			round: state.round,
			sideIndex: state.sideIndex,
			timeIndex: state.timeIndex,
		});
	}
}

/**
 * What one alignment gets out of the time of day's own `lawfulBonus`, in percent: a lawful
 * unit takes it, a chaotic one takes its negation, and neutral and liminal units ignore the
 * time entirely (the reference's own four `align=` values).
 *
 * @example
 * ```ts
 * import { alignmentBonus } from '@datamoc/mw_games/world';
 *
 * alignmentBonus('lawful', 25); // 25 - day favours a lawful unit
 * alignmentBonus('chaotic', 25); // -25 - the same day punishes a chaotic one
 * alignmentBonus('neutral', 25); // 0 - neutral ignores the time of day
 * ```
 */
export function alignmentBonus(alignment: Alignment, lawfulBonus: number): number {
	switch (alignment) {
		case 'lawful':
			return lawfulBonus;
		case 'chaotic':
			return -lawfulBonus;
		default:
			return 0;
	}
}
