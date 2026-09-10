import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../tools/roadmapProgress.js';

interface RoadmapResult {
	sections: Array<{
		name: string;
		done: number;
		total: number;
		items: Array<{ type: string; done: boolean; text: string; num?: number }>;
	}>;
	overallDone: number;
	overallTotal: number;
	openItems: Array<{ type: string; done: boolean; text: string; num?: number }>;
}

interface RoadmapResultWithAllItems extends RoadmapResult {
	allItems: RoadmapResult['openItems'];
}

declare global {
	function parseRoadmap(markdown: string): RoadmapResultWithAllItems;
}

test('parses checkbox roadmaps grouped by ## sections', () => {
	const markdown = `
# Project Roadmap

## 1. Feature Alpha
- [x] Task one
- [ ] Task two
- [x] Task three

## 2. Feature Beta
- [ ] Task four
- [X] Task five
`;

	const result = parseRoadmap(markdown);
	assert.equal(result.overallTotal, 5);
	assert.equal(result.overallDone, 3);
	assert.equal(result.sections.length, 2);

	assert.equal(result.sections[0].name, '1. Feature Alpha');
	assert.equal(result.sections[0].done, 2);
	assert.equal(result.sections[0].total, 3);

	assert.equal(result.sections[1].name, '2. Feature Beta');
	assert.equal(result.sections[1].done, 1);
	assert.equal(result.sections[1].total, 2);

	assert.equal(result.openItems.length, 2);
	assert.equal(result.openItems[0].text, 'Task two');
	assert.equal(result.openItems[1].text, 'Task four');
});

test('handles CRLF line endings in markdown without breaking regex matches', () => {
	const markdown = '## Section One\r\n- [x] Done\r\n- [ ] Todo\r\n';
	const result = parseRoadmap(markdown);

	assert.equal(result.overallTotal, 2);
	assert.equal(result.overallDone, 1);
	assert.equal(result.sections.length, 1);
	assert.equal(result.sections[0].name, 'Section One');
});

test('parses flat numbered-item roadmaps into milestone batches', () => {
	const items: string[] = [];
	for (let i = 1; i <= 60; i++) {
		if (i === 10 || i === 35) {
			items.push(`${i}. Open task item ${i}`);
		} else {
			items.push(`${i}. ~~Completed task item ${i}~~`);
		}
	}
	const markdown = `# Roadmap\n\n${items.join('\n')}\n`;

	const result = parseRoadmap(markdown);
	assert.equal(result.overallTotal, 60);
	assert.equal(result.overallDone, 58);
	// 60 items in chunks of 25 = 3 chunks (25, 25, 10)
	assert.equal(result.sections.length, 3);

	assert.equal(result.sections[0].name, 'Items 1 - 25');
	assert.equal(result.sections[0].total, 25);
	assert.equal(result.sections[0].done, 24);

	assert.equal(result.sections[1].name, 'Items 26 - 50');
	assert.equal(result.sections[1].total, 25);
	assert.equal(result.sections[1].done, 24);

	assert.equal(result.sections[2].name, 'Items 51 - 60');
	assert.equal(result.sections[2].total, 10);
	assert.equal(result.sections[2].done, 10);

	assert.equal(result.openItems.length, 2);
	assert.equal(result.openItems[0].num, 10);
	assert.equal(result.openItems[1].num, 35);
});

test('parses empty or item-free markdown gracefully', () => {
	const result = parseRoadmap('# Just a title\nSome description.');
	assert.equal(result.overallDone, 0);
	assert.equal(result.overallTotal, 0);
	assert.equal(result.sections.length, 0);
	assert.equal(result.openItems.length, 0);
});

test('parses repository ROADMAP.md correctly', () => {
	const realRoadmap = readFileSync(resolve(import.meta.dirname, '../ROADMAP.md'), 'utf8');
	const result = parseRoadmap(realRoadmap);

	assert.ok(result.overallTotal >= 160, `expected at least 160 items, got ${result.overallTotal}`);
	assert.ok(result.overallDone >= 160, `expected at least 160 done items, got ${result.overallDone}`);
	assert.ok(result.sections.length >= 6, `expected at least 6 milestone batches, got ${result.sections.length}`);
	// The numbered list is append-only, so a recorded but not-yet-built idea sits at the
	// tail, after every shipped item, never interleaved with history. Item 192 (accessibility)
	// is the one such item right now; asserting the ordering rather than a fixed open set
	// means the next recorded idea needs no test edit. The 1.0 exit checklist stays prose
	// (checks to run, not items), so it must not show up here as open work.
	const openNumbers = result.openItems.map((item) => item.num ?? 0);
	const closedNumbers = result.allItems.filter((item) => item.done).map((item) => item.num ?? 0);
	assert.ok(
		openNumbers.every((open) => closedNumbers.every((closed) => open > closed)),
		'open numbered items must sit at the end of the append-only list',
	);

	// Item 175 (the pixi.js dependency-shape decision) is closed by decision, not left open
	const item175 = result.allItems.find((item) => item.num === 175);
	assert.ok(item175, 'expected item 175 in the numbered history');
	assert.equal(item175.done, true, 'expected item 175 to be closed');
});

test('allItems exposes every parsed item in document order, for item management filtering', () => {
	const markdown = `## Section\n- [x] Task one\n- [ ] Task two\n`;
	const result = parseRoadmap(markdown);
	assert.equal(result.allItems.length, 2);
	assert.equal(result.allItems[0].text, 'Task one');
	assert.equal(result.allItems[0].done, true);
	assert.equal(result.allItems[1].text, 'Task two');
	assert.equal(result.allItems[1].done, false);
});

test('allItems is present (possibly empty) even for item-free markdown', () => {
	const result = parseRoadmap('# Just a title\nSome description.');
	assert.deepEqual(result.allItems, []);
});
