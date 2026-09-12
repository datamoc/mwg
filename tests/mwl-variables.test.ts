import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';
import { parse } from '../src/mwl/grammar.ts';
import { decodeSave, encodeSave } from '../src/mwl/persistence.ts';
import { validate } from '../src/mwl/schema.ts';
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

test('mode=literal keeps text the shape-guessing rule would evaluate', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
name=raise
mode=literal
value=Raise Walking Corpse (8 Gold)
[/set_variable]
[/event]
`,
	);
	assert.equal(rt.world.variables.raise, 'Raise Walking Corpse (8 Gold)');
});

test('mode=literal keeps a numeric variable name and a $reference as text', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
name=label
mode=literal
value=turn_number
[/set_variable]
[set_variable]
name=template
mode=literal
value=$original
[/set_variable]
[set_variable]
name=digits
mode=literal
value=42
[/set_variable]
[/event]
`,
		{ turn_number: 7, original: 'Brena' },
	);
	assert.equal(rt.world.variables.label, 'turn_number');
	assert.equal(rt.world.variables.template, '$original');
	assert.equal(rt.world.variables.digits, '42', 'a numeric-looking literal stays the string it was written as');
});

test('mode=number parses a number and refuses anything else', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=gold_left
mode=number
value=12
[/set_variable]
[set_variable]
name=debt
mode=number
value=-3
[/set_variable]
[/event]
`);
	assert.equal(rt.world.variables.gold_left, 12);
	assert.equal(rt.world.variables.debt, -3);
	assert.throws(
		() =>
			runWith(
				`[event]\nid=e\non=start\n[set_variable]\nname=x\nmode=number\nvalue=twelve\n[/set_variable]\n[/event]\n`,
			),
		/MWL set_variable mode="number" needs a number/,
	);
});

test('mode=expression evaluates, and a missing variable is an error rather than literal text', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
name=total
mode=expression
value=counter * 2
[/set_variable]
[/event]
`,
		{ counter: 4 },
	);
	assert.equal(rt.world.variables.total, 8);
	assert.throws(
		() =>
			runWith(
				`[event]\nid=e\non=start\n[set_variable]\nname=x\nmode=expression\nvalue=counter * 2\n[/set_variable]\n[/event]\n`,
			),
		/missing MWL expression variable "counter"/,
	);
});

test('the [command] spelling of set_variable takes the same mode', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[command]
name=set_variable
target=raise
mode=literal
value=Raise Walking Corpse (8 Gold)
[/command]
[/event]
`);
	assert.equal(rt.world.variables.raise, 'Raise Walking Corpse (8 Gold)');
});

test('a mode outside the vocabulary is a compile-time diagnostic', () => {
	const diagnostics = validate(
		parse(
			'[game]\nschema=0.1\n[event]\nid=e\non=start\n[set_variable]\nname=x\nmode=literl\nvalue=1\n[/set_variable]\n[/event]\n[/game]',
		),
	);
	assert.equal(diagnostics[0].code, 'MWL_VALUE');
	assert.match(diagnostics[0].message, /mode must be one of literal, number, expression/);
});

test('a computed path builds its target from variables', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
path=zombies[$index].allow_recruit
value=yes
[/set_variable]
[/event]
`,
		{ index: 0 },
	);
	assert.deepEqual(rt.world.variables.zombies, [{ allow_recruit: 'yes' }]);
});

test('a computed path resolves an expression index and a path held in a variable', () => {
	const { rt } = runWith(
		`[event]
id=e
on=start
[set_variable]
path=party[0].name
value=A
[/set_variable]
[set_variable]
path=party[$(slot + 1)].name
value=Brena
[/set_variable]
[set_variable]
path=$target
value=deep
[/set_variable]
[/event]
`,
		{ slot: 0, target: 'progress.stage' },
	);
	assert.deepEqual(rt.world.variables.party, [{ name: 'A' }, { name: 'Brena' }]);
	assert.deepEqual(rt.world.variables.progress, { stage: 'deep' });
});

test('a computed path refuses a reference that names nothing a path can use', () => {
	const write = (path: string, variables?: Record<string, string | number | boolean>) =>
		runWith(
			`[event]\nid=e\non=start\n[set_variable]\npath=${path}\nvalue=1\n[/set_variable]\n[/event]\n`,
			variables,
		);
	assert.throws(() => write('zombies[$missing].hp'), /MWL variable path reference "\$missing" names no variable/);
	assert.throws(() => write('zombies[$flag].hp', { flag: true }), /"\$flag" is not a name or number/);
	//what expansion builds is still the walker's to accept: a string index has to be a number
	assert.throws(() => write('party[$list].name', { list: 'a,b' }), /invalid variable path: party\[a,b\]\.name/);
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

	//the array shape is what a save carries, not only what a live world holds
	const restored = decodeSave(encodeSave(rt.world, { version: 1 }), { version: 1 });
	assert.deepEqual(restored.variables.party, [{ name: 'A' }, { name: 'B' }]);
});
