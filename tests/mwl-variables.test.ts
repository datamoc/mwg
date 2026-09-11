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
	const game = compile(`${BASE}${events}[/game]
`, { file: 'variables.mwl' });
	const rt = new MwlRuntime(game, { onMessage: (message) => messages.push(message) });
	Object.assign(rt.world.variables, variables);
	rt.run('start');
	return { rt, messages };
}

const fired = (messages: MwlMessage[]) => messages.some((message) => message.text === 'fired');

test('conditions compare a variable against another variable', () => {
	const { messages } = runWith(`[event]
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
`, { picked: 'Sithrak!', secret: 'Sithrak!' });
	assert.equal(fired(messages), true);
});

test('set_variable copies a bare variable reference', () => {
	const { rt } = runWith(`[event]
id=e
on=start
[set_variable]
name=copy
value=$original
[/set_variable]
[/event]
`, { original: 'Brena' });
	assert.equal(rt.world.variables.copy, 'Brena');
});

test('messages interpolate variables and expressions', () => {
	const { messages } = runWith(`[event]
id=e
on=start
[message]
text=_ "Hello $name, $(n + 1) left."
[/message]
[/event]
`, { name: 'Arvith', n: 6 });
	assert.equal(messages.at(-1)?.text, 'Hello Arvith, 7 left.');
});
