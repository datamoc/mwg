/**
 * A resource that refills on its own as turns pass - a wand's limited charges regenerating
 * one every few turns - distinct from a straight spendable pool (mana spent per cast,
 * restored only by an explicit event, which a `StatBlock` stat already covers on its own).
 * What that alone cannot express is "this refills automatically over time," so `Charges`
 * carries its own regeneration progress instead of leaning on `TurnClock` for it - a charge
 * either has or does not have enough banked turns to regenerate, which is exactly the kind
 * of running total a class holds more naturally than a callback would.
 *
 * @example
 * ```ts
 * import { Charges } from '@datamoc/mw_games/actors';
 *
 * const wand = new Charges({ max: 3, regenRate: 10 }); // one charge every 10 turns
 * wand.spend(1);
 *
 * wand.advance(10); // 10 turns pass; one charge regenerates
 * console.log(wand.current); // back to max
 *
 * wand.refund(1); // a kill or crit grants a charge directly, outside the normal regen path
 * ```
 */
export interface ChargesOptions {
	/** the most this can ever hold */
	max: number;

	/** starting amount; defaults to `max` (a fresh wand starts full) */
	current?: number;

	/** turns of banked time needed to regenerate one charge */
	regenRate: number;
}

export class Charges {
	readonly max: number;
	private regenRate: number;
	private value: number;
	private progress = 0;

	constructor(options: ChargesOptions) {
		this.max = options.max;
		this.regenRate = options.regenRate;
		this.value = options.current ?? options.max;
	}

	get current(): number {
		return this.value;
	}

	canAfford(cost: number): boolean {
		return this.value >= cost;
	}

	/** @returns false, spending nothing, if `cost` is not affordable right now */
	spend(cost: number): boolean {
		if (!this.canAfford(cost)) return false;
		this.value -= cost;
		return true;
	}

	/**
	 * Restores charges directly, outside the normal regen path - a killing blow or a crit
	 * refunding one on the spot. Capped at `max`.
	 *
	 * @returns how many were actually added, which is less than `amount` once `max` is hit
	 */
	refund(amount = 1): number {
		const added = Math.min(amount, this.max - this.value);
		this.value += added;
		return added;
	}

	/** banks `turns` of regeneration time, converting whole `regenRate`-sized chunks into charges */
	advance(turns = 1): void {
		if (this.value >= this.max) return;

		this.progress += turns;
		while (this.progress >= this.regenRate && this.value < this.max) {
			this.progress -= this.regenRate;
			this.value++;
		}

		//full again: no point banking further progress towards a charge there is no room for
		if (this.value >= this.max) this.progress = 0;
	}

	/**
	 * Charges held, and progress banked towards the next one.
	 *
	 * The banked progress matters as much as the count: without it, saving and loading part
	 * way to a recharge would silently reset that wait, so a player could refresh a wand a
	 * little faster by reloading. `max` and `regenRate` are definitions, supplied fresh.
	 */
	toJSON(): { current: number; progress: number } {
		return { current: this.value, progress: this.progress };
	}

	static fromJSON(options: ChargesOptions, data: { current: number; progress: number }): Charges {
		const charges = new Charges({ ...options, current: data.current });
		charges.progress = data.progress;
		return charges;
	}
}
