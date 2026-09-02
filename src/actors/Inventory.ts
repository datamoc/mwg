/**
 * Items a character carries: stacking, weight, and containers within containers.
 *
 * A slot holds a quantity of one kind of item rather than one entry per item, which is what
 * stacking means in practice - forty arrows are one inventory slot, not forty. Weight and
 * capacity are optional: a game that does not track carry weight simply never sets a
 * capacity, and every check trivially passes.
 */

export interface InventoryItem {
	/** identifies the kind of item; two stackable entries with the same id merge */
	id: string;
	quantity: number;
	stackable?: boolean;
	weight?: number;

	/** an unidentified potion, a cursed ring the player does not yet know is cursed */
	identified?: boolean;
	cursed?: boolean;
	blessed?: boolean;

	/** a container - a bag, a chest - whose own weight adds to whatever is inside it */
	contents?: Inventory;
}

export interface InventoryOptions {
	/** total weight this inventory can hold; omit for no limit */
	capacity?: number;
}

export class Inventory {
	private slots: InventoryItem[] = [];
	readonly capacity?: number;

	constructor(options: InventoryOptions = {}) {
		this.capacity = options.capacity;
	}

	get items(): readonly InventoryItem[] {
		return this.slots;
	}

	get totalWeight(): number {
		return this.slots.reduce((sum, item) => sum + this.weightOf(item), 0);
	}

	private weightOf(item: InventoryItem): number {
		return (item.weight ?? 0) * item.quantity + (item.contents?.totalWeight ?? 0);
	}

	find(id: string): InventoryItem | undefined {
		return this.slots.find((item) => item.id === id);
	}

	/**
	 * Adds an item, merging into an existing stack when both are stackable.
	 *
	 * @returns false when a capacity is set and this would exceed it - nothing is added
	 */
	add(item: InventoryItem): boolean {
		if (this.capacity !== undefined && this.totalWeight + this.weightOf(item) > this.capacity) {
			return false;
		}

		if (item.stackable) {
			const existing = this.slots.find((s) => s.id === item.id && s.stackable);
			if (existing) {
				existing.quantity += item.quantity;
				return true;
			}
		}

		this.slots.push({ ...item });
		return true;
	}

	/** removes up to `quantity` (default: the whole stack); the slot disappears once empty */
	remove(id: string, quantity?: number): void {
		const index = this.slots.findIndex((item) => item.id === id);
		if (index === -1) return;

		const item = this.slots[index];
		item.quantity -= quantity ?? item.quantity;
		if (item.quantity <= 0) this.slots.splice(index, 1);
	}
}
