/** Minimum scheduling surface required by the runner. */
export interface ScheduledTurns<Actor> {
	peek(): Actor | null;
	spend(cost: number): void;
}

export interface TurnRules<Actor> {
	scheduler: ScheduledTurns<Actor>;
	finished(): boolean;
	needsInput(actor: Actor): boolean;
	/** Return the cost to spend on the current queue entry, or null if no entry should be charged. */
	act(actor: Actor): number | null;
}

export type TurnResult<Actor> =
	| { status: 'input'; actor: Actor; steps: number }
	| { status: 'finished' | 'empty' | 'limit'; steps: number };

/**
 * Advance automatic actions with an explicit work budget. Input actors are never spent.
 * Rules own actor removal and queue replacement. A returned cost is charged after act(),
 * even if that action ends the game; return null when the action already handled its cost.
 * Reaching the budget returns limit without another peek or action. The caller decides
 * whether to resume, report a stalled simulation, or yield to its host.
 */
export function advanceToInput<Actor>(rules: TurnRules<Actor>, budget: number): TurnResult<Actor> {
	if (!Number.isSafeInteger(budget) || budget < 0) throw new RangeError('Turn budget must be a non-negative safe integer');
	let steps = 0;
	while (steps < budget) {
		if (rules.finished()) return { status: 'finished', steps };
		const actor = rules.scheduler.peek();
		if (actor === null) return { status: 'empty', steps };
		if (rules.needsInput(actor)) return { status: 'input', actor, steps };
		const cost = rules.act(actor);
		if (cost !== null) {
			if (!Number.isFinite(cost) || cost < 0) throw new RangeError('Action cost must be finite and non-negative, or null');
			rules.scheduler.spend(cost);
		}
		steps++;
	}
	return { status: 'limit', steps };
}
