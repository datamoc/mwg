import type { StatBlock, Modifier } from './StatBlock.ts';

export interface EquippableItem {
	/** applied to the wearer's StatBlock while equipped, removed together on unequip */
	modifiers?: Modifier[];
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

	constructor(slots: readonly Slot[], stats: StatBlock | null = null) {
		this.names = new Set(slots);
		this.stats = stats;
	}

	get(slot: Slot): Item | undefined {
		return this.worn.get(slot);
	}

	get slots(): readonly Slot[] {
		return [...this.names];
	}

	/** @returns the item that was previously in this slot, if any */
	equip(slot: Slot, item: Item): Item | undefined {
		this.assertSlot(slot);
		const previous = this.unequip(slot);

		this.worn.set(slot, item);
		for (const modifier of item.modifiers ?? []) {
			this.stats?.addModifier({ ...modifier, source: item });
		}
		return previous;
	}

	unequip(slot: Slot): Item | undefined {
		const item = this.worn.get(slot);
		if (!item) return undefined;

		this.worn.delete(slot);
		this.stats?.removeModifiersFrom(item);
		return item;
	}

	private assertSlot(slot: Slot): void {
		if (!this.names.has(slot)) throw new Error(`no such equipment slot: "${slot}"`);
	}
}
