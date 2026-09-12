import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, type MwlMessage } from '../src/mwl/runtime.ts';

const BASE = `[game]
schema=0.1
[side]
id=1
controller=human
gold=0
[/side]
[map]
id=arena
terrain=Gg,Gg
[/map]
[unit_type]
id=Swordsman
hitpoints=10
movement=3
[/unit_type]
[unit_type]
id=Archer
hitpoints=6
movement=3
[/unit_type]
[unit]
id=hero
type=Swordsman
side=1
x=0
y=0
[/unit]
[unit]
id=foe
type=Archer
side=2
x=1
y=0
[/unit]
`;

function runWith(events: string, variables: Record<string, string | number | boolean> = {}) {
	const messages: MwlMessage[] = [];
	const game = compile(
		`${BASE}${events}[/game]
`,
		{ file: 'conditions.mwl' },
	);
	const rt = new MwlRuntime(game, { onMessage: (message) => messages.push(message) });
	Object.assign(rt.world.variables, variables);
	rt.run('start');
	return { rt, messages };
}

const fired = (messages: MwlMessage[]) => messages.some((message) => message.text === 'fired');

test('conditions compare with not_equals, in, not_in and numeric operators', () => {
	const yes = runWith(
		`[event]
id=e
on=start
[condition]
variable=path
not_equals=left
[/condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ path: 'right' },
	);
	assert.equal(fired(yes.messages), true);

	const no = runWith(
		`[event]
id=e
on=start
[condition]
variable=path
not_equals=right
[/condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ path: 'right' },
	);
	assert.equal(fired(no.messages), false);

	const list = runWith(
		`[event]
id=e
on=start
[condition]
variable=path
in=left,right
[/condition]
[condition]
variable=n
less_than=7
[/condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ path: 'right', n: 6 },
	);
	assert.equal(fired(list.messages), true, 'all condition children must match');

	const range = runWith(
		`[event]
id=e
on=start
[condition]
variable=n
greater_than_or_equal_to=7
[/condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ n: 6 },
	);
	assert.equal(range.messages.length, 0);
});

test('filters exclude not_type and filter_condition checks units and variables', () => {
	const excluded = runWith(`[event]
id=e
on=start
[filter]
side=2
not_type=Archer,Swordsman
[/filter]
[message]
text=_ "fired"
[/message]
[/event]
`);
	assert.equal(fired(excluded.messages), false, 'the only side-2 unit is an Archer');

	const seen = runWith(
		`[event]
id=e
on=start
[filter_condition]
[have_unit]
id=hero
[/have_unit]
[variable]
name=turn_number
equals=1
[/variable]
[/filter_condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ turn_number: 1 },
	);
	assert.equal(fired(seen.messages), true);

	const missing = runWith(`[event]
id=e
on=start
[filter_condition]
[have_unit]
id=nobody
[/have_unit]
[/filter_condition]
[message]
text=_ "fired"
[/message]
[/event]
`);
	assert.equal(fired(missing.messages), false);
});

test('an if branch runs its body when its condition holds, and skips it when it does not', () => {
	const yes = runWith(
		`[event]
id=e
on=start
[if]
[condition]
variable=flag
equals=yes
[/condition]
[message]
text=_ "fired"
[/message]
[/if]
[/event]
`,
		{ flag: 'yes' },
	);
	assert.equal(fired(yes.messages), true);

	const no = runWith(
		`[event]
id=e
on=start
[if]
[condition]
variable=flag
equals=yes
[/condition]
[message]
text=_ "fired"
[/message]
[/if]
[/event]
`,
		{ flag: 'no' },
	);
	assert.equal(fired(no.messages), false);
});

test('if and else select between branches from a condition and a test expression', () => {
	const conditionForm = runWith(
		`[event]
id=e
on=start
[if]
[condition]
variable=ready
equals=yes
[/condition]
[message]
text=_ "fired"
[/message]
[/if]
[/event]
`,
		{ ready: 'yes' },
	);
	assert.equal(fired(conditionForm.messages), true);

	const testForm = runWith(
		`[event]
id=e
on=start
[if]
test=score >= 3
[message]
text=_ "fired"
[/message]
[/if]
[/event]
`,
		{ score: 4 },
	);
	assert.equal(fired(testForm.messages), true);

	const fallback = runWith(
		`[event]
id=e
on=start
[if]
[condition]
variable=ready
equals=yes
[/condition]
[message]
text=_ "fired"
[/message]
[/if]
[else]
[message]
text=_ "other"
[/message]
[/else]
[/event]
`,
		{ ready: 'no' },
	);
	assert.equal(fired(fallback.messages), false);
	assert.equal(
		fallback.messages.some((message) => message.text === 'other'),
		true,
	);
});
