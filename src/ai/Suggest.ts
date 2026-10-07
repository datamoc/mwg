import type { AIDecision, AIDecisionInput } from './index.ts';

/**
 * The suggestion mode: the game's own decider, run on the live state, with the result shown
 * to the player instead of dispatched. The framework runs decisions as data by design
 * (`AIModule.decide` returns an `AIDecision`; the game applies it), so suggesting is the
 * same call pointed at a UI instead of at the world - but a hint that recomputed on every
 * frame would tax the frame budget for something the player reads once, so this owns the
 * throttle: a frame-count budget, never wall clock, the same rule the rest of the runner
 * follows (a throttled background tab must not change what is suggested).
 *
 * The decider must not mutate game state to compute a suggestion; what the player does with
 * one (accept, ignore, watch) is the game's to decide.
 */

export interface SuggesterOptions {
	/**
	 * Recompute only every Nth `update` call, keeping the previous suggestion in between.
	 * 1 (the default) recomputes on every update; 30 recomputes about twice a second at
	 * 60 fps. The first update always recomputes, so a hint appears immediately.
	 */
	every?: number;
}

/**
 * Wraps a decision function as a throttled, non-mutating hint source.
 *
 * @example
 * ```ts
 * import { Suggester } from '@datamoc/mw_games/ai';
 * import type { AIDecision, AIDecisionInput } from '@datamoc/mw_games/ai';
 *
 * declare const module: { decide(agent: string, input: AIDecisionInput): AIDecision };
 * declare const input: AIDecisionInput;
 * const hints = new Suggester((perception) => module.decide('player', perception), { every: 30 });
 * const fresh = hints.update(input); // null on the 29 throttled frames between hints
 * const current = hints.latest; // never null between updates
 * ```
 */
export class Suggester {
	private readonly decide: (input: AIDecisionInput) => AIDecision;
	private readonly every: number;
	private since: number;
	private latestDecision: AIDecision | null = null;

	constructor(decide: (input: AIDecisionInput) => AIDecision, options: SuggesterOptions = {}) {
		this.decide = decide;
		this.every = options.every ?? 1;
		if (!Number.isInteger(this.every) || this.every < 1 || this.every > 1_000_000)
			throw new RangeError('a suggestion budget must be a frame count in 1..1000000');
		//the first update recomputes; the budget applies from the second on
		this.since = this.every - 1;
	}

	/**
	 * Runs the decider on its turn and returns the fresh suggestion; null on the throttled
	 * calls between, where `latest` keeps the previous suggestion. A decision with status
	 * `idle` (nothing to suggest) is still a suggestion: the UI reads `decision.action`.
	 */
	update(input: AIDecisionInput): AIDecision | null {
		this.since++;
		if (this.since < this.every) return null;
		this.since = 0;
		this.latestDecision = this.decide(input);
		return this.latestDecision;
	}

	/** The most recent suggestion, held across the throttled calls. */
	get latest(): AIDecision | null {
		return this.latestDecision;
	}

	/** Drops the held suggestion: a scene change, a menu opened, a turn ended. */
	clear(): void {
		this.latestDecision = null;
	}
}
