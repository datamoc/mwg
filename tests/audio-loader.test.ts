import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioLoader } from '../src/audio/index.ts';

test('audio loader shares one decode across lifetimes without surrendering cached asset bytes', async () => {
	const original = new Uint8Array([1, 2, 3]).buffer;
	const buffer = { duration: 1 } as AudioBuffer;
	let reads = 0;
	let decodes = 0;
	const context = {
		decodeAudioData: async (bytes: ArrayBuffer) => {
			decodes++;
			assert.notEqual(bytes, original);
			assert.deepEqual(new Uint8Array(bytes), new Uint8Array(original));
			return buffer;
		},
	} as unknown as AudioContext;
	const load = createAudioLoader(context, {
		read: async () => {
			reads++;
			return original;
		},
	});
	const [music, effect] = await Promise.all([load('bgm', 'clip'), load('se', 'clip')]);
	assert.equal(music?.buffer, buffer);
	assert.equal(effect, music);
	assert.equal(reads, 1);
	assert.equal(decodes, 1);
});

test('audio loader retries a failed read and propagates its cause', async () => {
	let reads = 0;
	const context = { decodeAudioData: async () => ({ duration: 1 }) } as unknown as AudioContext;
	const load = createAudioLoader(context, {
		read: async () => {
			if (++reads === 1) throw new Error('missing clip');
			return new ArrayBuffer(0);
		},
	});
	await assert.rejects(load('se', 'clip'), /missing clip/);
	assert.ok(await load('se', 'clip'));
	assert.equal(reads, 2);
});

test('audio loader renders MIDI by header on a worker and preserves the loop region', async () => {
	const bytes = new Uint8Array([
		77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 77, 84, 114, 107, 0, 0, 0, 12, 0, 144, 60, 100, 96, 128, 60, 0,
		0, 255, 47, 0,
	]).buffer;
	let left: Float32Array | undefined;
	const context = {
		createBuffer: (_channels: number, length: number, sampleRate: number) => {
			const data = [new Float32Array(length), new Float32Array(length)];
			left = data[0];
			return { duration: length / sampleRate, getChannelData: (index: number) => data[index] };
		},
	} as unknown as AudioContext;
	const load = createAudioLoader(context, { read: async () => bytes, midi: { sampleRate: 8000, maxDuration: 1 } });
	const result = await load('bgm', 'extensionless');
	assert.ok(result && result.buffer.duration > 0);
	assert.deepEqual(result.loop, { start: 0, end: result.buffer.duration });
	assert.ok(left?.some((sample) => sample !== 0));
});
