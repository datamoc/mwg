import assert from 'node:assert/strict';
import test from 'node:test';
import { selectEntry } from '../src/two-d/ui/select.ts';
import type { SelectAction, SelectEntry, SelectPage } from '../src/two-d/ui/select.ts';

interface Item {
	readonly id: string;
}

function items(...labels: string[]): SelectEntry<Item>[] {
	return labels.map((label) => ({ label, value: { id: label } }));
}

/** a presenter that answers from `script`, recording every page it was shown */
function scripted(script: SelectAction[], seen: SelectPage<Item>[] = []) {
	let index = 0;
	return {
		seen,
		present: async (page: SelectPage<Item>): Promise<SelectAction> => {
			seen.push(page);
			const action = script[index++];
			if (action === undefined) throw new Error('presenter script ran out');
			return action;
		},
	};
}

test('selectEntry picks from a single page and returns the original entry', async () => {
	const entries = items('Attack', 'Defend', 'Item');
	const { present, seen } = scripted([{ choose: 1 }]);

	const chosen = await selectEntry(entries, { present });

	assert.equal(chosen, entries[1]);
	assert.equal(seen.length, 1);
	assert.equal(seen[0].pageIndex, 0);
	assert.equal(seen[0].pageCount, 1);
	assert.equal(seen[0].cursor, 0);
	assert.equal(seen[0].entries.length, 3);
	assert.ok(seen[0].entries.every((entry, index) => entry === entries[index]));
});

test('selectEntry pages forward and back through slices of the original entries', async () => {
	const entries = items('a', 'b', 'c', 'd', 'e');
	const { present, seen } = scripted([{ page: 'next' }, { page: 'next' }, { choose: 0 }]);

	const chosen = await selectEntry(entries, { present, pageSize: 2 });

	assert.equal(chosen, entries[4]);
	assert.deepEqual(
		seen.map((page) => page.pageIndex),
		[0, 1, 2],
	);
	assert.equal(seen[1].pageCount, 3);
	assert.ok(seen[0].entries.every((entry, index) => entry === entries[index]));
	assert.ok(seen[1].entries.every((entry, index) => entry === entries[index + 2]));
	assert.equal(seen[2].entries.length, 1);

	const back = scripted([{ page: 'next' }, { page: 'prev' }, { choose: 1 }]);
	assert.equal(await selectEntry(entries, { present: back.present, pageSize: 2 }), entries[1]);
	assert.deepEqual(
		back.seen.map((page) => page.pageIndex),
		[0, 1, 0],
	);
});

test('selectEntry refuses to choose a disabled entry and asks again with the cursor on it', async () => {
	const entries = items('Attack', 'Flee', 'Item');
	entries[1].disabled = true;
	const { present, seen } = scripted([{ choose: 1 }, { choose: 2 }]);

	const chosen = await selectEntry(entries, { present });

	assert.equal(chosen, entries[2]);
	assert.equal(seen.length, 2);
	assert.equal(seen[1].cursor, 1);
});

test('selectEntry returns null when the presenter cancels', async () => {
	const entries = items('Attack');
	const { present, seen } = scripted([null]);

	assert.equal(await selectEntry(entries, { present }), null);
	assert.equal(seen.length, 1);
});

test('selectEntry reports page footers and the last page correctly', async () => {
	const entries = items('a', 'b', 'c', 'd', 'e', 'f', 'g');
	const { present, seen } = scripted([{ page: 'next' }, { page: 'next' }, null]);

	assert.equal(await selectEntry(entries, { present, pageSize: 3 }), null);
	assert.deepEqual(
		seen.map((page) => page.entries.length),
		[3, 3, 1],
	);
	assert.deepEqual(
		seen.map((page) => page.pageIndex),
		[0, 1, 2],
	);
	assert.ok(seen.every((page) => page.pageCount === 3));
	assert.ok(seen[2].entries[0] === entries[6]);
});

test('selectEntry defaults to five entries per page', async () => {
	const entries = items('a', 'b', 'c', 'd', 'e', 'f');
	const { present, seen } = scripted([{ page: 'next' }, { choose: 0 }]);

	assert.equal(await selectEntry(entries, { present }), entries[5]);
	assert.deepEqual(
		seen.map((page) => page.entries.length),
		[5, 1],
	);
});

test('selectEntry refuses an action outside the presented page', async () => {
	const entries = items('a', 'b');
	const { present } = scripted([{ choose: 4 }]);

	await assert.rejects(selectEntry(entries, { present }), /outside a page of 2 entries/);
});

test('selectEntry returns null for an empty list without presenting', async () => {
	const { present, seen } = scripted([]);

	assert.equal(await selectEntry([], { present }), null);
	assert.equal(seen.length, 0);
});
