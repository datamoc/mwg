import type { EquipmentSlots } from '../actors/Equipment.ts';
import type { InventoryItem, ItemDefinition } from '../actors/Inventory.ts';
import { composeModifiers, type Modifier } from '../actors/StatBlock.ts';
import type { MwlEffectDefinition, MwlItemDefinition } from './content.ts';
import { evaluateExpression, type MwlExpressionContext } from './expression.ts';

export interface MwlActorItem extends ItemDefinition {
	readonly id: string;
	readonly slot?: string;
	readonly modifiers?: Modifier[];
}

/** Converts MWL's data shape into the actor layer without importing game rules. */
export function itemDefinition(item: MwlItemDefinition, context: MwlExpressionContext = {}): MwlActorItem {
	return {
		id: item.id,
		stackable: item.stackable,
		weight: item.weight,
		slot: item.slot,
		modifiers: item.effects.map((effect) => effectToModifier(effect, context)),
	};
}

export function inventoryItem(item: MwlActorItem, quantity = 1): InventoryItem {
	return { id: item.id, quantity, stackable: item.stackable, weight: item.weight };
}

/** Resolve a declarative MWL effect list using the same rule as StatBlock. */
export function composeEffects(
	base: number,
	effects: readonly MwlEffectDefinition[],
	context: MwlExpressionContext = {},
): number {
	return composeModifiers(
		base,
		effects.map((effect) => effectToModifier(effect, context)),
	);
}

export function effectToModifier(effect: MwlEffectDefinition, context: MwlExpressionContext = {}): Modifier {
	const operation = effect.operation;
	if (
		operation !== 'add' &&
		operation !== 'sub' &&
		operation !== 'multiply' &&
		operation !== 'divide' &&
		operation !== 'set'
	)
		throw new Error(`MWL effect operation "${operation ?? ''}" is not a StatBlock modifier`);
	const raw = effect.value;
	if (raw === undefined) throw new Error('MWL effect has no value');
	const value = evaluateExpression(raw, context);
	return {
		stat: effect.applyTo,
		op: operation === 'sub' ? 'add' : operation === 'divide' ? 'multiply' : operation,
		value: operation === 'sub' ? -value : operation === 'divide' ? 1 / value : value,
	};
}

export type MwlEquipment<Slot extends string> = EquipmentSlots<Slot, MwlActorItem>;
