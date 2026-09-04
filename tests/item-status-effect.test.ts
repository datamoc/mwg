import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyItemStatusEffect } from '../src/actors/ItemStatusEffect.ts';
import type { InventoryItem } from '../src/actors/Inventory.ts';
import { TurnClock } from '../src/world/TurnClock.ts';

function sword(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return { id: 'sword', quantity: 1, ...overrides };
}

test('applies its fields to the item immediately', () => {
	const item = sword();
	const clock = new TurnClock();

	applyItemStatusEffect(item, clock, { fields: { affix: 'poison' }, duration: 3 });

	assert.equal(item.affix, 'poison');
});

test('restores the field to its prior value once the duration elapses', () => {
	const item = sword({ affix: 'flame' });
	const clock = new TurnClock();

	applyItemStatusEffect(item, clock, { fields: { affix: 'poison' }, duration: 2 });

	clock.advance();
	assert.equal(item.affix, 'poison', 'still active with one turn left');

	clock.advance();
	assert.equal(item.affix, 'flame', 'expired, restored to its original affix');
});

test('a field that had no prior value is restored to undefined, not left set', () => {
	const item = sword();
	const clock = new TurnClock();

	applyItemStatusEffect(item, clock, { fields: { cursed: true }, duration: 1 });
	assert.equal(item.cursed, true);

	clock.advance();
	assert.equal(item.cursed, undefined);
});

test('several fields are applied and restored together', () => {
	const item = sword({ level: 1 });
	const clock = new TurnClock();

	applyItemStatusEffect(item, clock, { fields: { level: 5, blessed: true }, duration: 1 });
	assert.equal(item.level, 5);
	assert.equal(item.blessed, true);

	clock.advance();
	assert.equal(item.level, 1);
	assert.equal(item.blessed, undefined);
});

test('tick runs once per turn while the effect is active', () => {
	const item = sword();
	const clock = new TurnClock();
	let ticks = 0;

	applyItemStatusEffect(item, clock, { fields: { affix: 'poison' }, duration: 3, tick: () => ticks++ });

	clock.advance();
	clock.advance();
	clock.advance();

	assert.equal(ticks, 3);
});

test('cancel restores the fields immediately and unregisters the clock entry', () => {
	const item = sword({ affix: 'flame' });
	const clock = new TurnClock();

	const handle = applyItemStatusEffect(item, clock, { fields: { affix: 'poison' }, duration: 10 });
	handle.cancel();
	assert.equal(item.affix, 'flame');

	//advancing past where it would have expired ticks nothing further
	clock.advance(10);
	assert.equal(item.affix, 'flame');
});

test('two independent effects on the same item restore correctly regardless of order', () => {
	const item = sword({ affix: 'flame', level: 1 });
	const clock = new TurnClock();

	applyItemStatusEffect(item, clock, { fields: { affix: 'poison' }, duration: 1 });
	applyItemStatusEffect(item, clock, { fields: { level: 9 }, duration: 5 });

	assert.equal(item.affix, 'poison');
	assert.equal(item.level, 9);

	clock.advance();
	assert.equal(item.affix, 'flame', 'the shorter effect expired and restored its own field');
	assert.equal(item.level, 9, 'the other field is untouched');
});
