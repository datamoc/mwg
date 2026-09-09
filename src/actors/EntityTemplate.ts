import { StatBlock, type Stats } from './StatBlock.ts';
import { Progression, type GrowthCurve } from './Progression.ts';
import { applyAffix, type AffixDef } from './Affix.ts';
import type { InventoryItem } from './Inventory.ts';
import { ReactionTable } from '../core/Reactions.ts';

/**
 * One row of a hero or monster "file" - a `core.parseCSV` result, typically - turned into a
 * fully wired entity: a `StatBlock` of base stats, an optional `Progression` against a named
 * growth curve, an optional starting item carrying a named starting affix, and a
 * `ReactionTable` already holding a low-HP rule if the row names one. The single call a game
 * makes once per row, in place of the per-field glue code every one of those systems would
 * otherwise need written out by hand.
 *
 * A handful of column names are reserved (`id`, `growth`, `level`, `startingAffix`,
 * `startingItem`, `lowHpReaction`); every other column in the row becomes a base stat, so a
 * game's own stat names (`attack`, `speed`, `armor`, whatever it calls them) need no
 * declaring here. What each named growth curve, affix, and item actually *is* stays the
 * game's own `EntityTemplateCatalog` - `mwg` resolves the reference, never invents the
 * content behind it, the same boundary `AffixDef.id` already draws.
 *
 * Deliberately narrow: one low-HP threshold per row, not an arbitrary list of reactions -
 * add a second column and a second `ReactionRule` in a game's own code the moment a second
 * one is actually needed, rather than a general reaction-list column format speculatively
 * built ahead of that need.
 *
 * @example
 * ```ts
 * import { parseCSV } from '@datamoc/mw_games/core';
 * import { buildEntities, type EntityTemplateRow } from '@datamoc/mw_games/actors';
 *
 * const csv = `id,attack,speed,growth,startingAffix,startingItem,lowHpReaction
 * fireling,10,8,steep,blazing,ember_charm,0.25`;
 *
 * const rows = parseCSV<EntityTemplateRow>(csv, {
 *   columns: { attack: 'number', speed: 'number', lowHpReaction: 'number' },
 * });
 *
 * const monsters = buildEntities(rows, {
 *   growthCurves: { steep: { maxLevel: 20, experienceFor: (level) => level * level * 10 } },
 *   affixes: { blazing: { id: 'blazing', trigger: 'strike', weight: 1 } },
 *   items: { ember_charm: () => ({ id: 'ember_charm', quantity: 1 }) },
 * }, (entity) => console.log(`${entity.id} panics at low hp`));
 *
 * monsters[0].reactions.check({ hp: 2, maxHp: 10 }); // fires the callback above
 * ```
 */

export interface EntityTemplateRow {
	id: string;
	growth?: string;
	level?: number;
	startingAffix?: string;
	startingItem?: string;
	lowHpReaction?: number;

	/** any other column is a base stat by that name; must be a number */
	[stat: string]: unknown;
}

/** what each row's named references actually mean - entirely the game's own content */
export interface EntityTemplateCatalog {
	growthCurves?: Record<string, GrowthCurve>;
	affixes?: Record<string, AffixDef>;

	/** a factory, not a shared instance, so every built entity gets its own item object */
	items?: Record<string, () => InventoryItem>;
}

export interface BuiltEntity {
	id: string;
	stats: StatBlock;
	progression?: Progression;
	item?: InventoryItem;
	reactions: ReactionTable<{ hp: number; maxHp: number }>;
}

const RESERVED_KEYS = new Set(['id', 'growth', 'level', 'startingAffix', 'startingItem', 'lowHpReaction']);

/**
 * @example
 * ```ts
 * import { buildEntity } from '@datamoc/mw_games/actors';
 *
 * const goblin = buildEntity({ id: 'goblin', attack: 4, speed: 3 }, {});
 * console.log(goblin.stats.get('attack')); // 4
 * ```
 */
export function buildEntity(row: EntityTemplateRow, catalog: EntityTemplateCatalog = {}, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity {
	const stats = new StatBlock({ base: statsFrom(row) });

	let progression: Progression | undefined;
	if (row.growth !== undefined) {
		const curve = catalog.growthCurves?.[row.growth];
		if (!curve) throw new Error(`entity template "${row.id}": unknown growth curve "${row.growth}"`);
		progression = new Progression(curve, { level: row.level ?? 1 });
	}

	let item: InventoryItem | undefined;
	if (row.startingItem !== undefined) {
		const factory = catalog.items?.[row.startingItem];
		if (!factory) throw new Error(`entity template "${row.id}": unknown starting item "${row.startingItem}"`);
		item = factory();
		if (row.startingAffix !== undefined) {
			const affix = catalog.affixes?.[row.startingAffix];
			if (!affix) throw new Error(`entity template "${row.id}": unknown affix "${row.startingAffix}"`);
			applyAffix(item, affix);
		}
	} else if (row.startingAffix !== undefined) {
		throw new Error(`entity template "${row.id}": a starting affix needs a starting item to carry it`);
	}

	const reactions = new ReactionTable<{ hp: number; maxHp: number }>();
	const entity: BuiltEntity = { id: row.id, stats, progression, item, reactions };

	if (row.lowHpReaction !== undefined) {
		if (!onLowHp) throw new Error(`entity template "${row.id}": names a lowHpReaction threshold but no onLowHp callback was given`);
		const threshold = row.lowHpReaction;
		reactions.add({ id: 'low-hp', when: (s) => s.hp / s.maxHp <= threshold, action: () => onLowHp(entity) });
	}

	return entity;
}

/** `buildEntity` over every row - the usual shape once a whole file's worth loads at once */
export function buildEntities(rows: readonly EntityTemplateRow[], catalog: EntityTemplateCatalog = {}, onLowHp?: (entity: BuiltEntity) => void): BuiltEntity[] {
	return rows.map((row) => buildEntity(row, catalog, onLowHp));
}

function statsFrom(row: EntityTemplateRow): Stats {
	const stats: Stats = {};
	for (const [key, value] of Object.entries(row)) {
		if (RESERVED_KEYS.has(key)) continue;
		if (typeof value !== 'number') throw new Error(`entity template "${row.id}": stat "${key}" must be a number, got ${typeof value}`);
		stats[key] = value;
	}
	return stats;
}
