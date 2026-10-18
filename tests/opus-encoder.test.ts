import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioExport } from '../src/audio/AudioExport.ts';
import { isOpusEncodingAvailable, oggOpus, webCodecsOpusEncoder } from '../src/audio/OpusEncoder.ts';

interface Page {
	type: number;
	granule: number;
	sequence: number;
	packets: Uint8Array[];
	crcOk: boolean;
}

/** a minimal Ogg reader for the tests: pages with their packets, and whether each CRC holds */
function readPages(bytes: Uint8Array): Page[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const pages: Page[] = [];
	for (let at = 0; at < bytes.length;) {
		assert.equal(String.fromCharCode(...bytes.subarray(at, at + 4)), 'OggS');
		const count = bytes[at + 26];
		const lacing = bytes.subarray(at + 27, at + 27 + count);
		const size = lacing.reduce((sum, value) => sum + value, 0);
		const end = at + 27 + count + size;
		const copy = bytes.slice(at, end);
		const stored = new DataView(copy.buffer).getUint32(22, true);
		new DataView(copy.buffer).setUint32(22, 0, true);
		const packets: Uint8Array[] = [];
		let cursor = at + 27 + count;
		let length = 0;
		for (const value of lacing) {
			length += value;
			if (value < 255) {
				packets.push(bytes.slice(cursor, cursor + length));
				cursor += length;
				length = 0;
			}
		}
		pages.push({
			type: bytes[at + 5],
			granule: view.getUint32(at + 6, true) + view.getUint32(at + 10, true) * 0x100000000,
			sequence: view.getUint32(at + 18, true),
			packets,
			crcOk: stored === crcOf(copy),
		});
		at = end;
	}
	return pages;
}

/** the Ogg CRC again, written out independently of the module under test */
function crcOf(bytes: Uint8Array): number {
	let crc = 0;
	for (const byte of bytes) {
		crc ^= byte << 24;
		for (let k = 0; k < 8; k++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
	}
	return crc >>> 0;
}

test('an Ogg Opus stream has a head, tags, audio pages with valid CRCs and a trimmed last granule', () => {
	const packets = Array.from({ length: 300 }, (_, i) => new Uint8Array(40 + (i % 7) * 60).fill(i & 255));
	const file = oggOpus(packets, { inputRate: 44100, totalSamples: 300 * 960 - 123, tags: { title: 'Harbour' } });
	const pages = readPages(file);
	assert.ok(
		pages.every((page) => page.crcOk),
		'every page checksum holds',
	);
	assert.deepEqual(
		pages.map((page) => page.sequence),
		pages.map((_, i) => i),
	);
	assert.equal(pages[0].type, 0x02, 'the first page is flagged as the start');
	const head = pages[0].packets[0];
	assert.equal(String.fromCharCode(...head.subarray(0, 8)), 'OpusHead');
	assert.equal(new DataView(head.buffer, head.byteOffset).getUint32(12, true), 44100);
	assert.match(new TextDecoder().decode(pages[1].packets[0]), /^OpusTags[\s\S]*TITLE=Harbour/);
	const audio = pages.slice(2);
	assert.ok(audio.length > 1, 'many packets spread over several pages');
	assert.deepEqual(
		audio.flatMap((page) => page.packets),
		packets,
		'every packet survives, whole and in order',
	);
	assert.equal(audio.at(-1)!.type, 0x04, 'the last page ends the stream');
	assert.equal(audio.at(-1)!.granule, 312 + 300 * 960 - 123, 'trimmed to the exact length, pre-skip included');
	assert.ok(
		audio.slice(1).every((page, i) => page.granule > audio[i].granule),
		'granules only grow',
	);
});

test('a packet larger than 255 bytes is laced across segments and an empty stream still ends', () => {
	const big = new Uint8Array(1000).fill(7);
	const [, , audio] = readPages(oggOpus([big], { inputRate: 8000, totalSamples: 960 }));
	assert.deepEqual(audio.packets, [big]);
	const empty = readPages(oggOpus([], { inputRate: 8000, totalSamples: 0 }));
	assert.equal(empty.at(-1)!.type, 0x04);
});

/** a stand-in for WebCodecs: each encoded 20 ms block comes out as a 3-byte packet, and the encoder reports its pre-skip */
function installFakeWebCodecs(): () => void {
	const scope = globalThis as unknown as Record<string, unknown>;
	const before = { encoder: scope.AudioEncoder, data: scope.AudioData };
	const description = new ArrayBuffer(19);
	new DataView(description).setUint16(10, 400, true);
	scope.AudioData = class {
		init: { data: Float32Array; numberOfFrames: number };
		constructor(init: { data: Float32Array; numberOfFrames: number }) {
			this.init = init;
		}
		close(): void {}
	};
	scope.AudioEncoder = class {
		handlers: { output: (chunk: unknown, metadata?: unknown) => void };
		constructor(handlers: { output: (chunk: unknown, metadata?: unknown) => void }) {
			this.handlers = handlers;
		}
		configure(config: Record<string, unknown>): void {
			(scope as { lastConfig?: unknown }).lastConfig = config;
		}
		encode(data: { init: { data: Float32Array } }): void {
			const peak = Math.max(...data.init.data.map(Math.abs));
			this.handlers.output(
				{ byteLength: 3, copyTo: (target: Uint8Array) => target.set([0xfc, Math.round(peak * 100), 0]) },
				{ decoderConfig: { description } },
			);
		}
		async flush(): Promise<void> {}
		close(): void {}
	};
	return () => {
		scope.AudioEncoder = before.encoder;
		scope.AudioData = before.data;
	};
}

test('the WebCodecs encoder resamples to 48 kHz, takes the encoder pre-skip and tags the file', async () => {
	assert.equal(isOpusEncodingAvailable(), false, 'plain Node has no AudioEncoder');
	await assert.rejects(
		async () =>
			webCodecsOpusEncoder(
				{ sampleRate: 8000, left: new Float32Array(8), right: new Float32Array(8) },
				{ format: 'opus', tags: {} },
			),
		/no WebCodecs/,
	);
	const restore = installFakeWebCodecs();
	try {
		assert.equal(isOpusEncodingAvailable(), true);
		const left = new Float32Array(8000).fill(0.5);
		const service = new AudioExport({
			encoders: { opus: webCodecsOpusEncoder },
			defaultTags: { album: 'Pontifex' },
		});
		const progress: number[] = [];
		const bytes = await service.export(
			{ sampleRate: 8000, left, right: left.slice() },
			{ format: 'opus', bitrate: 64, onProgress: (f) => progress.push(f) },
		);
		assert.equal(
			(globalThis as { lastConfig?: { bitrate: number; sampleRate: number } }).lastConfig?.bitrate,
			64000,
		);
		const pages = readPages(bytes);
		assert.ok(pages.every((page) => page.crcOk));
		assert.match(new TextDecoder().decode(pages[1].packets[0]), /ALBUM=Pontifex/);
		const audio = pages.slice(2);
		const packets = audio.flatMap((page) => page.packets);
		assert.equal(packets.length, Math.ceil(48000 / 960), 'one packet per 20 ms of the resampled second');
		assert.equal(audio.at(-1)!.granule, 400 + 48000, 'the encoder pre-skip and the exact length');
		assert.equal(progress.at(-1), 1);
	} finally {
		restore();
	}
});
