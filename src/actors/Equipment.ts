import type { StatBlock, Modifier } from './StatBlock.ts';

export interface EquippableItem {
	/** applied to the wearer's StatBlock while equipped, removed together on unequip */
	modifiers?: Modifier[];
}

export interface EquipmentOptions<Slot extends string, Item extends EquippableItem> {
	/**
	 * Whether whatever is currently in `slot` refuses to come off - a cursed ring, a
	 * quest-bound relic. A locked slot also refuses a swap, since swapping starts by
	 * removing what is there.
	 */
	locked?: (slot: Slot, item: Item) => boolean;
}

/**
 * Equipment slots, defined per game rather than fixed by the framework - `'leftHand'` and
 * `'rightHand'`, or `'weapon'` / `'armor'` / `'amulet'`, or a dozen Diablo-style slots.
 * Whatever an item's `modifiers` are, equipping it applies them to the given `StatBlock` and
 * unequipping removes exactly those - tagged by the item itself as their `source`, so two
 * rings of the same kind never remove each other's bonus by mistake.
 */
export class EquipmentSlots<Slot extends string, Item extends EquippableItem> {
	private readonly names: ReadonlySet<Slot>;
	private worn = new Map<Slot, Item>();
	private stats: StatBlock | null;
	private isSlotLocked: (slot: Slot, item: Item) => boolean;

	constructor(slots: readonly Slot[], stats: StatBlock | null = null, options: EquipmentOptions<Slot, Item> = {}) {
		this.names = new Set(slots);
		this.stats = stats;
		this.isSlotLocked = options.locked ?? (() => false);
	}

	get(slot: Slot): Item | undefined {
		return this.worn.get(slot);
	}

	/** true when the slot holds something that refuses to come off - check this, since a refused `unequip` is otherwise indistinguishable from an empty slot */
	isLocked(slot: Slot): boolean {
		const item = this.worn.get(slot);
		return item !== undefined && this.isSlotLocked(slot, item);
	}

	/**
	 * @returns the item that was previously in this slot, if any - or undefined without
	 * changing anything when the slot is locked
	 */
	equip(slot: Slot, item: Item): Item | undefined {
		this.assertSlot(slot);
		if (this.isLocked(slot)) return undefined;
		const previous = this.unequip(slot);

		this.worn.set(slot, item);
		for (const modifier of item.modifiers ?? []) {
			this.stats?.addModifier({ ...modifier, source: item });
		}
		return previous;
	}

	/** @returns the removed item, or undefined for an empty slot - or a locked one, which stays put */
	unequip(slot: Slot): Item | undefined {
		const item = this.worn.get(slot);
		if (!item) return undefined;
		if (this.isSlotLocked(slot, item)) return undefined;

		this.worn.delete(slot);
		this.stats?.removeModifiersFrom(item);
		return item;
	}

	get slots(): readonly Slot[] {
		return [...this.names];
	}

	private assertSlot(slot: Slot): void {
		if (!this.names.has(slot)) throw new Error(`no such equipment slot: "${slot}"`);
	}
}
