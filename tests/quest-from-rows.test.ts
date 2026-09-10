import { test } from 'node:test';
import assert from 'node:assert/strict';

import { questsFromRows, QuestLog, type QuestStageRow } from '../src/rpg/Quest.ts';
import { parseCSV } from '../src/core/Csv.ts';

test('rows sharing a questId become one quest, stages in row order', () => {
	const quests = questsFromRows([
		{ questId: 'rats', counterVariable: 'ratsKilled', counterTarget: 5, description: 'Kill 5 rats' },
		{ questId: 'rats', description: 'Report back to the innkeeper' },
	]);

	assert.equal(quests.length, 1);
	assert.deepEqual(quests[0], {
		id: 'rats',
		stages: [
			{ counter: { variable: 'ratsKilled', target: 5 }, description: 'Kill 5 rats' },
			{ description: 'Report back to the innkeeper' },
		],
	});
});

test('quests come back in first-seen order across the table', () => {
	const quests = questsFromRows([
		{ questId: 'b', description: 'first' },
		{ questId: 'a', description: 'first' },
		{ questId: 'b', description: 'second' },
	]);
	assert.deepEqual(
		quests.map((q) => q.id),
		['b', 'a'],
	);
});

test("requires is read off a quest's first row only", () => {
	const quests = questsFromRows([
		{ questId: 'rats', requires: ['intro'], description: 'first' },
		{ questId: 'rats', requires: ['ignored'], description: 'second' },
	]);
	assert.deepEqual(quests[0].requires, ['intro']);
});

test('a condition switch row builds a switch condition stage', () => {
	const [quest] = questsFromRows([{ questId: 'q', conditionSwitch: 'metElder', conditionEquals: true }]);
	assert.deepEqual(quest.stages[0].condition, { switch: 'metElder', equals: true });
});

test('a condition variable row builds a variable condition stage', () => {
	const [quest] = questsFromRows([{ questId: 'q', conditionVariable: 'rep', conditionAtLeast: 10 }]);
	assert.deepEqual(quest.stages[0].condition, { variable: 'rep', atLeast: 10 });
});

test('naming both a condition switch and a condition variable throws', () => {
	assert.throws(
		() => questsFromRows([{ questId: 'q', conditionSwitch: 'a', conditionVariable: 'b' }]),
		/cannot name both a condition switch and a condition variable/,
	);
});

test('conditionSwitch without conditionEquals throws', () => {
	assert.throws(
		() => questsFromRows([{ questId: 'q', conditionSwitch: 'a' }]),
		/conditionSwitch needs a conditionEquals/,
	);
});

test('counterVariable without counterTarget throws', () => {
	assert.throws(
		() => questsFromRows([{ questId: 'q', counterVariable: 'rep' }]),
		/counterVariable needs a counterTarget/,
	);
});

test('a location needs both x and y', () => {
	assert.throws(
		() => questsFromRows([{ questId: 'q', locationX: 3 }]),
		/a stage location needs both locationX and locationY/,
	);
});

test('a full location, including map, round-trips onto the stage', () => {
	const [quest] = questsFromRows([{ questId: 'q', locationMap: 'town', locationX: 3, locationY: 4 }]);
	assert.deepEqual(quest.stages[0].location, { map: 'town', x: 3, y: 4 });
});

test('a quest built from a real CSV file loads into a QuestLog and advances', () => {
	const csv = `questId,counterVariable,counterTarget,description
rats,ratsKilled,5,Kill 5 rats
rats,,,Report back to the innkeeper`;

	const rows = parseCSV<QuestStageRow>(csv, { columns: { counterTarget: 'number' } });
	const [quest] = questsFromRows(rows);

	const log = new QuestLog();
	log.define(quest);
	log.start('rats');
	assert.equal(log.status('rats'), 'active');
	assert.deepEqual(log.currentStage('rats'), {
		counter: { variable: 'ratsKilled', target: 5 },
		description: 'Kill 5 rats',
	});
});
