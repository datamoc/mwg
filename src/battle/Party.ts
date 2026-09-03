/**
 * A roster with a limited active lineup and unlimited off-party storage - a box, a PC,
 * whatever a game calls it. Active slots can hold a gap (a fainted, withdrawn, or simply
 * empty slot); storage is just an overflow list in the order creatures were added to it.
 */
export class Party<C> {
	private active: Array<C | null>;
	private storage: C[] = [];

	constructor(activeSize: number) {
		this.active = new Array(activeSize).fill(null);
	}

	get members(): readonly (C | null)[] {
		return this.active;
	}

	get boxed(): readonly C[] {
		return this.storage;
	}

	/** the first empty active slot, or storage when the lineup is full */
	add(creature: C): void {
		const slot = this.active.indexOf(null);
		if (slot !== -1) this.active[slot] = creature;
		else this.storage.push(creature);
	}

	/** moves an active member to storage, leaving its slot empty */
	store(index: number): void {
		const creature = this.active[index];
		if (!creature) return;

		this.active[index] = null;
		this.storage.push(creature);
	}

	/** brings a boxed creature into a specific active slot, swapping out whatever was there */
	withdraw(storageIndex: number, activeSlot: number): void {
		if (activeSlot < 0 || activeSlot >= this.active.length) return;
		const creature = this.storage[storageIndex];
		if (!creature) return;

		this.storage.splice(storageIndex, 1);
		const displaced = this.active[activeSlot];
		this.active[activeSlot] = creature;
		if (displaced) this.storage.push(displaced);
	}

	/** every active, non-empty member */
	get activeMembers(): C[] {
		return this.active.filter((c): c is C => c !== null);
	}
}
