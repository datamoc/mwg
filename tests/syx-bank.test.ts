import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SyxBank, dx7PatchNames, dx7VoiceInfo, readSyx, splitSysex } from '../src/audio/SyxBank.ts';
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

test('a patch id carries the source, the slot and a fingerprint that follows the voice, not its name', () => {
	const bank = dx7Bank(['BRASS1', 'BRASS1']);
	const patches = dx7PatchNames(bank, 'factory.syx');
	assert.match(patches[0].id, /^factory\.syx#0\.0@[0-9a-f]{16}$/);
	assert.notEqual(patches[0].id, patches[1].id, 'two voices with one name stay two patches');
	const edited = dx7Bank(['BRASS1', 'BRASS1']);
	edited[6 + 5] = 99; //a parameter of voice 0
	let sum = 0;
	for (const byte of edited.subarray(6, 6 + 4096)) sum += byte;
	edited[6 + 4096] = (128 - (sum % 128)) % 128;
	const after = dx7PatchNames(edited, 'factory.syx');
	assert.notEqual(after[0].id.split('@')[1], patches[0].id.split('@')[1], 'an edited voice changes its fingerprint');
	assert.equal(after[1].id, patches[1].id, 'an untouched voice keeps its id');
	assert.match(new SyxBank(bank).patches[0].id, /^bank#0\.0@/);
});

test('a DX7 patch says how it is built: algorithm, feedback, LFO wave and transposition', () => {
	const bank = dx7Bank(['A', 'B']);
	const voice1 = 6 + 128; //the second voice's packed bytes start here
	bank[voice1 + 110] = 21; //algorithm 22
	bank[voice1 + 111] = 5 | 8; //feedback 5, oscillator sync on (bit 3 is not feedback)
	bank[voice1 + 116] = (4 << 1) | 1 | (3 << 4); //sine, LFO sync, sensitivity 3
	bank[voice1 + 117] = 24 + 12; //an octave up
	let sum = 0;
	for (const byte of bank.subarray(6, 6 + 4096)) sum += byte;
	bank[6 + 4096] = (128 - (sum % 128)) % 128;
	const [first, second] = dx7PatchNames(bank);
	assert.deepEqual(first.info, { algorithm: 1, feedback: 0, lfoWave: 'triangle', transpose: -24 });
	assert.deepEqual(second.info, { algorithm: 22, feedback: 5, lfoWave: 'sine', transpose: 12 });
	assert.equal(dx7VoiceInfo(new Uint8Array(128)).algorithm, 1);
});

test('a tolerant read keeps the usable banks and names what it skipped', () => {
	const good = dx7Bank(['GOOD']);
	const bad = dx7Bank(['BAD']);
	bad[200] ^= 0x01;
	const other = new Uint8Array([0xf0, 0x41, 0x10, 0x16, 0x12, 0xf7]);
	const file = new Uint8Array([9, 9, ...good, ...bad, ...other, 0xf0, 0x43, 1, 2]);
	const bank = new SyxBank(file, 'mixed.syx');
	assert.equal(bank.messages.length, 3);
	assert.equal(bank.patches.length, 32, 'only the clean bank contributes patches');
	assert.deepEqual(
		readSyx(file).skipped.map((skip) => [skip.kind, skip.message ?? null]),
		[
			['leading-bytes', null],
			['unterminated', null],
			['bad-checksum', 1],
			['unrecognised', 2],
		],
	);
	assert.deepEqual(new SyxBank(good).skipped, [], 'a clean file skips nothing');
	assert.deepEqual(readSyx(new Uint8Array([1, 2, 3])).skipped, [{ kind: 'leading-bytes', bytes: 3 }]);
});

test('audit renders every patch on its own voice and flags the silent and the clipped ones', () => {
	const bank = new SyxBank(dx7Bank(['A', 'B']));
	let voice = 0;
	let on = false;
	const synth = {
		sampleRate: 8000,
		event(status: number, data1: number, data2: number) {
			if ((status & 0xf0) === 0xc0) voice = data1;
			else if ((status & 0xf0) === 0x90 && data2 > 0) on = true;
			else on = false;
		},
		sysex() {},
		render(left: Float32Array, right: Float32Array, start: number, count: number) {
			const level = !on || voice === 3 ? 0 : voice === 5 ? 1 : 0.4;
			for (let i = 0; i < count; i++) left[start + i] = right[start + i] = level;
		},
		reset() {
			on = false;
		},
	};
	const findings = bank.audit(synth);
	assert.deepEqual(
		findings.map((f) => [f.patch.voice, f.kind]),
		[
			[3, 'silent'],
			[5, 'clipping'],
		],
	);
	assert.equal(findings[1].peak, 1);
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
