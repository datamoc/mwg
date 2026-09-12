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
`;

function runWith(events: string, variables: Record<string, string | number | boolean> = {}) {
	const messages: MwlMessage[] = [];
	const game = compile(
		`${BASE}${events}[/game]
`,
		{ file: 'variables.mwl' },
	);
	const rt = new MwlRuntime(game, { onMessage: (message) => messages.push(message) });
	Object.assign(rt.world.variables, variables);
	rt.run('start');
	return { rt, messages };
}

const fired = (messages: MwlMessage[]) => messages.some((message) => message.text === 'fired');

test('conditions compare a variable against another variable', () => {
	const { messages } = runWith(
		`[event]
id=e
on=start
[condition]
variable=picked
equals=$secret
[/condition]
[message]
text=_ "fired"
[/message]
[/event]
`,
		{ picked: 'Sithrak!', secret: 'Sithrak!' },
	);
	assert.equal(fired(messages), true);
});

test('set_variable copies a bare variable reference', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
name=copy
value=$original
[/set_variable]
[/event]
`,
		{ original: 'Brena' },
	);
	assert.equal(rt.world.variables.copy, 'Brena');
});

test('messages interpolate variables and expressions', () => {
	const { messages } = runWith(
		`[event]
id=e
on=start
[message]
text=_ "Hello $name, $(n + 1) left."
[/message]
[/event]
`,
		{ name: 'Arvith', n: 6 },
	);
	assert.equal(messages.at(-1)?.text, 'Hello Arvith, 7 left.');
});

test('while is bounded and can update structured variables', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=counter
value=0
[/set_variable]
[while]
test=counter < 3
[set_variable]
name=counter
value=counter + 1
[/set_variable]
[/while]
[set_variable]
name=progress.current
value=$counter
[/set_variable]
[/event]
`);
	assert.equal(rt.world.variables.counter, 3);
	assert.deepEqual(rt.world.variables.progress, { current: 3 });
});

test('while runs a body carrying its condition child', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=counter
value=0
[/set_variable]
[while]
max_iterations=10
[condition]
variable=counter
less_than=3
[/condition]
[set_variable]
name=counter
value=counter + 1
[/set_variable]
[/while]
[/event]
`);
	assert.equal(rt.world.variables.counter, 3);
});

test('foreach iterates arrays and switch selects the matching case', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=choices
value=red,green,blue
[/set_variable]
[foreach]
variable=choices
item=choice
index=position
[switch]
variable=choice
[case]
equals=green
[set_variable]
name=selected.position
value=$position
[/set_variable]
[/case]
[/switch]
[/foreach]
[/event]
`);
	assert.deepEqual(rt.world.variables.selected, { position: 1 });
});

test('a filter_condition reads the same dotted path set_variable wrote', () => {
	const { messages } = runWith(`[event]
id=write
on=start
[set_variable]
name=zombies.0.allow_recruit
value=yes
[/set_variable]
[/event]
[event]
id=read
on=start
[filter_condition]
[variable]
name=zombies.0.allow_recruit
equals=yes
[/variable]
[/filter_condition]
[message]
text=_ "fired"
[/message]
[/event]
`);
	assert.deepEqual(
		messages.map((message) => message.text),
		['fired'],
	);
});

test('a dotted path resolves in a filter_condition and a message, not only a top-level key', () => {
	const { rt, messages } = runWith(
		`[event]
id=e
on=start
[set_variable]
name=progress.stage
value=two
[/set_variable]
[set_variable]
name=mirror.stage
value=two
[/set_variable]
[/event]
[event]
id=read
on=start
[filter_condition]
[variable]
name=progress.stage
equals=$mirror.stage
[/variable]
[/filter_condition]
[message]
text=_ "at $progress.stage"
[/message]
[/event]
`,
	);
	assert.deepEqual(rt.world.variables.progress, { stage: 'two' });
	assert.ok(
		messages.some((message) => message.text === 'at two'),
		'a dotted path resolves in the interpolation too',
	);
});

test('a[0].b reads and writes a real array index; a non-numeric index is refused', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=party[0].name
value=A
[/set_variable]
[set_variable]
name=party[1].name
value=B
[/set_variable]
[/event]
`);
	assert.deepEqual(rt.world.variables.party, [{ name: 'A' }, { name: 'B' }]);
	assert.throws(
		() => runWith(`[event]\nid=e\non=start\n[set_variable]\nname=a[x].b\nvalue=1\n[/set_variable]\n[/event]\n`),
		/invalid variable path: a\[x\]\.b/,
	);
});
