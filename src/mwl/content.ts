import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';

export interface MwlEffectDefinition {
	readonly applyTo: string;
	readonly operation?: string;
	readonly value?: string;
	readonly range?: string;
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
export interface MwlContentCatalog {
	readonly items: readonly MwlItemDefinition[];
	readonly monsters: readonly MwlMonsterDefinition[];
	readonly statuses: readonly MwlStatusDefinition[];
	readonly loot: readonly MwlLootDefinition[];
	readonly turnClocks: readonly MwlTurnClockDefinition[];
}

export function contentCatalog(game: MwlCompiledGame): MwlContentCatalog {
	const nodes = flatten(game.roots);
	return {
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
function flatten(roots: readonly MwlCompiledNode[]): MwlCompiledNode[] {
	const out: MwlCompiledNode[] = [];
	const visit = (node: MwlCompiledNode): void => {
		out.push(node);
		node.children.forEach(visit);
	};
	roots.forEach(visit);
	return out;
}
function required(node: MwlCompiledNode, name: string): string {
	const value = node.attributes[name];
	if (!value) throw new Error(`MWL ${node.tag} is missing ${name}`);
	return value;
}
function num(node: MwlCompiledNode, name: string): number | undefined {
	const value = node.attributes[name];
	if (value === undefined) return undefined;
	const result = Number(value);
	return Number.isFinite(result) ? result : undefined;
}
function integer(node: MwlCompiledNode, name: string, fallback?: number): number | undefined {
	const value = node.attributes[name];
	if (value === undefined) return fallback;
	const result = Number.parseInt(value, 10);
	return Number.isFinite(result) ? result : fallback;
}
function pair(node: MwlCompiledNode, min: string, max: string): readonly [number, number] | undefined {
	const a = num(node, min);
	const b = num(node, max);
	return a === undefined || b === undefined ? undefined : [a, b];
}
function bool(node: MwlCompiledNode, name: string): boolean | undefined {
	const value = node.attributes[name];
	return value === undefined ? undefined : value === 'true' || value === 'yes';
}
