import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock, type Modifier } from '../src/actors/StatBlock.ts';
import { Progression, powerCurve } from '../src/actors/Progression.ts';
import { skillCheck } from '../src/actors/skillCheck.ts';
import { EquipmentSlots, type EquippableItem } from '../src/actors/Equipment.ts';
import { Inventory } from '../src/actors/Inventory.ts';

test('a stat with no modifiers returns its base value', () => {
	const stats = new StatBlock({ base: { strength: 10 } });
	assert.equal(stats.get('strength'), 10);
	assert.equal(stats.base('strength'), 10);
});

test('derived stats read the base attributes', () => {
	const stats = new StatBlock({
		base: { vitality: 5 },
		derived: [{ name: 'maxHp', from: (s) => s.vitality * 10 }],
	});
	assert.equal(stats.get('maxHp'), 50);
});

test('add modifiers sum, then multiply, then set - in that fixed order', () => {
	const stats = new StatBlock({ base: { power: 10 } });
	stats.addModifier({ stat: 'power', op: 'add', value: 5 }); // 15
	stats.addModifier({ stat: 'power', op: 'multiply', value: 2 }); // 30
	assert.equal(stats.get('power'), 30);

	stats.addModifier({ stat: 'power', op: 'set', value: 0 }); // a drain always wins
	assert.equal(stats.get('power'), 0);
});

test('a derived stat sees modified base values, then applies its own modifiers', () => {
	const stats = new StatBlock({
		base: { strength: 10 },
		derived: [{ name: 'carryWeight', from: (s) => s.strength * 2 }],
	});
	stats.addModifier({ stat: 'strength', op: 'add', value: 5 }); // strength -> 15
	assert.equal(stats.get('carryWeight'), 30);

	stats.addModifier({ stat: 'carryWeight', op: 'add', value: 10 });
	assert.equal(stats.get('carryWeight'), 40);
});

test('removing a modifier restores the previous value', () => {
	const stats = new StatBlock({ base: { power: 10 } });
	const ring: Modifier = { stat: 'power', op: 'add', value: 5 };
	stats.addModifier(ring);
	assert.equal(stats.get('power'), 15);

	stats.removeModifier(ring);
	assert.equal(stats.get('power'), 10);
});

test('removeModifiersFrom clears every modifier tagged with that source', () => {
	const stats = new StatBlock({ base: { power: 10 } });
	const sword = {};
	stats.addModifier({ stat: 'power', op: 'add', value: 3, source: sword });
	stats.addModifier({ stat: 'power', op: 'add', value: 2, source: sword });
	stats.addModifier({ stat: 'power', op: 'add', value: 1, source: 'other' });

	stats.removeModifiersFrom(sword);
	assert.equal(stats.get('power'), 11);
});

test('powerCurve levels 1 with zero experience', () => {
	const curve = powerCurve(10, 2, 20);
	assert.equal(curve.experienceFor(1), 0);
	assert.ok(curve.experienceFor(2) > 0);
});

test('addExperience gains exactly the levels earned, and stops at the cap', () => {
	const curve = powerCurve(10, 1, 3); // level 2 at 10xp, level 3 at 20xp
	const progression = new Progression(curve);

	const gained = progression.addExperience(15);
	assert.equal(gained, 1);
	assert.equal(progression.level, 2);

	progression.addExperience(1000);
	assert.equal(progression.level, 3);
	assert.equal(progression.experienceToNext, null);
});

test('skillCheck compares value plus a roll against the difficulty', () => {
	assert.equal(skillCheck(10, 15, () => 5), true); // 10 + 5 = 15, meets it
	assert.equal(skillCheck(10, 16, () => 5), false);
});

test('equipping a slot applies its modifiers, unequipping removes them', () => {
	interface Item extends EquippableItem {
		name: string;
	}

	const stats = new StatBlock({ base: { power: 10 } });
	const slots = new EquipmentSlots<'weapon' | 'ring', Item>(['weapon', 'ring'], stats);

	const sword: Item = { name: 'sword', modifiers: [{ stat: 'power', op: 'add', value: 5 }] };
	slots.equip('weapon', sword);
	assert.equal(stats.get('power'), 15);
	assert.equal(slots.get('weapon'), sword);

	slots.unequip('weapon');
	assert.equal(stats.get('power'), 10);
	assert.equal(slots.get('weapon'), undefined);
});

test('equipping over an occupied slot swaps the modifiers, and returns the old item', () => {
	interface Item extends EquippableItem {
		name: string;
	}

	const stats = new StatBlock({ base: { power: 10 } });
	const slots = new EquipmentSlots<'weapon', Item>(['weapon'], stats);

	const dagger: Item = { name: 'dagger', modifiers: [{ stat: 'power', op: 'add', value: 2 }] };
	const sword: Item = { name: 'sword', modifiers: [{ stat: 'power', op: 'add', value: 5 }] };

	slots.equip('weapon', dagger);
	const previous = slots.equip('weapon', sword);

	assert.equal(previous, dagger);
	assert.equal(stats.get('power'), 15, 'only the sword modifier should still apply');
});

test('equipping an unknown slot throws', () => {
	const slots = new EquipmentSlots<'weapon', EquippableItem>(['weapon']);
	assert.throws(() => slots.equip('ring' as 'weapon', {}));
});

test('stackable items merge into one slot', () => {
	const bag = new Inventory();
	bag.add({ id: 'arrow', quantity: 10, stackable: true, weight: 0.1 });
	bag.add({ id: 'arrow', quantity: 5, stackable: true, weight: 0.1 });

	assert.equal(bag.items.length, 1);
	assert.equal(bag.find('arrow')?.quantity, 15);
});

test('non-stackable items each get their own slot', () => {
	const bag = new Inventory();
	bag.add({ id: 'sword', quantity: 1 });
	bag.add({ id: 'sword', quantity: 1 });

	assert.equal(bag.items.length, 2);
});

test('adding past capacity is refused, and nothing is added', () => {
	const bag = new Inventory({ capacity: 10 });
	assert.equal(bag.add({ id: 'rock', quantity: 1, weight: 8 }), true);
	assert.equal(bag.add({ id: 'rock', quantity: 1, weight: 8 }), false);
	assert.equal(bag.totalWeight, 8);
});

test('a container adds its contents weight on top of its own', () => {
	const pouch = new Inventory();
	pouch.add({ id: 'gem', quantity: 3, weight: 1 });

	const bag = new Inventory();
	bag.add({ id: 'pouch', quantity: 1, weight: 0.5, contents: pouch });

	assert.equal(bag.totalWeight, 3.5);
});

test('removing part of a stack leaves the rest; removing it all clears the slot', () => {
	const bag = new Inventory();
	bag.add({ id: 'arrow', quantity: 10, stackable: true });

	bag.remove('arrow', 4);
	assert.equal(bag.find('arrow')?.quantity, 6);

	bag.remove('arrow');
	assert.equal(bag.find('arrow'), undefined);
});
