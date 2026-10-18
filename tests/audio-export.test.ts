import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	AUDIO_FORMATS,
	AudioExport,
	ExportTooLargeError,
	estimateExportBytes,
	exportTags,
	type ExportEncoderRequest,
} from '../src/audio/AudioExport.ts';
import { decodeWav } from '../src/audio/Wav.ts';

function tone(seconds: number, rate = 8000) {
	const left = new Float32Array(Math.round(seconds * rate)).map((_, i) => Math.sin(i / 10) * 0.5);
	return { sampleRate: rate, left, right: left.slice() };
}

test('wav is built in and round-trips; flac and opus appear only with an encoder', async () => {
	const frames = tone(0.25);
	const service = new AudioExport();
	assert.deepEqual(service.formats(), ['wav']);
	const decoded = decodeWav(await service.export(frames, { format: 'wav' }));
	assert.equal(decoded.sampleRate, 8000);
	assert.equal(decoded.left.length, frames.left.length);
	await assert.rejects(service.export(frames, { format: 'flac' }), /not available/);
});

test('an injected encoder gets the merged tags, and Opus is hidden when the device cannot encode it', async () => {
	let seen: ExportEncoderRequest | undefined;
	const encoder = (_: unknown, request: ExportEncoderRequest): Uint8Array => {
		seen = request;
		return new Uint8Array([1, 2, 3]);
	};
	let opusWorks = false;
	const service = new AudioExport({
		encoders: { flac: encoder, opus: encoder },
		opusAvailable: () => opusWorks,
		defaultTags: exportTags({ game: 'Pontifex', license: 'CC0-1.0' }),
	});
	assert.deepEqual(service.formats(), ['wav', 'flac']);
	await assert.rejects(service.export(tone(0.1), { format: 'opus' }), /not available/);
	opusWorks = true;
	assert.deepEqual(service.formats(), ['wav', 'flac', 'opus']);
	const bytes = await service.export(tone(0.1), {
		format: 'opus',
		bitrate: 96,
		tags: exportTags({ track: 'Harbour', license: 'CC-BY-4.0' }),
	});
	assert.deepEqual([...bytes], [1, 2, 3]);
	assert.equal(seen?.bitrate, 96);
	assert.deepEqual(
		seen?.tags,
		{ album: 'Pontifex', title: 'Harbour', license: 'CC-BY-4.0' },
		'the request wins over the defaults',
	);
});

test('a self-contained encoder runs on a worker thread, and a cancelled signal rejects', async () => {
	//self-contained by necessity: it is shipped to the worker as text
	const encoder = (frames: { left: Float32Array }, request: { format: string; tags: Record<string, string> }) =>
		Uint8Array.of(request.format === 'flac' ? 1 : 2, frames.left.length & 255, request.tags.title.length);
	const service = new AudioExport({ encoders: { flac: encoder as never }, inWorker: true });
	const bytes = await service.export(tone(0.1), { format: 'flac', tags: { title: 'abc' }, onProgress: () => {} });
	assert.deepEqual([...bytes], [1, 800 & 255, 3]);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(service.export(tone(0.1), { format: 'flac', signal: controller.signal }));
});

test('the size is checked before the encoder runs', async () => {
	let ran = false;
	const service = new AudioExport({
		maxBytes: 1000,
		encoders: {
			flac: () => {
				ran = true;
				return new Uint8Array();
			},
		},
	});
	await assert.rejects(service.export(tone(1), { format: 'wav' }), (error: unknown) => {
		assert.ok(error instanceof ExportTooLargeError);
		assert.equal(error.maxBytes, 1000);
		return true;
	});
	await assert.rejects(service.export(tone(1), { format: 'flac' }), ExportTooLargeError);
	assert.equal(ran, false);
});

test('estimates: WAV is about 10 MB a minute, Opus follows its bit rate, FLAC scales with depth', () => {
	const wav = estimateExportBytes({ format: 'wav' }, 60, 44100);
	assert.ok(wav > 10.5e6 && wav < 10.7e6);
	assert.equal(estimateExportBytes({ format: 'opus', bitrate: 64 }, 10, 48000), 80000);
	assert.ok(
		estimateExportBytes({ format: 'flac', bitsPerSample: 24 }, 10, 44100) >
			estimateExportBytes({ format: 'flac' }, 10, 44100),
	);
});

test('a cancelled export rejects with an AbortError, empty or ragged frames are refused', async () => {
	const service = new AudioExport();
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(service.export(tone(0.1), { format: 'wav', signal: controller.signal }), {
		name: 'AbortError',
	});
	await assert.rejects(
		service.export({ sampleRate: 8000, left: new Float32Array(), right: new Float32Array() }, { format: 'wav' }),
		/nothing to export/,
	);
	await assert.rejects(
		service.export({ sampleRate: 8000, left: new Float32Array(4), right: new Float32Array(3) }, { format: 'wav' }),
		/nothing to export/,
	);
});

test('save hands a typed blob to the saver under a safe name with the format extension', async () => {
	const saved: { blob: Blob; filename: string }[] = [];
	const service = new AudioExport({ saver: (blob, filename) => void saved.push({ blob, filename }) });
	const name = await service.save(tone(0.1), { format: 'wav', onProgress: () => {} }, '../Level 1: "Harbour"?');
	assert.equal(name, '_Level 1_ _Harbour_.wav');
	assert.equal(saved[0].filename, name);
	assert.equal(saved[0].blob.type, AUDIO_FORMATS.wav.mime);
	assert.ok(saved[0].blob.size > 44);
});
