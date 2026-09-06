import type { InventoryItem } from './Inventory.ts';
import * as Random from '../core/Random.ts';

/**
 * Named item affixes: enchantments, glyphs, augments, curses - whatever a game's items
 * can carry beyond their upgrade `level`.
 *
 * `mwg` draws the line `ItemState` already drew: `level` is a number any item can have,
 * but what "+1 blazing" *means* is a game's own design. An affix definition therefore
 * carries only the routing information every such system shares - which trigger it
 * answers to (`strike`, `defend`, or a `passive` that is always on), how likely it is
 * relative to its table, and whether it is a curse - and the game interprets the id
 * itself when that trigger fires, the same way `Move.effects` is data `mwg` never reads.
 */

export type AffixTrigger = 'strike' | 'defend' | 'passive';

/** the kind of action a `strike`/`defend` trigger fired from - melee, thrown, a bow, an ability */
export type AttackKind = 'melee' | 'thrown' | 'bow' | 'ability' | string;

/** what actually happened, for `matchesContext` to check an affix against */
export interface AffixContext {
	trigger: AffixTrigger;
	kind?: AttackKind;
}

export interface AffixDef {
	id: string;

	trigger: AffixTrigger;

	/**
	 * restricts this affix to specific attack kinds within its trigger (a "bow only" affix on
	 * a `strike` trigger); omitted, the affix fires for any kind, the same as before this
	 * existed
	 */
	kinds?: readonly AttackKind[];

	/** relative likelihood within its own table; 0 never rolls */
	weight: number;

	/** a curse locks the item (see `EquipmentSlots`' lock option) once identified */
	curse?: boolean;

	/** shown in an item description; `mwg` never reads this itself */
	description?: string;
}

export interface AffixTable {
	entries: readonly AffixDef[];
}

/**
 * Weight-picks one affix from a table - the same "roll whether, then weight-pick which"
 * shape `rollLoot` already is, with a single entry reading as "always this one".
 *
 * @returns null when the table is empty or every entry has weight 0
 */
export function rollAffix(table: AffixTable): AffixDef | null {
	const live = table.entries.filter((entry) => entry.weight > 0);
	if (live.length === 0) return null;
	const index = Random.weighted(live.map((entry) => entry.weight));
	return index === null ? null : live[index];
}

/** the affix an item carries, if any - stored on the item next to its upgrade `level` */
export function affixOf(item: InventoryItem): string | undefined {
	return item.affix;
}

/**
 * Sets an item's affix, replacing any it already had. A curse affix also marks the item
 * `cursed`, so identification and equipment-lock behaviour follow without the game
 * wiring them separately.
 */
export function applyAffix(item: InventoryItem, affix: AffixDef): void {
	const hadAffix = item.affix !== undefined;
	item.affix = affix.id;
	// The curse bit belongs to the affix currently installed.  Replacing a cursed
	// affix with a benign one must not leave the item permanently cursed.
	if (affix.curse) item.cursed = true;
	else if (hadAffix) item.cursed = false;
}

/** removes an item's affix (and its curse mark, if the affix was a curse) */
export function removeAffix(item: InventoryItem): void {
	if (item.affix !== undefined) item.cursed = false;
	delete item.affix;
}

/**
 * Copies `from`'s affix (and curse mark) onto `to`, replacing whatever `to` already had -
 * "transfer" an enchantment or rune between item instances. Clears `to`'s affix when `from`
 * carries none. A true transfer (move rather than copy) is this plus `removeAffix(from)`,
 * left to the caller rather than a second near-identical function.
 */
export function copyAffix(from: InventoryItem, to: InventoryItem): void {
	if (from.affix === undefined) {
		removeAffix(to);
		return;
	}
	to.affix = from.affix;
	to.cursed = from.cursed ?? false;
}

/**
 * Whether `affix` should fire for `context`: the trigger must match, and when the affix
 * restricts itself to specific attack `kinds`, `context.kind` must be one of them. An affix
 * with no `kinds` fires for any attack kind, unchanged from before this existed.
 */
export function matchesContext(affix: AffixDef, context: AffixContext): boolean {
	if (affix.trigger !== context.trigger) return false;
	if (affix.kinds && (context.kind === undefined || !affix.kinds.includes(context.kind))) return false;
	return true;
}
