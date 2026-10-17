import { test } from 'node:test';
import assert from 'node:assert/strict';

import { connectWebMidi, type WebMidiInputPort } from '../src/audio/WebMidi.ts';
import { FakeRetroPlayer } from '../src/testing/FakeAudio.ts';

function fakePort(name: string): WebMidiInputPort & { send: (data: number[] | null) => void } {
	const port: WebMidiInputPort & { send: (data: number[] | null) => void } = {
		name,
		onmidimessage: null,
		send(data) {
			this.onmidimessage?.({ data: data === null ? null : new Uint8Array(data) });
		},
	};
	return port;
}

test('connectWebMidi forwards channel messages and sysex to the synth, and drops transport', () => {
	const synth = new FakeRetroPlayer(8000);
	const keys = fakePort('keys');
	const link = connectWebMidi({ inputs: new Map([['a', keys]]) }, synth);
	assert.equal(link.ports, 1);

	keys.send([0x90, 60, 100]);
	keys.send([0xc0, 12, 0]);
	keys.send([0xf0, 0x41, 0x10, 0xf7]);
	keys.send([0xf8]); //a clock tick voices nothing
	keys.send([]);
	keys.send(null);
	assert.deepEqual(synth.events, [
		[0x90, 60, 100],
		[0xc0, 12, 0],
	]);
	assert.equal(synth.notesOn, 1, 'the note-on reached the synth as a sounding note');
	assert.deepEqual([...synth.sysexMessages[0]], [0xf0, 0x41, 0x10, 0xf7]);

	link.disconnect();
	keys.send([0x80, 60, 0]);
	assert.equal(synth.events.length, 2, 'a disconnected port forwards nothing more');
	link.disconnect();
	assert.equal(link.ports, 1, 'disconnecting twice keeps the count it had');
});

test('connectWebMidi wires every port the access offers', () => {
	const synth = new FakeRetroPlayer(8000);
	const a = fakePort('a');
	const b = fakePort('b');
	const link = connectWebMidi(
		{
			inputs: new Map([
				['a', a],
				['b', b],
			]),
		},
		synth,
	);
	assert.equal(link.ports, 2);
	b.send([0x91, 64, 90]);
	assert.equal(synth.notesOn, 1);
	assert.deepEqual(synth.events, [[0x91, 64, 90]], 'the second port plays on its own channel');
});
