import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { Progression, powerCurve } from '../src/actors/Progression.ts';
import { Charges } from '../src/actors/Charges.ts';
import { SkillPoints } from '../src/actors/SkillPoints.ts';
import { Inventory, type ItemDefinition } from '../src/actors/Inventory.ts';
import { EquipmentSlots, type EquippableItem } from '../src/actors/Equipment.ts';

/** the definition half a game supplies fresh on load, standing in for its own item table */
const ITEMS = new Map<string, ItemDefinition>([
	['potion', { stackable: true, weight: 0.5 }],
	['sword', { stackable: false, weight: 5 }],
	['bag', { stackable: false, weight: 1 }],
	['arrow', { stackable: true, weight: 0.1 }],
]);

test('StatBlock round-trips its base values, and derived stats still resolve', () => {
	const options = {
		base: { strength: 5, vitality: 3 },
		derived: [{ name: 'maxHp', from: (s: Record<string, number>) => s.vitality * 4 }],
	};
	const stats = new StatBlock(options);
	stats.setBase('strength', 9);

	const restored = StatBlock.fromJSON(options, JSON.parse(JSON.stringify(stats)));
	assert.equal(restored.base('strength'), 9);
	assert.equal(restored.get('maxHp'), 12);
});

test('a stat added to the game since the save keeps its definition default', () => {
	const saved = new StatBlock({ base: { strength: 5 } });
	const data = JSON.parse(JSON.stringify(saved));

	//the game has since gained a luck stat the old save knows nothing about
	const restored = StatBlock.fromJSON({ base: { strength: 1, luck: 7 } }, data);
	assert.equal(restored.base('strength'), 5, 'the save wins for what it knew');
	assert.equal(restored.base('luck'), 7, 'and the new stat is not lost');
});

test('StatBlock deliberately saves no modifiers, so restoring cannot double a bonus', () => {
	const stats = new StatBlock({ base: { attack: 10 } });
	const ring = { modifiers: [{ stat: 'attack', op: 'add' as const, value: 5 }] };
	stats.addModifier({ ...ring.modifiers[0], source: ring });
	assert.equal(stats.get('attack'), 15);

	const restored = StatBlock.fromJSON({ base: { attack: 0 } }, JSON.parse(JSON.stringify(stats)));
	assert.equal(restored.get('attack'), 10, 'the modifier is whatever applied it to put back');
});

test('Progression round-trips level and experience', () => {
	const curve = powerCurve(100, 1.5, 20);
	const progression = new Progression(curve);
	progression.addExperience(500);

	const restored = Progression.fromJSON(curve, JSON.parse(JSON.stringify(progression)));
	assert.equal(restored.level, progression.level);
	assert.equal(restored.experience, progression.experience);
	assert.equal(restored.experienceToNext, progression.experienceToNext);
});

test('Charges round-trips both the count and the progress banked towards the next', () => {
	const options = { max: 3, regenRate: 10 };
	const charges = new Charges(options);
	charges.spend(3);
	charges.advance(7);

	const data = JSON.parse(JSON.stringify(charges));
	assert.equal(data.progress, 7, 'the partial wait is part of the save');

	const restored = Charges.fromJSON(options, data);
	assert.equal(restored.current, 0);

	//three more turns finishes the same recharge, rather than restarting the ten-turn wait
	restored.advance(3);
	assert.equal(restored.current, 1);
});

test('reloading cannot be used to skip a recharge', () => {
	const options = { max: 2, regenRate: 10 };
	const charges = new Charges(options);
	charges.spend(2);
	charges.advance(9);

	const restored = Charges.fromJSON(options, JSON.parse(JSON.stringify(charges)));
	restored.advance(1);
	assert.equal(restored.current, 1, 'exactly ten turns total, across the save boundary');
});

test('SkillPoints round-trips the unspent ledger, with ranks living in the StatBlock', () => {
	const stats = new StatBlock({ base: { strength: 1 } });
	const options = { cost: () => 2 };
	const ledger = new SkillPoints(stats, options);
	ledger.grant(10);
	ledger.spend('strength');

	assert.equal(stats.base('strength'), 2);
	assert.equal(ledger.points, 8);

	const restoredStats = StatBlock.fromJSON({ base: { strength: 1 } }, JSON.parse(JSON.stringify(stats)));
	const restored = SkillPoints.fromJSON(restoredStats, options, JSON.parse(JSON.stringify(ledger)));

	assert.equal(restored.points, 8, 'unspent points restored');
	assert.equal(restoredStats.base('strength'), 2, 'and the rank bought with the spent ones');
});

test('Inventory round-trips instance state while taking kind fields from the definitions', () => {
	const inventory = new Inventory({ capacity: 50 });
	inventory.add({ id: 'potion', quantity: 3, stackable: true, weight: 0.5 });
	inventory.add({
		id: 'sword',
		quantity: 1,
		weight: 5,
		level: 2,
		durability: 30,
		maxDurability: 50,
		identified: true,
		affix: 'flaming',
	});

	const restored = Inventory.fromJSON(ITEMS, JSON.parse(JSON.stringify(inventory)));
	const sword = restored.find('sword');

	assert.equal(restored.capacity, 50);
	assert.equal(restored.find('potion')?.quantity, 3);
	assert.equal(sword?.level, 2);
	assert.equal(sword?.durability, 30);
	assert.equal(sword?.maxDurability, 50);
	assert.equal(sword?.identified, true);
	assert.equal(sword?.affix, 'flaming');
	assert.equal(sword?.weight, 5, 'kind fields came from the definitions');
	assert.equal(restored.totalWeight, inventory.totalWeight);
});

test('a rebalanced item weight reaches an old save, rather than the save baking in the old one', () => {
	const inventory = new Inventory();
	inventory.add({ id: 'potion', quantity: 2, stackable: true, weight: 0.5 });
	const data = JSON.parse(JSON.stringify(inventory));

	const rebalanced = new Map<string, ItemDefinition>([['potion', { stackable: true, weight: 9 }]]);
	const restored = Inventory.fromJSON(rebalanced, data);
	assert.equal(restored.totalWeight, 18);
});

test('two instances of one id stay apart across a save', () => {
	const inventory = new Inventory();
	inventory.add({ id: 'sword', quantity: 1, instanceId: 'a', level: 1 });
	inventory.add({ id: 'sword', quantity: 1, instanceId: 'b', level: 3 });

	const restored = Inventory.fromJSON(ITEMS, JSON.parse(JSON.stringify(inventory)));
	assert.equal(restored.items.length, 2);
	assert.equal(restored.find('sword', 'a')?.level, 1);
	assert.equal(restored.find('sword', 'b')?.level, 3);
});

test('a container round-trips its own contents', () => {
	const bag = new Inventory({ capacity: 10 });
	bag.add({ id: 'arrow', quantity: 20, stackable: true, weight: 0.1 });

	const inventory = new Inventory();
	inventory.add({ id: 'bag', quantity: 1, weight: 1, contents: bag });

	const restored = Inventory.fromJSON(ITEMS, JSON.parse(JSON.stringify(inventory)));
	const restoredBag = restored.find('bag')?.contents;
	assert.ok(restoredBag);
	assert.equal(restoredBag.capacity, 10);
	assert.equal(restoredBag.find('arrow')?.quantity, 20);
	assert.equal(restored.totalWeight, inventory.totalWeight);
});

test('an item the game no longer defines is refused loudly rather than restored as a ghost', () => {
	const inventory = new Inventory();
	inventory.add({ id: 'removed-in-v2', quantity: 1 });

	assert.throws(
		() => Inventory.fromJSON(ITEMS, JSON.parse(JSON.stringify(inventory))),
		/no definition for item "removed-in-v2"/,
	);
});

test('EquipmentSlots restores what was worn and reapplies its modifiers to the StatBlock', () => {
	type Item = EquippableItem & { id: string };
	const catalogue: Record<string, Item> = {
		sword: { id: 'sword', modifiers: [{ stat: 'attack', op: 'add', value: 4 }] },
		mail: { id: 'mail', modifiers: [{ stat: 'defense', op: 'add', value: 3 }] },
	};

	const stats = new StatBlock({ base: { attack: 1, defense: 1 } });
	const equipment = new EquipmentSlots<'weapon' | 'armor', Item>(['weapon', 'armor'], stats);
	equipment.equip('weapon', catalogue.sword);
	equipment.equip('armor', catalogue.mail);
	assert.equal(stats.get('attack'), 5);

	const data = JSON.parse(JSON.stringify(equipment.toJSON((item) => item.id)));

	const restoredStats = StatBlock.fromJSON({ base: { attack: 1, defense: 1 } }, JSON.parse(JSON.stringify(stats)));
	const restored = EquipmentSlots.fromJSON<'weapon' | 'armor', Item>(
		{ slots: ['weapon', 'armor'], resolve: (id) => catalogue[id], stats: restoredStats },
		data,
	);

	assert.equal(restored.get('weapon')?.id, 'sword');
	assert.equal(restoredStats.get('attack'), 5, 'the bonus is back, applied exactly once');
	assert.equal(restoredStats.get('defense'), 4);

	//and it really is applied once: taking it off returns to base
	restored.unequip('weapon');
	assert.equal(restoredStats.get('attack'), 1);
});

test('a locked cursed item is restored still worn, not refused', () => {
	type Item = EquippableItem & { id: string; cursed?: boolean };
	const catalogue: Record<string, Item> = {
		ring: { id: 'ring', cursed: true, modifiers: [{ stat: 'luck', op: 'add', value: -2 }] },
	};

	const stats = new StatBlock({ base: { luck: 5 } });
	const restored = EquipmentSlots.fromJSON<'finger', Item>(
		{
			slots: ['finger'],
			resolve: (id) => catalogue[id],
			stats,
			locked: (_slot, item) => item.cursed === true,
		},
		{ worn: [['finger', 'ring']] },
	);

	assert.equal(restored.get('finger')?.id, 'ring');
	assert.equal(restored.isLocked('finger'), true);
	assert.equal(stats.get('luck'), 3, 'the curse is back in force');
	assert.equal(restored.unequip('finger'), undefined, 'and still refuses to come off');
});

test('restoring into an unknown slot is refused', () => {
	type Item = EquippableItem & { id: string };
	assert.throws(
		() =>
			EquipmentSlots.fromJSON<'weapon', Item>(
				{ slots: ['weapon'], resolve: (id) => ({ id }) },
				{ worn: [['hat' as 'weapon', 'cap']] },
			),
		/no such equipment slot/,
	);
});
