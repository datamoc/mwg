/**
 * A shield/barrier pool absorbed before HP, decaying on its own each tick unlike a plain
 * `StatBlock` stat, which only ever changes when something explicitly touches it. Several
 * layers can be held at once - a fresh cast over an older one, a ward stacked on a shield -
 * absorption always drains the most recently added layer first, so a ward cast on top of a
 * standing shield breaks before the shield underneath it does, matching how a layered proc
 * family (barrier-then-shield, shield-then-barrier) is meant to read regardless of order cast.
 */
export interface BarrierLayer {
	amount: number;

	/** how much this layer's `amount` drops per turn advanced; 0 (the default) never decays on its own */
	decayPerTick?: number;
}

export class Barrier {
	private layers: BarrierLayer[] = [];

	/** adds a new outermost layer; a non-positive amount is a no-op rather than an empty layer */
	add(amount: number, decayPerTick = 0): void {
		if (amount <= 0) return;
		this.layers.push({ amount, decayPerTick });
	}

	/** total absorption currently held, across every layer */
	get total(): number {
		return this.layers.reduce((sum, layer) => sum + layer.amount, 0);
	}

	/** how many independent layers are currently held */
	get layerCount(): number {
		return this.layers.length;
	}

	/**
	 * Absorbs up to `amount` of incoming damage, draining the outermost layer first and
	 * spilling into the next one once a layer empties.
	 *
	 * @returns the amount actually absorbed - never more than `amount`, never more than
	 * `total` was before the call - so the caller applies `amount - absorbed` to HP
	 */
	absorb(amount: number): number {
		let remaining = amount;
		let absorbed = 0;
		while (remaining > 0 && this.layers.length > 0) {
			const layer = this.layers[this.layers.length - 1];
			const take = Math.min(layer.amount, remaining);
			layer.amount -= take;
			remaining -= take;
			absorbed += take;
			if (layer.amount <= 0) this.layers.pop();
		}
		return absorbed;
	}

	/**
	 * Decays every layer by its own `decayPerTick`, removing any that reach zero or below.
	 *
	 * Named `advance(turns)` like every other turn-scale ticker here (`TurnClock`, `Charges`,
	 * `Field`, `AbilityCycle`) rather than `decay`, so one word means one thing across the
	 * framework: `advance` takes whole turns, `update` takes `dt` seconds.
	 */
	advance(turns = 1): void {
		for (let i = this.layers.length - 1; i >= 0; i--) {
			const layer = this.layers[i];
			if (!layer.decayPerTick) continue;
			layer.amount -= layer.decayPerTick * turns;
			if (layer.amount <= 0) this.layers.splice(i, 1);
		}
	}

	/** drops every layer at once - a dispel, a fresh encounter starting clean */
	clear(): void {
		this.layers = [];
	}

	toJSON(): { layers: BarrierLayer[] } {
		return { layers: this.layers.map((layer) => ({ ...layer })) };
	}

	static fromJSON(data: { layers: BarrierLayer[] }): Barrier {
		const barrier = new Barrier();
		barrier.layers = data.layers.map((layer) => ({ ...layer }));
		return barrier;
	}
}
