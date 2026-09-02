import { StatBlock, type Modifier } from './StatBlock.ts';

/**
 * The shape `TurnClock.add` needs - declared here rather than imported from `mwg/world`, so
 * `mwg/actors` stays independent of it the same way every other pair of sibling modules is;
 * `TurnClock` already satisfies this structurally, with nothing to wire up on its side.
 */
export interface EffectClock {
	add(effect: { tick: (turn: number) => void; duration?: number; onExpire?: () => void }): symbol;
	remove(id: symbol): void;
}

export interface StatusEffectOptions {
	/** applied for the duration, then removed automatically - `source` is filled in, not given */
	modifiers: readonly Omit<Modifier, 'source'>[];

	/** turns until the modifiers are removed */
	duration: number;

	/** called once per turn the effect is active, such as a poison tick's own damage */
	tick?: (turn: number) => void;
}

/** ends a `StatusEffect` early, removing its modifiers immediately rather than at expiry */
export interface StatusEffectHandle {
	cancel(): void;
}

/**
 * A temporary buff or debuff: applies `modifiers` to `stats` and registers their expiry with
 * `clock`, so a game never has to remember to remove what it added. The seam `TurnClock` and
 * `StatBlock` never had on their own - `TurnClock` ticks and expires effects, `StatBlock`
 * resolves modifiers, but nothing tied one's expiry to the other's removal.
 *
 * `cancel()` on the returned handle removes the modifiers immediately and unregisters the
 * clock entry - needed because `TurnClock.remove` alone only stops future ticks, it does not
 * know this entry ever touched a `StatBlock` at all.
 */
export function applyStatusEffect(
	stats: StatBlock,
	clock: EffectClock,
	options: StatusEffectOptions
): StatusEffectHandle {
	const source = Symbol('statusEffect');
	for (const modifier of options.modifiers) stats.addModifier({ ...modifier, source });

	const id = clock.add({
		duration: options.duration,
		tick: (turn) => options.tick?.(turn),
		onExpire: () => stats.removeModifiersFrom(source),
	});

	return {
		cancel: () => {
			clock.remove(id);
			stats.removeModifiersFrom(source);
		},
	};
}
