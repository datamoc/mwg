/**
 * The slower clock a roguelike's hunger, poison and other long-running effects run on -
 * distinct from `mwg/roguelike`'s `Scheduler`, which decides who acts next *within* a turn.
 * `TurnClock` counts turns that have already happened and drives whatever should happen
 * once per turn, or run out after a fixed number of them, regardless of who took the turn.
 */
export interface TimedEffect {
	/** called once per `advance`, with the clock's new total */
	tick: (turn: number) => void;

	/** turns remaining before this effect is removed automatically; omit to run forever */
	duration?: number;
}

export class TurnClock {
	turn = 0;

	private effects = new Map<symbol, TimedEffect>();

	/** registers an effect and returns a handle for `remove` */
	add(effect: TimedEffect): symbol {
		const id = Symbol();
		this.effects.set(id, { ...effect });
		return id;
	}

	remove(id: symbol): void {
		this.effects.delete(id);
	}

	has(id: symbol): boolean {
		return this.effects.has(id);
	}

	/** advances the clock and ticks every effect, removing any whose duration has elapsed */
	advance(turns = 1): void {
		this.turn += turns;

		for (const [id, effect] of this.effects) {
			effect.tick(this.turn);

			if (effect.duration !== undefined) {
				effect.duration -= turns;
				if (effect.duration <= 0) this.effects.delete(id);
			}
		}
	}
}
