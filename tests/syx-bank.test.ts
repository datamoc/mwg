import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SyxBank, dx7PatchNames, splitSysex } from '../src/audio/SyxBank.ts';
import { FakeRetroPlayer } from '../src/testing/FakeAudio.ts';

/** a DX7 32-voice bulk dump with `names` written into the first voices, checksum included */
function dx7Bank(names: string[]): Uint8Array {
	const data = new Uint8Array(4096);
	names.forEach((name, voice) => {
		const at = voice * 128 + 118;
		for (let i = 0; i < 10; i++) data[at + i] = (name.padEnd(10)[i] ?? ' ').charCodeAt(0);
	});
	let sum = 0;
	for (const byte of data) sum += byte;
	const checksum = (128 - (sum % 128)) % 128;
	return new Uint8Array([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00, ...data, checksum, 0xf7]);
}

test('splitSysex takes the whole messages and leaves padding and a truncated tail out', () => {
	const bytes = new Uint8Array([0x00, 0x7e, 0xf0, 0x41, 0xf7, 0xf0, 0x42, 0x10, 0xf7, 0xf0, 0x43]);
	const messages = splitSysex(bytes);
	assert.equal(messages.length, 2);
	assert.deepEqual([...messages[0]], [0xf0, 0x41, 0xf7]);
	assert.deepEqual([...messages[1]], [0xf0, 0x42, 0x10, 0xf7]);
	assert.deepEqual(splitSysex(new Uint8Array([])), []);
});

test('dx7PatchNames reads the 32 voice names of a checksummed bank, in order', () => {
	const bank = dx7Bank(['BRASS1', 'STRINGS']);
	const patches = dx7PatchNames(bank);
	assert.equal(patches.length, 32);
	assert.equal(patches[0].name, 'BRASS1');
	assert.equal(patches[1].name, 'STRINGS');
	assert.deepEqual([patches[1].message, patches[1].voice], [0, 1]);
	assert.equal(patches[2].name, '', 'an unnamed voice names as empty, not as neighbouring bytes');
});

test('a bank whose checksum fails, or another makers dump, yields no patch names', () => {
	const broken = dx7Bank(['BRASS1']);
	broken[100] ^= 0x01;
	assert.deepEqual(dx7PatchNames(broken), [], 'the checksum no longer holds, so no names are trusted');
	assert.deepEqual(dx7PatchNames(new Uint8Array([0xf0, 0x41, 0x10, 0xf7])), []);
});

test('SyxBank auditions a patch: its bank loads as sysex and one note sounds, then stops', () => {
	const bank = new SyxBank(dx7Bank(['BRASS1']));
	const synth = new FakeRetroPlayer(8000);
	const heard = bank.audition(synth, bank.patches[0], 60, 0.5);
	assert.equal(synth.sysexMessages.length, 1, 'the bank message loaded the patch');
	assert.equal(synth.sysexMessages[0][1], 0x43, 'the Yamaha dump itself');
	assert.ok(heard.left[Math.floor(0.25 * 8000)] > 0, 'sounding mid-note');
	assert.equal(heard.left[Math.floor(0.7 * 8000)], 0, 'silent in the tail after the note-off');
	assert.equal(heard.duration, 0.75);
	assert.equal(synth.resets, 2, 'reset before and after, leaving the synth reusable');
});
