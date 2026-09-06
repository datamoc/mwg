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
 *
 * @example
 * ```ts
 * import { EquipmentSlots, StatBlock } from '@datamoc/mw_games/actors';
 *
 * const stats = new StatBlock({ base: { attack: 3 } });
 * const equipment = new EquipmentSlots<'weapon' | 'armor', { modifiers?: import('@datamoc/mw_games/actors').Modifier[] }>(
 *   ['weapon', 'armor'],
 *   stats
 * );
 *
 * const sword = { modifiers: [{ stat: 'attack', op: 'add' as const, value: 5 }] };
 * equipment.equip('weapon', sword);
 * console.log(stats.get('attack')); // 8
 *
 * equipment.unequip('weapon');
 * console.log(stats.get('attack')); // 3
 * ```
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

		this.wear(slot, item);
		return previous;
	}

	/** puts an item on and applies its modifiers, with no lock check - the shared half of `equip` and `fromJSON` */
	private wear(slot: Slot, item: Item): void {
		this.worn.set(slot, item);
		for (const modifier of item.modifiers ?? []) {
			this.stats?.addModifier({ ...modifier, source: item });
		}
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

	/**
	 * Which slot holds which item, by whatever id `identify` gives each one.
	 *
	 * An item is a game's own object here (`Item` is a type parameter, and `EquippableItem`
	 * requires only `modifiers`), so this framework has no idea what identifies one. The
	 * caller says, usually with the same id its item table is keyed by.
	 */
	toJSON(identify: (item: Item) => string): SavedEquipment<Slot> {
		return { worn: [...this.worn].map(([slot, item]) => [slot, identify(item)]) };
	}

	/**
	 * Rebuilds the slots and re-equips everything, so each item's modifiers land back on the
	 * `StatBlock` exactly as they were.
	 *
	 * That reapplication is the point: `StatBlock.toJSON` deliberately saves no modifiers,
	 * precisely because whatever applied them puts them back on load. A locked item is
	 * restored rather than refused - a cursed ring the character was already wearing is still
	 * on their finger after a reload, and `equip`'s refusal is about *putting one on*, which
	 * is not what this is doing.
	 */
	static fromJSON<Slot extends string, Item extends EquippableItem>(
		defs: {
			slots: readonly Slot[];
			/** turns a saved id back into the game's own item object */
			resolve: (id: string) => Item;
			stats?: StatBlock | null;
			locked?: (slot: Slot, item: Item) => boolean;
		},
		data: SavedEquipment<Slot>
	): EquipmentSlots<Slot, Item> {
		const equipment = new EquipmentSlots<Slot, Item>(defs.slots, defs.stats ?? null, { locked: defs.locked });

		for (const [slot, id] of data.worn) {
			equipment.assertSlot(slot);
			equipment.wear(slot, defs.resolve(id));
		}
		return equipment;
	}
}

export interface SavedEquipment<Slot extends string> {
	worn: [Slot, string][];
}
