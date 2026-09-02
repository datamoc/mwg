import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scaledModifiers } from '../src/actors/Scaling.ts';
import { EquipmentSlots, type EquippableItem } from '../src/actors/Equipment.ts';
import { StatBlock } from '../src/actors/StatBlock.ts';

test('level 0 resolves to the base values', () => {
	assert.deepEqual(scaledModifiers(0, [{ stat: 'evasion', op: 'add', base: 1, perLevel: 2 }]), [
		{ stat: 'evasion', op: 'add', value: 1 },
	]);
});

test('each level adds the per-level increment', () => {
	const [modifier] = scaledModifiers(3, [{ stat: 'evasion', op: 'add', base: 1, perLevel: 2 }]);
	assert.equal(modifier.value, 7);
});

test('every entry scales independently, preserving stat and op', () => {
	const modifiers = scaledModifiers(2, [
		{ stat: 'speed', op: 'multiply', base: 1, perLevel: 0.1 },
		{ stat: 'might', op: 'add', base: 0, perLevel: 3 },
	]);
	assert.deepEqual(modifiers, [
		{ stat: 'speed', op: 'multiply', value: 1.2 },
		{ stat: 'might', op: 'add', value: 6 },
	]);
});

test('scaled modifiers apply through a real StatBlock', () => {
	const stats = new StatBlock({ base: { evasion: 5 } });
	const slots = new EquipmentSlots(['finger'], stats);
	slots.equip('finger', { modifiers: scaledModifiers(2, [{ stat: 'evasion', op: 'add', base: 1, perLevel: 2 }]) });
	assert.equal(stats.get('evasion'), 10);
});

interface Ring extends EquippableItem {
	cursed?: boolean;
}

test('a locked slot refuses unequip and reports itself, an unlocked one works', () => {
	const slots = new EquipmentSlots<'finger', Ring>(['finger'], null, { locked: (_slot, item) => item.cursed === true });
	const ring: Ring = { modifiers: [], cursed: false };
	slots.equip('finger', ring);
	assert.equal(slots.isLocked('finger'), false);
	assert.equal(slots.unequip('finger'), ring);

	const cursed: Ring = { modifiers: [], cursed: true };
	slots.equip('finger', cursed);
	assert.equal(slots.isLocked('finger'), true);
	assert.equal(slots.unequip('finger'), undefined, 'stays put');
	assert.equal(slots.get('finger'), cursed);
});

test('a locked slot also refuses a swap, leaving modifiers untouched', () => {
	const stats = new StatBlock({ base: { evasion: 5 } });
	const slots = new EquipmentSlots<'finger', Ring>(['finger'], stats, { locked: (_slot, item) => item.cursed === true });
	const cursed: Ring = { modifiers: [{ stat: 'evasion', op: 'add', value: 1 }], cursed: true };
	slots.equip('finger', cursed);
	assert.equal(slots.equip('finger', { modifiers: [{ stat: 'evasion', op: 'add', value: 99 }] }), undefined);
	assert.equal(slots.get('finger'), cursed);
	assert.equal(stats.get('evasion'), 6);
});

test('without a lock option every slot behaves exactly as before', () => {
	const slots = new EquipmentSlots(['finger'], null);
	assert.equal(slots.isLocked('finger'), false);
	const ring = { modifiers: [] as never[] };
	slots.equip('finger', ring);
	assert.equal(slots.unequip('finger'), ring);
});
