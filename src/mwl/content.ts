import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';
import { coerceTableValue, parseTableColumns, type MwlTableColumn } from './schema.ts';
import {
	booleanAttribute,
	enumAttribute,
	flattenNodes,
	integerAttribute,
	numberAttribute,
	requiredAttribute,
} from './utils.ts';

const required = requiredAttribute;
const num = numberAttribute;
const integer = integerAttribute;
const bool = booleanAttribute;
const enumValue = enumAttribute;

export interface MwlEffectDefinition {
	readonly applyTo: string;
	readonly operation?: string;
	readonly value?: string;
	readonly range?: string;
}
export interface MwlTableDefinition {
	readonly id: string;
	readonly columns: readonly MwlTableColumn[];
	readonly rows: readonly Readonly<Record<string, unknown>>[];
}
/** One scenario in a campaign's chain: where it goes when it is won. */
export interface MwlScenarioLink {
	readonly id: string;

	/** the scenario that follows, `next_scenario`; absent means this one ends the campaign */
	readonly nextScenario?: string;
}

export interface MwlCampaignDefinition {
	readonly id: string;
	readonly name?: string;
	readonly title?: string;
	readonly description?: string;
	readonly startScene?: string;

	/** the scenario the campaign opens on, `first_scenario`; the first declared one when unset */
	readonly firstScenario?: string;

	/** the campaign's scenarios in declared order, each with the one that follows it */
	readonly scenarios: readonly MwlScenarioLink[];
}
export interface MwlItemDefinition {
	readonly id: string;
	readonly name: string;
	readonly slot?: string;
	readonly stackable?: boolean;
	readonly weight?: number;
	readonly effects: readonly MwlEffectDefinition[];
}
export interface MwlMonsterDefinition {
	readonly id: string;
	readonly name?: string;
	readonly hp: number;
	readonly accuracy?: number;
	readonly evasion?: number;
	readonly damage?: readonly [number, number];
	readonly armor?: readonly [number, number];
	readonly experience?: number;
	readonly maxLevel?: number;
	readonly image?: string;
	readonly types?: readonly string[];
	readonly baseStats?: Readonly<Record<string, number>>;
}
export interface MwlMoveDefinition {
	readonly id: string;
	readonly type: string;
	readonly target: string;
	readonly power?: number;
	readonly cost?: number;
}
export interface MwlTypeMatchupDefinition {
	readonly attacker: string;
	readonly defender: string;
	readonly multiplier: number;
}
export interface MwlEvolutionDefinition {
	readonly from: string;
	readonly into: string;
	readonly level: number;
}
export interface MwlStatusDefinition {
	readonly id: string;
	readonly name?: string;
	readonly duration?: number;
	readonly tick?: string;
	readonly modifiers?: string;
}
export interface MwlLootDefinition {
	readonly item: string;
	readonly chance?: number;
	readonly quantity?: number;
	readonly weight?: number;
}
export interface MwlTurnClockDefinition {
	readonly id: string;
	readonly tick?: number;
	readonly hunger?: number;
}
export interface MwlBehaviorDefinition {
	readonly id: string;
	readonly when?: string;
	readonly action?: string;
	readonly hook?: string;
}
export interface MwlAiDefinition {
	readonly id: string;
	readonly strategy?: string;
	readonly target?: string;
	readonly difficulty?: number;
	readonly scope?: 'actor' | 'controller';
	readonly provider?: 'javascript' | 'lua';
	readonly algorithm?: 'rules' | 'alpha_beta';
	readonly depth?: number;
	readonly maxNodes?: number;
	readonly player?: string;
	readonly moves?: string;
	readonly apply?: string;
	readonly terminal?: string;
	readonly evaluate?: string;
	readonly behaviors: readonly MwlBehaviorDefinition[];
}
export interface MwlContentCatalog {
	readonly campaigns: readonly MwlCampaignDefinition[];
	readonly items: readonly MwlItemDefinition[];
	readonly monsters: readonly MwlMonsterDefinition[];
	readonly statuses: readonly MwlStatusDefinition[];
	readonly loot: readonly MwlLootDefinition[];
	readonly turnClocks: readonly MwlTurnClockDefinition[];
	readonly ai: readonly MwlAiDefinition[];
	readonly moves: readonly MwlMoveDefinition[];
	readonly typeMatchups: readonly MwlTypeMatchupDefinition[];
	readonly evolutions: readonly MwlEvolutionDefinition[];
	readonly tables: readonly MwlTableDefinition[];
}

/**
 * The reusable content a game can read: campaigns, items, monsters, statuses, loot, turn clocks,
 * AI profiles, moves, type matchups, evolutions and tables, all as plain data.
 *
 * @example
 * ```ts
 * import { compile, contentCatalog } from '@datamoc/mw_games/mwl';
 *
 * console.log(contentCatalog(compile('[game]\nschema=0.1\n[/game]')).campaigns); // []
 * ```
 */
export function contentCatalog(game: MwlCompiledGame): MwlContentCatalog {
	const nodes = flattenNodes(game.roots);
	return {
		campaigns: nodes
			.filter((node) => node.tag === 'campaign')
			.map((node) => ({
				id: required(node, 'id'),
				name: node.attributes.name,
				title: node.attributes.title,
				description: node.attributes.description,
				startScene: node.attributes.start_scene,
				firstScenario: node.attributes.first_scenario,
				scenarios: node.children
					.filter((child) => child.tag === 'scenario')
					.map((child) => ({
						id: required(child, 'id'),
						//an empty `next_scenario` is the same as none: the campaign ends there
						nextScenario: child.attributes.next_scenario || undefined,
					})),
			})),
		items: nodes
			.filter((node) => node.tag === 'item')
			.map((node) => ({
				id: required(node, 'id'),
				name: required(node, 'name'),
				slot: node.attributes.slot,
				stackable: bool(node, 'stackable'),
				weight: num(node, 'weight'),
				effects: node.children.filter((child) => child.tag === 'effect').map(effect),
			})),
		monsters: nodes
			.filter((node) => node.tag === 'monster')
			.map((node) => ({
				id: required(node, 'id'),
				name: node.attributes.name,
				hp: integer(node, 'hp', 1)!,
				accuracy: num(node, 'accuracy'),
				evasion: num(node, 'evasion'),
				damage: pair(node, 'damage_min', 'damage_max'),
				armor: pair(node, 'armor_min', 'armor_max'),
				experience: integer(node, 'experience'),
				maxLevel: integer(node, 'max_level'),
				image: node.attributes.image,
				types: node.attributes.types
					?.split(',')
					.map((type) => type.trim())
					.filter(Boolean),
				baseStats: ['attack', 'defense', 'speed', 'hp'].reduce<Record<string, number>>((stats, name) => {
					const value = num(node, name);
					if (value !== undefined) stats[name === 'hp' ? 'maxHp' : name] = value;
					return stats;
				}, {}),
			})),
		statuses: nodes
			.filter((node) => node.tag === 'status')
			.map((node) => ({
				id: required(node, 'id'),
				name: node.attributes.name,
				duration: integer(node, 'duration'),
				tick: node.attributes.tick,
				modifiers: node.attributes.modifiers,
			})),
		loot: nodes
			.filter((node) => node.tag === 'loot')
			.map((node) => ({
				item: required(node, 'item'),
				chance: num(node, 'chance'),
				quantity: integer(node, 'quantity'),
				weight: num(node, 'weight'),
			})),
		turnClocks: nodes
			.filter((node) => node.tag === 'turn_clock')
			.map((node) => ({ id: required(node, 'id'), tick: num(node, 'tick'), hunger: num(node, 'hunger') })),
		ai: nodes
			.filter((node) => node.tag === 'ai')
			.map((node) => ({
				id: required(node, 'id'),
				strategy: node.attributes.strategy,
				target: node.attributes.target,
				difficulty: num(node, 'difficulty'),
				scope: enumValue(node.attributes.scope, ['actor', 'controller']),
				provider: enumValue(node.attributes.provider, ['javascript', 'lua']),
				algorithm: enumValue(node.attributes.algorithm, ['rules', 'alpha_beta']),
				depth: integer(node, 'depth'),
				maxNodes: integer(node, 'max_nodes'),
				player: node.attributes.player,
				moves: node.attributes.moves,
				apply: node.attributes.apply,
				terminal: node.attributes.terminal,
				evaluate: node.attributes.evaluate,
				behaviors: node.children
					.filter((child) => child.tag === 'behavior')
					.map((child) => ({
						id: required(child, 'id'),
						when: child.attributes.when,
						action: child.attributes.action,
						hook: child.attributes.hook,
					})),
			})),
		moves: nodes
			.filter((node) => node.tag === 'battle_move')
			.map((node) => ({
				id: required(node, 'id'),
				type: required(node, 'type'),
				target: required(node, 'target'),
				power: num(node, 'power'),
				cost: num(node, 'cost'),
			})),
		typeMatchups: nodes
			.filter((node) => node.tag === 'type_matchup')
			.map((node) => ({
				attacker: required(node, 'attacker'),
				defender: required(node, 'defender'),
				multiplier: num(node, 'multiplier') ?? 1,
			})),
		evolutions: nodes
			.filter((node) => node.tag === 'evolution')
			.map((node) => ({
				from: required(node, 'from'),
				into: required(node, 'into'),
				level: integer(node, 'level', 1)!,
			})),
		tables: nodes.filter((node) => node.tag === 'table').map(table),
	};
}

function table(node: MwlCompiledNode): MwlTableDefinition {
	const columns = parseTableColumns(required(node, 'columns'));
	return {
		id: required(node, 'id'),
		columns,
		rows: node.children
			.filter((child) => child.tag === 'row')
			.map((row) => {
				const values: Record<string, unknown> = {};
				for (const column of columns) {
					const raw = row.attributes[column.name];
					if (raw !== undefined)
						values[column.name] = coerceTableValue(
							raw,
							column.type,
							column.name,
							node.attributes.list_delimiter,
							node.attributes.map_delimiter,
						);
				}
				return values;
			}),
	};
}

function effect(node: MwlCompiledNode): MwlEffectDefinition {
	const operation = ['add', 'sub', 'multiply', 'divide', 'set', 'increase', 'increase_total', 'increase_damage'].find(
		(key) => node.attributes[key] !== undefined,
	);
	return {
		applyTo: required(node, 'apply_to'),
		operation,
		value: operation ? node.attributes[operation] : undefined,
		range: node.attributes.range,
	};
}
function pair(node: MwlCompiledNode, min: string, max: string): readonly [number, number] | undefined {
	const a = num(node, min);
	const b = num(node, max);
	return a === undefined || b === undefined ? undefined : [a, b];
}
