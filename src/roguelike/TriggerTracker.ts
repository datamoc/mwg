/**
 * Counts qualifying events (a landed hit, a heal, a kill) toward a streak, but restarts the
 * streak once more than `window` turns pass without a qualifying event - the shape every
 * "combo", "kill streak", or "stays hidden as long as you keep landing sneak attacks" talent
 * proc shares. `mwg` tracks only the streak and its turn-window; what counts as a qualifying
 * event, and what a streak length unlocks, stay the game's own rule, fired from `trigger`'s
 * own returned count.
 */
export class TriggerTracker {
	private readonly window: number;
	private streak = 0;
	private lastTurn = -Infinity;

	constructor(window: number) {
		this.window = window;
	}

	/** the current streak length; 0 once the window has lapsed with nothing recorded */
	get count(): number {
		return this.streak;
	}

	/**
	 * Records a qualifying event on `turn`, extending the streak when it falls within `window`
	 * turns of the last one, or restarting it at 1 otherwise.
	 *
	 * @returns the streak length after this event
	 */
	trigger(turn: number): number {
		this.streak = turn - this.lastTurn <= this.window ? this.streak + 1 : 1;
		this.lastTurn = turn;
		return this.streak;
	}

	/** true while fewer than `window` turns have passed since the last trigger, as of `turn` */
	isActive(turn: number): boolean {
		return turn - this.lastTurn <= this.window;
	}

	/** ends the streak immediately - a missed attack, breaking stealth - without waiting out the window */
	reset(): void {
		this.streak = 0;
		this.lastTurn = -Infinity;
	}

	toJSON(): { streak: number; lastTurn: number } {
		return { streak: this.streak, lastTurn: this.lastTurn };
	}

	static fromJSON(window: number, data: { streak: number; lastTurn: number }): TriggerTracker {
		const tracker = new TriggerTracker(window);
		tracker.streak = data.streak;
		tracker.lastTurn = data.lastTurn;
		return tracker;
	}
}
