import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildEntity,
	buildEntities,
	toEntitySaveState,
	fromEntitySaveState,
	type EntityTemplateRow,
	type EntityTemplateCatalog,
} from '../src/actors/EntityTemplate.ts';
import { parseCSV } from '../src/core/Csv.ts';

const CATALOG: EntityTemplateCatalog = {
	growthCurves: { steep: { maxLevel: 20, experienceFor: (level) => level * level * 10 } },
	affixes: { blazing: { id: 'blazing', trigger: 'strike', weight: 1 } },
	items: { ember_charm: () => ({ id: 'ember_charm', quantity: 1 }) },
};

test('every other column becomes a base stat', () => {
	const entity = buildEntity({ id: 'goblin', attack: 4, speed: 3 }, {});
	assert.equal(entity.stats.get('attack'), 4);
	assert.equal(entity.stats.get('speed'), 3);
});

test('a non-numeric stat column throws, naming the offending row and column', () => {
	assert.throws(
		() => buildEntity({ id: 'goblin', attack: 'lots' } as unknown as EntityTemplateRow, {}),
		/entity template "goblin": stat "attack" must be a number/,
	);
});

test('a named growth curve builds a Progression at the given level', () => {
	const entity = buildEntity({ id: 'fireling', growth: 'steep', level: 5 }, CATALOG);
	assert.equal(entity.progression?.level, 5);
});

test('an unknown growth curve throws by name', () => {
	assert.throws(() => buildEntity({ id: 'fireling', growth: 'missing' }, CATALOG), /unknown growth curve "missing"/);
});

test('no growth column means no progression at all', () => {
	const entity = buildEntity({ id: 'plain' }, CATALOG);
	assert.equal(entity.progression, undefined);
});

test('a starting item is built fresh per entity, from its own factory', () => {
	const a = buildEntity({ id: 'a', startingItem: 'ember_charm' }, CATALOG);
	const b = buildEntity({ id: 'b', startingItem: 'ember_charm' }, CATALOG);
	assert.notEqual(a.item, b.item);
	assert.equal(a.item?.id, 'ember_charm');
});

test('a starting affix applies onto the starting item', () => {
	const entity = buildEntity({ id: 'fireling', startingItem: 'ember_charm', startingAffix: 'blazing' }, CATALOG);
	assert.equal(entity.item?.affix, 'blazing');
});

test('a starting affix with no starting item throws', () => {
	assert.throws(
		() => buildEntity({ id: 'fireling', startingAffix: 'blazing' }, CATALOG),
		/a starting affix needs a starting item to carry it/,
	);
});

test('an unknown starting item or affix throws by name', () => {
	assert.throws(() => buildEntity({ id: 'x', startingItem: 'missing' }, CATALOG), /unknown starting item "missing"/);
	assert.throws(
		() => buildEntity({ id: 'x', startingItem: 'ember_charm', startingAffix: 'missing' }, CATALOG),
		/unknown affix "missing"/,
	);
});

test('a lowHpReaction threshold fires the given callback once crossed', () => {
	const fired: string[] = [];
	const entity = buildEntity({ id: 'fireling', lowHpReaction: 0.25 }, {}, (e) => fired.push(e.id));

	entity.reactions.check({ hp: 80, maxHp: 100 });
	assert.deepEqual(fired, []);

	entity.reactions.check({ hp: 20, maxHp: 100 });
	assert.deepEqual(fired, ['fireling']);
});

test('a lowHpReaction column with no onLowHp callback throws', () => {
	assert.throws(
		() => buildEntity({ id: 'fireling', lowHpReaction: 0.25 }, {}),
		/names a lowHpReaction threshold but no onLowHp callback was given/,
	);
});

test('buildEntities maps over every row, the shape a whole file loads as', () => {
	const rows = parseCSV<EntityTemplateRow>(
		'id,attack,speed,growth,startingAffix,startingItem,lowHpReaction\nfireling,10,8,steep,blazing,ember_charm,0.25',
		{ columns: { attack: 'number', speed: 'number', lowHpReaction: 'number' } },
	);

	const fired: string[] = [];
	const entities = buildEntities(rows, CATALOG, (e) => fired.push(e.id));

	assert.equal(entities.length, 1);
	const [fireling] = entities;
	assert.equal(fireling.stats.get('attack'), 10);
	assert.equal(fireling.progression?.level, 1);
	assert.equal(fireling.item?.affix, 'blazing');

	fireling.reactions.check({ hp: 1, maxHp: 10 });
	assert.deepEqual(fired, ['fireling']);
});

test('toEntitySaveState/fromEntitySaveState round-trip mutated stats, progression and item', () => {
	const row: EntityTemplateRow = { id: 'fireling', attack: 10, growth: 'steep', startingItem: 'ember_charm' };
	const original = buildEntity(row, CATALOG);
	original.stats.setBase('attack', 12);
	original.progression?.addExperience(500);

	const saved = toEntitySaveState(original);
	const restored = fromEntitySaveState(row, CATALOG, saved);

	assert.equal(restored.stats.get('attack'), 12);
	assert.equal(restored.progression?.level, original.progression?.level);
	assert.equal(restored.progression?.experience, original.progression?.experience);
	assert.equal(restored.item?.id, 'ember_charm');
});

test('toEntitySaveState omits progression and item when the entity has neither', () => {
	const saved = toEntitySaveState(buildEntity({ id: 'plain', attack: 1 }, {}));
	assert.equal(saved.progression, undefined);
	assert.equal(saved.item, undefined);
});

test('fromEntitySaveState with progression data but no growth column throws', () => {
	assert.throws(
		() => fromEntitySaveState({ id: 'plain' }, {}, { stats: { base: {} }, progression: { level: 2, experience: 10 } }),
		/save data has progression but the row names no growth curve/,
	);
});
