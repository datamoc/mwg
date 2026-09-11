import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../tools/roadmapProgress.js';

type RoadmapItem = { type: string; done: boolean; text: string; num?: number };

interface RoadmapResult {
	sections: Array<{
		name: string;
		done: number;
		total: number;
		items: RoadmapItem[];
	}>;
	overallDone: number;
	overallTotal: number;
	openItems: RoadmapItem[];
	checklist: { name: string; done: number; total: number; open: RoadmapItem[] } | null;
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
	// The list is append-only, but completion is not: work is taken in priority order, so a newer
	// cluster can land while an older one is still open - items 274-276 landed with 247-273 open, and
	// an earlier version of this test asserted the prefix rule that forbade exactly that. What stays
	// true is narrower and still worth guarding: every number appears once, and every item is either
	// done or open. Density from 1 is checked separately, in the test below.
	const numbers = result.allItems.map((item) => item.num ?? 0);
	assert.equal(new Set(numbers).size, numbers.length, 'no numbered item may be recorded twice');
	assert.equal(
		result.overallDone,
		result.allItems.filter((item) => item.done).length,
		'every item is either done or open, never both and never neither',
	);
	// The roadmap can legitimately reach zero open numbered items - it did, 2026-09-11 - so this
	// only checks openItems is the same list the done/total counts already imply, not that it is
	// nonempty forever.
	assert.equal(result.openItems.length, result.overallTotal - result.overallDone);

	// The 1.0 exit checklist is checks to run, not numbered capabilities, so it stays out of the
	// totals above. It is reported separately, under its own heading, because a dashboard that
	// hides an open release gate is worse than one that shows two kinds of work.
	assert.ok(result.checklist, 'expected the 1.0 exit checklist to be reported');
	assert.equal(result.checklist.name, '1.0 exit checklist');
	assert.ok(result.checklist.total >= 9, `expected at least 9 checks, got ${result.checklist.total}`);

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

test('parses items struck before the number as done', () => {
	// `~~12. text~~` strikes the whole item; `12. ~~text~~` only its text. Both mean done, and
	// the second form used to be invisible, which is how nine real items went uncounted.
	const markdown = `# Roadmap\n\n~~12. Closed item twelve~~\n13. Open item thirteen\n`;
	const result = parseRoadmap(markdown);

	assert.equal(result.overallTotal, 2);
	assert.equal(result.overallDone, 1);
	assert.equal(result.allItems[0].num, 12);
	assert.equal(result.allItems[0].done, true);
	assert.equal(result.allItems[1].num, 13);
	assert.equal(result.allItems[1].done, false);
	assert.equal(result.openItems.length, 1);
	assert.equal(result.openItems[0].num, 13);
});

test('counts both done conventions in the same list', () => {
	const markdown = `# Roadmap\n\n1. ~~Struck text~~\n~~2. Struck whole item~~\n3. Open item\n`;
	const result = parseRoadmap(markdown);

	assert.equal(result.overallTotal, 3);
	assert.equal(result.overallDone, 2);
	assert.equal(result.openItems.length, 1);
	assert.equal(result.openItems[0].num, 3);
});

test('reports the checklist beside the numbered list instead of inside it', () => {
	const markdown = `# Roadmap\n\n### 1.0 exit checklist\n\n- [x] A check that passes\n- [ ] A check still open\n\n1. ~~Shipped item~~\n`;
	const result = parseRoadmap(markdown);

	// Checks to run are not capabilities, so the numbered totals ignore them...
	assert.equal(result.overallTotal, 1);
	assert.equal(result.overallDone, 1);
	assert.equal(result.openItems.length, 0);

	// ...and the checklist is surfaced on its own, named by the heading it sits under.
	assert.ok(result.checklist, 'expected a checklist summary');
	assert.equal(result.checklist.name, '1.0 exit checklist');
	assert.equal(result.checklist.total, 2);
	assert.equal(result.checklist.done, 1);
	assert.equal(result.checklist.open.length, 1);
	assert.equal(result.checklist.open[0].text, 'A check still open');
});

test('no numbered item of the repository roadmap is invisible to the parser', () => {
	const realRoadmap = readFileSync(resolve(import.meta.dirname, '../ROADMAP.md'), 'utf8');
	const result = parseRoadmap(realRoadmap);

	// The list is dense: every number from 1 to its last one exists, no gaps and no repeats. A
	// missing number here means a strike form stopped being recognised, not that the list has a
	// hole, which is exactly how items 205-213 went missing.
	const numbers = result.allItems.map((item) => item.num ?? 0).sort((a, b) => a - b);
	const last = numbers[numbers.length - 1];
	assert.deepEqual(
		numbers,
		Array.from({ length: last }, (_, index) => index + 1),
		'numbered items must be contiguous from 1 with no repeats',
	);
	assert.ok(last > 200, `expected the list to reach past 200, got ${last}`);
});
