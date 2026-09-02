import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { InventoryItem } from '../src/actors/Inventory.ts';
import { identify, enchant, damageItem, repairItem } from '../src/actors/ItemState.ts';

test('identify reveals an item', () => {
	const item: InventoryItem = { id: 'potion', quantity: 1, identified: false };
	identify(item);
	assert.equal(item.identified, true);
});

test('enchant raises an item with no level yet to 1, and returns the new level', () => {
	const item: InventoryItem = { id: 'sword', quantity: 1 };
	assert.equal(enchant(item, 1), 1);
	assert.equal(item.level, 1);
});

test('enchant accumulates, and a negative delta lowers it (a curse, a degrading item)', () => {
	const item: InventoryItem = { id: 'sword', quantity: 1, level: 2 };
	enchant(item, 1);
	assert.equal(item.level, 3);
	enchant(item, -5);
	assert.equal(item.level, -2);
});

test('damageItem is a no-op for an item with no maxDurability set', () => {
	const item: InventoryItem = { id: 'rock', quantity: 1 };
	assert.equal(damageItem(item, 100), false);
	assert.equal(item.durability, undefined);
});

test('damageItem wears an item down, starting from maxDurability if unset', () => {
	const item: InventoryItem = { id: 'blade', quantity: 1, maxDurability: 10 };
	assert.equal(damageItem(item, 4), false);
	assert.equal(item.durability, 6);
});

test('damageItem reports true once durability reaches zero, and never goes negative', () => {
	const item: InventoryItem = { id: 'blade', quantity: 1, maxDurability: 10, durability: 3 };
	assert.equal(damageItem(item, 5), true);
	assert.equal(item.durability, 0);
});

test('repairItem restores durability, capped at maxDurability', () => {
	const item: InventoryItem = { id: 'blade', quantity: 1, maxDurability: 10, durability: 3 };
	repairItem(item, 4);
	assert.equal(item.durability, 7);
	repairItem(item, 100);
	assert.equal(item.durability, 10);
});

test('repairItem is a no-op for an item with no maxDurability set', () => {
	const item: InventoryItem = { id: 'rock', quantity: 1 };
	repairItem(item, 5);
	assert.equal(item.durability, undefined);
});
