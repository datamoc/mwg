import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, type MwlMessage } from '../src/mwl/runtime.ts';

const BASE = `[
	{ tag: 'game', schema: 0.1, children: [
		{ tag: 'side', id: 1, controller: 'human', gold: 0 },
		{ tag: 'map', id: 'arena', terrain: 'Gg,Gg' },
		{ tag: 'unit_type', id: 'Swordsman', hitpoints: 10, movement: 3 },
		{ tag: 'unit_type', id: 'Archer', hitpoints: 6, movement: 3 },
		{ tag: 'unit', id: 'hero', type: 'Swordsman', side: 1, x: 0, y: 0 },
		{ tag: 'unit', id: 'foe', type: 'Archer', side: 2, x: 1, y: 0 },
`;

function runWith(events: string, variables: Record<string, string | number | boolean> = {}) {
	const messages: MwlMessage[] = [];
	const game = compile(`${BASE}${events}] } ]`, { file: 'conditions.mwl' });
	const rt = new MwlRuntime(game, { onMessage: (message) => messages.push(message) });
	Object.assign(rt.world.variables, variables);
	rt.run('start');
	return { rt, messages };
}

const fired = (messages: MwlMessage[]) => messages.some((message) => message.text === 'fired');

const startEvent = (children: string) => `{ tag: 'event', id: 'e', on: 'start', children: [${children}] },`;

const firedMessage = `{ tag: 'message', text: _("fired") },`;

test('conditions compare with not_equals, in, not_in and numeric operators', () => {
	const yes = runWith(startEvent(`{ tag: 'condition', variable: 'path', not_equals: 'left' }, ${firedMessage}`), {
		path: 'right',
	});
	assert.equal(fired(yes.messages), true);

	const no = runWith(startEvent(`{ tag: 'condition', variable: 'path', not_equals: 'right' }, ${firedMessage}`), {
		path: 'right',
	});
	assert.equal(fired(no.messages), false);

	const list = runWith(
		startEvent(
			`{ tag: 'condition', variable: 'path', in: 'left,right' }, { tag: 'condition', variable: 'n', less_than: 7 }, ${firedMessage}`,
		),
		{ path: 'right', n: 6 },
	);
	assert.equal(fired(list.messages), true, 'all condition children must match');

	const range = runWith(
		startEvent(`{ tag: 'condition', variable: 'n', greater_than_or_equal_to: 7 }, ${firedMessage}`),
		{ n: 6 },
	);
	assert.equal(range.messages.length, 0);
});

test('filters exclude not_type and filter_condition checks units and variables', () => {
	const excluded = runWith(startEvent(`{ tag: 'filter', side: 2, not_type: 'Archer,Swordsman' }, ${firedMessage}`));
	assert.equal(fired(excluded.messages), false, 'the only side-2 unit is an Archer');

	const seen = runWith(
		startEvent(
			`{ tag: 'filter_condition', children: [{ tag: 'have_unit', id: 'hero' }, { tag: 'variable', name: 'turn_number', equals: 1 }] }, ${firedMessage}`,
		),
		{ turn_number: 1 },
	);
	assert.equal(fired(seen.messages), true);

	const missing = runWith(
		startEvent(`{ tag: 'filter_condition', children: [{ tag: 'have_unit', id: 'nobody' }] }, ${firedMessage}`),
	);
	assert.equal(fired(missing.messages), false);
});

test('an if branch runs its body when its condition holds, and skips it when it does not', () => {
	const yes = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'flag', equals: 'yes' }, ${firedMessage}] },`,
		),
		{ flag: 'yes' },
	);
	assert.equal(fired(yes.messages), true);

	const no = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'flag', equals: 'yes' }, ${firedMessage}] },`,
		),
		{ flag: 'no' },
	);
	assert.equal(fired(no.messages), false);
});

test('if and else select between branches from a condition and a test expression', () => {
	const conditionForm = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'ready', equals: 'yes' }, ${firedMessage}] },`,
		),
		{ ready: 'yes' },
	);
	assert.equal(fired(conditionForm.messages), true);

	const testForm = runWith(startEvent(`{ tag: 'if', test: 'score >= 3', children: [${firedMessage}] },`), {
		score: 4,
	});
	assert.equal(fired(testForm.messages), true);

	const taken = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'ready', equals: 'yes' }, ${firedMessage}] }, { tag: 'else', children: [{ tag: 'message', text: _("other") }] },`,
		),
		{ ready: 'yes' },
	);
	assert.equal(fired(taken.messages), true);
	assert.equal(
		taken.messages.some((message) => message.text === 'other'),
		false,
		'the paired else must not run when the if was taken',
	);

	const fallback = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'ready', equals: 'yes' }, ${firedMessage}] }, { tag: 'else', children: [{ tag: 'message', text: _("other") }] },`,
		),
		{ ready: 'no' },
	);
	assert.equal(fired(fallback.messages), false);
	assert.equal(
		fallback.messages.some((message) => message.text === 'other'),
		true,
	);
});

test('a second if/else pair is independent, and a free-standing else still runs', () => {
	const second = runWith(
		startEvent(
			`{ tag: 'if', children: [{ tag: 'condition', variable: 'a', equals: 1 }, ${firedMessage}] }, { tag: 'else', children: [{ tag: 'message', text: _("other") }] },` +
				` { tag: 'if', children: [{ tag: 'condition', variable: 'b', equals: 1 }, { tag: 'message', text: _("second") }] }, { tag: 'else', children: [{ tag: 'message', text: _("other") }] },`,
		),
		{ a: 1, b: 2 },
	);
	assert.equal(fired(second.messages), true, 'the first pair takes its then-branch');
	assert.equal(
		second.messages.some((message) => message.text === 'second'),
		false,
		'the second pair takes its own else, not the first',
	);

	const free = runWith(startEvent(`{ tag: 'else', children: [{ tag: 'message', text: _("other") }] },`));
	assert.equal(
		free.messages.some((message) => message.text === 'other'),
		true,
		'an else with no preceding if is not consumed',
	);
});
