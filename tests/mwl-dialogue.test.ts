import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, type MwlMessage } from '../src/mwl/runtime.ts';

const GAME = `[game]
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
[event]
id=ask
on=start
[dialogue]
[message]
speaker=Guide
text=_ "Which way?"
[/message]
[choice]
text=_ "Left"
event=go-left
[/choice]
[choice]
text=_ "Right"
event=go-right
[/choice]
[/dialogue]
[/event]
[event]
id=go-left
[set_variable]
name=path
value=left
[/set_variable]
[/event]
[event]
id=go-right
[set_variable]
name=path
value=right
[/set_variable]
[/event]
[/game]
`;

function runtime() {
	const messages: MwlMessage[] = [];
	const game = compile(GAME, { file: 'dialogue.mwl' });
	const rt = new MwlRuntime(game, { onMessage: (message) => messages.push(message) });
	return { rt, messages };
}

test('a dialogue offers its choices and answering runs the chosen event', () => {
	const { rt, messages } = runtime();
	rt.run('start');
	const asked = messages.at(-1)!;
	assert.deepEqual(
		asked.choices?.map((choice) => choice.text),
		['Left', 'Right'],
	);
	assert.ok(asked.dialogueId);
	assert.equal(rt.answerDialogue(asked.dialogueId!, 1), true);
	assert.equal(rt.world.variables.path, 'right');
	assert.equal(rt.answerDialogue(asked.dialogueId!, 0), false, 'a dialogue answers once');
});

test('answering an unknown dialogue or choice says no', () => {
	const { rt, messages } = runtime();
	rt.run('start');
	assert.equal(rt.answerDialogue('dialogue-99', 0), false);
	assert.equal(rt.answerDialogue(messages.at(-1)!.dialogueId!, 7), false);
});

test('a pending dialogue survives save and restore', () => {
	const first = runtime();
	first.rt.run('start');
	const message = first.messages.at(-1)!;
	const saved = first.rt.save();
	const restored = new MwlRuntime(compile(GAME), { onMessage: () => {} });
	restored.restore(saved);
	assert.equal(restored.answerDialogue(message.dialogueId!, 0), true);
	assert.equal(restored.world.variables.path, 'left');
});

test('inline dialogue branches become answerable choices', () => {
	const source = `[event]
on=start
[dialogue]
[say]
speaker=Guide
text=Choose
[/say]
[choice]
text=Advance
[branch]
[set_variable]
name=path
value=forward
[/set_variable]
[/branch]
[branch]
text=Hold
[set_variable]
name=path
value=still
[/set_variable]
[/branch]
[/choice]
[/dialogue]
[/event]`;
	const messages: MwlMessage[] = [];
	const runtime = new MwlRuntime(compile(source), { onMessage: (message) => messages.push(message) });
	runtime.run('start');
	assert.deepEqual(
		messages.at(-1)?.choices?.map((choice) => choice.text),
		['Advance', 'Hold'],
	);
	assert.equal(runtime.answerDialogue(messages.at(-1)!.dialogueId!, 1), true);
	assert.equal(runtime.world.variables.path, 'still');
});

test('a choice gate reads a dotted variable path, like every other reader', () => {
	const source = `[game]
schema=0.1
[event]
on=start
[set_variable]
name=gate.open
value=yes
[/set_variable]
[dialogue]
[message]
text=_ "Advance?"
[/message]
[choice]
text=Secret
event=go
variable=gate.open
equals=yes
[/choice]
[choice]
text=Wait
event=go
[/choice]
[/dialogue]
[/event]
[event]
id=go
[set_variable]
name=path
value=taken
[/set_variable]
[/event]
[/game]`;
	const messages: MwlMessage[] = [];
	const runtime = new MwlRuntime(compile(source), { onMessage: (message) => messages.push(message) });
	runtime.run('start');
	assert.deepEqual(
		messages.at(-1)?.choices?.map((choice) => choice.text),
		['Secret', 'Wait'],
	);
});
