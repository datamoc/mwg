/**
 * Items a character carries: stacking, weight, and containers within containers.
 *
 * A slot holds a quantity of one kind of item rather than one entry per item, which is what
 * stacking means in practice - forty arrows are one inventory slot, not forty. Weight and
 * capacity are optional: a game that does not track carry weight simply never sets a
 * capacity, and every check trivially passes.
 *
 * @example
 * ```ts
 * import { Inventory } from '@datamoc/mw_games/actors';
 *
 * const bag = new Inventory({ capacity: 50 });
 * bag.add({ id: 'potion', quantity: 3, stackable: true, weight: 0.5 });
 * bag.add({ id: 'potion', quantity: 2, stackable: true, weight: 0.5 }); // merges into one stack of 5
 *
 * const potion = bag.find('potion');
 * console.log(potion?.quantity, bag.totalWeight);
 * ```
 */

export interface InventoryItem {
	/** identifies the kind of item; two stackable entries with the same id (and `instanceId`) merge */
	id: string;
	quantity: number;
	stackable?: boolean;
	weight?: number;

	/**
	 * A kind-level grouping - `'herb'`, `'runestone'`, `'potion'` - so a recipe can ask for "any
	 * herb" rather than one exact id. Like `stackable` and `weight` it describes the item's kind,
	 * so it comes from the game's item definitions on load and is not part of a save.
	 */
	category?: string;

	/**
	 * Distinguishes otherwise-identical instances of the same item id - two `"sword"`s, one
	 * enchanted and one not, or two enchanted differently - so they never silently merge into
	 * one stack the way plain quantity stacking assumes every unit of an id is interchangeable.
	 * Omitted (the default, and the only behaviour before this existed), every stackable item
	 * of an id still merges into a single stack.
	 */
	instanceId?: string;

	/** an unidentified potion, a cursed ring the player does not yet know is cursed */
	identified?: boolean;
	cursed?: boolean;
	blessed?: boolean;

	/** an enchantment or upgrade level above the item's base, such as a weapon's "+2" */
	level?: number;

	/** a named affix - an enchantment, glyph, augment or curse id from an `AffixTable` */
	affix?: string;

	/** remaining durability; omit for an item that cannot wear out at all */
	durability?: number;
	maxDurability?: number;

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

	/** Finds the first item of a kind, or the matching instance when `instanceId` is supplied. */
	find(id: string, instanceId?: string): InventoryItem | undefined {
		return this.slots.find(
			(item) => item.id === id && (instanceId === undefined || item.instanceId === instanceId),
		);
	}

	/**
	 * Adds an item, merging into an existing stack when both are stackable.
	 *
	 * @returns false when a capacity is set and this would exceed it - nothing is added
	 */
	add(item: InventoryItem): boolean {
		if (!Number.isFinite(item.quantity) || item.quantity <= 0) return false;
		if (item.weight !== undefined && (!Number.isFinite(item.weight) || item.weight < 0)) return false;
		if (this.capacity !== undefined && this.totalWeight + this.weightOf(item) > this.capacity) {
			return false;
		}

		if (item.stackable) {
			const existing = this.slots.find(
				(s) => s.id === item.id && s.stackable && s.instanceId === item.instanceId,
			);
			if (existing) {
				existing.quantity += item.quantity;
				return true;
			}
		}

		this.slots.push({ ...item });
		return true;
	}

	/** removes up to `quantity` (default: the whole stack); the slot disappears once empty */
	remove(id: string, quantity?: number, instanceId?: string): void {
		if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) return;
		const index = this.slots.findIndex(
			(item) => item.id === id && (instanceId === undefined || item.instanceId === instanceId),
		);
		if (index === -1) return;

		const item = this.slots[index];
		item.quantity -= quantity ?? item.quantity;
		if (item.quantity <= 0) this.slots.splice(index, 1);
	}

	/**
	 * Takes up to `quantity` from one stack and returns an item snapshot suitable for adding to
	 * another inventory. All instance state travels with it; only the quantity is split.
	 */
	take(id: string, quantity = 1, instanceId?: string): InventoryItem | undefined {
		if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
		const index = this.slots.findIndex(
			(item) => item.id === id && (instanceId === undefined || item.instanceId === instanceId),
		);
		if (index === -1) return undefined;

		const item = this.slots[index];
		const taken = Math.min(Math.floor(quantity), item.quantity);
		if (taken <= 0) return undefined;
		const snapshot = { ...item, quantity: taken };
		item.quantity -= taken;
		if (item.quantity <= 0) this.slots.splice(index, 1);
		return snapshot;
	}

	/**
	 * What a save has to remember about one slot: its id, how many, and every field that can
	 * diverge between two items sharing that id.
	 *
	 * The split is the whole design question here. `stackable` and `weight` describe the *kind*
	 * of item and live in a game's own item table, so they are supplied fresh on load like
	 * every other definition in this framework, and a game that rebalances an item's weight
	 * sees the new value on an old save rather than the stale one baked into it. Everything
	 * else - an enchantment level, wear, a rolled affix, whether it has been identified, the
	 * `instanceId` keeping two otherwise-identical swords apart - belongs to the individual
	 * item and is exactly what would be lost if a save recorded only "3 x potion".
	 */
	toJSON(): SavedInventory {
		return {
			capacity: this.capacity,
			slots: this.slots.map((item) => ({
				id: item.id,
				quantity: item.quantity,
				instanceId: item.instanceId,
				identified: item.identified,
				cursed: item.cursed,
				blessed: item.blessed,
				level: item.level,
				affix: item.affix,
				durability: item.durability,
				maxDurability: item.maxDurability,
				contents: item.contents?.toJSON(),
			})),
		};
	}

	/**
	 * Rebuilds an inventory, taking each item's kind-level fields from `defs`.
	 *
	 * Throws on an id `defs` does not know, rather than restoring a weightless unstackable
	 * ghost of it: a save naming an item the game no longer has is a real problem, and finding
	 * out at load is far cheaper than finding out when a carry-weight check silently disagrees.
	 */
	static fromJSON(defs: ReadonlyMap<string, ItemDefinition>, data: SavedInventory): Inventory {
		const inventory = new Inventory({ capacity: data.capacity });

		inventory.slots = data.slots.map((saved) => {
			const definition = defs.get(saved.id);
			if (!definition) throw new Error(`Inventory.fromJSON: no definition for item "${saved.id}"`);

			const { contents, ...instance } = saved;
			//the definition first, then the saved instance state over it, with absent optional
			//fields dropped rather than written as undefined - spreading those would overwrite
			//the definition's own weight or stackable flag with nothing
			const item: InventoryItem = {
				...definition,
				...stripUndefined(instance),
				id: saved.id,
				quantity: saved.quantity,
			};
			if (contents) item.contents = Inventory.fromJSON(defs, contents);
			return item;
		});

		return inventory;
	}
}

/** the kind-level fields a game's own item table supplies, rather than the save file */
export type ItemDefinition = Pick<InventoryItem, 'stackable' | 'weight' | 'category'>;

/** one slot as saved: instance state only, no kind-level fields */
export interface SavedInventoryItem {
	id: string;
	quantity: number;
	instanceId?: string;
	identified?: boolean;
	cursed?: boolean;
	blessed?: boolean;
	level?: number;
	affix?: string;
	durability?: number;
	maxDurability?: number;
	contents?: SavedInventory;
}

export interface SavedInventory {
	capacity?: number;
	slots: SavedInventoryItem[];
}

/**
 * Drops keys whose value is `undefined`.
 *
 * `toJSON` writes every optional field, so a slot that never had a `level` round-trips as
 * `level: undefined`. Spreading that over a definition would overwrite the definition's own
 * value with `undefined` rather than leaving it alone, which is how a restored item would
 * quietly lose its weight.
 */
function stripUndefined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
