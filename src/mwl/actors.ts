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

/**
 * Converts MWL's data shape into the actor layer without importing game rules.
 *
 * @example
 * ```ts
 * import { itemDefinition, type MwlItemDefinition } from '@datamoc/mw_games/mwl';
 *
 * declare const item: MwlItemDefinition;
 * const actorItem = itemDefinition(item, { level: 2 });
 * console.log(actorItem.id);
 * ```
 */
export function itemDefinition(item: MwlItemDefinition, context: MwlExpressionContext = {}): MwlActorItem {
	return {
		id: item.id,
		stackable: item.stackable,
		weight: item.weight,
		slot: item.slot,
		modifiers: item.effects.map((effect) => effectToModifier(effect, context)),
	};
}

/**
 * Wraps a converted item as an inventory stack of `quantity`.
 *
 * @example
 * ```ts
 * import { inventoryItem, itemDefinition, type MwlItemDefinition } from '@datamoc/mw_games/mwl';
 *
 * declare const item: MwlItemDefinition;
 * const stack = inventoryItem(itemDefinition(item), 3);
 * console.log(stack.quantity); // 3
 * ```
 */
export function inventoryItem(item: MwlActorItem, quantity = 1): InventoryItem {
	return { id: item.id, quantity, stackable: item.stackable, weight: item.weight };
}

/**
 * Resolve a declarative MWL effect list using the same rule as StatBlock.
 *
 * @example
 * ```ts
 * import { composeEffects, type MwlEffectDefinition } from '@datamoc/mw_games/mwl';
 *
 * declare const effects: readonly MwlEffectDefinition[];
 * console.log(composeEffects(10, effects, { level: 2 }));
 * ```
 */
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

/**
 * Converts one MWL effect into a `StatBlock` modifier, resolving its value expression.
 *
 * @example
 * ```ts
 * import { effectToModifier, type MwlEffectDefinition } from '@datamoc/mw_games/mwl';
 *
 * declare const effect: MwlEffectDefinition;
 * console.log(effectToModifier(effect, { level: 2 }));
 * ```
 */
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
