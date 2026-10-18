import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import {
	bisectShareLink,
	decodeShareLink,
	dropByPriority,
	encodeShareLink,
	fitShareLink,
} from '../src/core/ShareLink.ts';

const ID = 'pontifex@1.2.0';

test('a link made and reopened gives back exactly the same state', async () => {
	const payload = { seed: 4242, items: ['sword', 'lamp'], level: 7, name: 'Zoë 🎲' };
	const link = await encodeShareLink({ type: 'state', id: ID, payload }, { base: 'https://example.org/play' });
	assert.match(link, /^https:\/\/example\.org\/play#mwg:[A-Za-z0-9_-]+$/);
	const read = await decodeShareLink(link);
	assert.deepEqual(read, { ok: true, type: 'state', id: ID, payload });
	assert.deepEqual(await decodeShareLink(link.slice(link.indexOf('#') + 1)), read, 'the bare fragment reads too');
});

test('the configured limit is never exceeded', async () => {
	const big = { text: Array.from({ length: 400 }, (_, i) => `word${i * 7919}`).join(' ') };
	await assert.rejects(encodeShareLink({ type: 'state', id: ID, payload: big }), /over the limit of 2000/);
	const roomy = await encodeShareLink({ type: 'state', id: ID, payload: big }, { maxChars: 4093 });
	assert.ok(roomy.length <= 4093);
	await assert.rejects(
		encodeShareLink({ type: 'state', id: ID, payload: {} }, { maxChars: 5000 }),
		/outside 1 to 4093/,
	);
	assert.deepEqual(await decodeShareLink(roomy, { maxChars: 100 }), { ok: false, reason: 'too-long' });
});

test('a link cut at any character is refused, never accepted as something else', async () => {
	const link = await encodeShareLink({ type: 'state', id: ID, payload: { seed: 1, equipment: 'a'.repeat(120) } });
	for (let cut = link.indexOf('#') + 1; cut < link.length; cut++) {
		const read = await decodeShareLink(link.slice(0, cut));
		assert.equal(read.ok, false, `cut at ${cut}`);
	}
	const flipped = link.slice(0, -3) + (link.at(-3) === 'A' ? 'B' : 'A') + link.slice(-2);
	assert.deepEqual(await decodeShareLink(flipped), { ok: false, reason: 'checksum' });
});

test('a decompression bomb stays inside the budget and does not break the reader', async () => {
	const body = Buffer.concat([
		Buffer.from([5]),
		Buffer.from('state'),
		Buffer.from([4]),
		Buffer.from('a@1.'),
		Buffer.from('"' + 'x'.repeat(2_500_000) + '"'),
	]);
	const packed = deflateRawSync(body);
	assert.ok(packed.length < 3000, 'a link that fits a message and expands into megabytes');
	const data = Buffer.concat([Buffer.from([(1 << 3) | (1 << 1) | 1]), packed]);
	const sum = crc(data);
	const raw = Buffer.concat([data, Buffer.from([sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255])]);
	const link = `#mwg:${raw.toString('base64url')}`;
	assert.deepEqual(await decodeShareLink(link, { maxChars: 4093, maxPayloadBytes: 100_000 }), {
		ok: false,
		reason: 'too-big',
	});
});

test('garbage, a foreign version, a refused package and a failed schema are all clean refusals', async () => {
	assert.equal((await decodeShareLink('https://example.org/')).ok, false);
	assert.deepEqual(await decodeShareLink('#mwg:!!!'), { ok: false, reason: 'malformed', detail: 'not base64url' });
	const link = await encodeShareLink({ type: 'state', id: ID, payload: { seed: 'nope' } });
	assert.deepEqual(await decodeShareLink(link, { accept: (_type, id) => id === 'pontifex@2.0.0' }), {
		ok: false,
		reason: 'refused',
	});
	const schema = await decodeShareLink<{ seed: number }>(link, {
		validate: (payload) => {
			if (typeof (payload as { seed: unknown }).seed !== 'number') throw new Error('seed must be a number');
			return payload as { seed: number };
		},
	});
	assert.deepEqual(schema, { ok: false, reason: 'schema', detail: 'seed must be a number' });
	const future = Buffer.from([2 << 3, 0, 0, 0, 0]).toString('base64url');
	assert.equal((await decodeShareLink(`#mwg:${future}`)).ok, false);
});

test('fitShareLink drops the least important fields until the link fits and says how many went', async () => {
	const record = {
		seed: 7,
		equipment: Array.from({ length: 300 }, (_, i) => `item-${i * 104729}`),
		decoration: 'x'.repeat(1500),
	};
	const ladder = dropByPriority(record, ['seed', 'equipment', 'decoration']);
	assert.deepEqual(
		ladder.map((step) => Object.keys(step)),
		[['seed', 'equipment', 'decoration'], ['seed', 'equipment'], ['seed']],
	);
	const fitted = await fitShareLink('state', ID, ladder, { maxChars: 600 });
	assert.ok(fitted.link.length <= 600);
	assert.ok(fitted.reductions >= 1);
	const read = await decodeShareLink<Record<string, unknown>>(fitted.link);
	assert.ok(read.ok && read.payload.seed === 7 && !('decoration' in read.payload), 'the seed always survives');
	await assert.rejects(
		fitShareLink(
			'state',
			ID,
			[
				{
					big: 'z'
						.repeat(5000)
						.split('')
						.map((_, i) => i),
				},
			],
			{ maxChars: 200 },
		),
		/over the limit/,
	);
});

test('bisectShareLink keeps the largest number of notes that fits and marks the cut', async () => {
	const notes = Array.from({ length: 800 }, (_, i) => [(i * 37) % 128, (i * 91) % 1000, 1 + (i % 9)]);
	const build = (kept: readonly number[][], truncated: boolean) => ({
		title: truncated ? 'Tune …' : 'Tune',
		notes: kept,
	});
	const { link, kept } = await bisectShareLink('music', ID, notes, build, { maxChars: 1500 });
	assert.ok(link.length <= 1500 && kept > 0 && kept < notes.length);
	const next = await encodeShareLink(
		{ type: 'music', id: ID, payload: build(notes.slice(0, kept + 1), true) },
		{ maxChars: 4093 },
	);
	assert.ok(next.length > 1500, 'one more note would not have fitted');
	const read = await decodeShareLink<{ title: string; notes: number[][] }>(link);
	assert.ok(read.ok && read.payload.title === 'Tune …' && read.payload.notes.length === kept);
	const small = await bisectShareLink('music', ID, notes.slice(0, 3), build);
	assert.equal(small.kept, 3);
});

/** CRC-32, the same polynomial the module checks with, so the bomb test can sign its own link */
function crc(bytes: Uint8Array): number {
	let value = 0xffffffff;
	for (const byte of bytes) {
		value ^= byte;
		for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return (value ^ 0xffffffff) >>> 0;
}
