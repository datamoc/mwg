import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFen } from '../src/board/chess.ts';
import { bitboardFromChess } from '../src/board/bitboard.ts';
import { huffDecode, huffEncode, loadTablebaseEnding, probeTablebase, tablebaseId } from '../src/board/index.ts';
import { tablebaseTask } from '../tools/build-tablebases.mjs';

const TABLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tablebases');
const load = (id: string) => loadTablebaseEnding(JSON.parse(readFileSync(join(TABLES, `${id}.json`), 'utf8')));

test('huffman codec round-trips bytes and single-symbol runs', () => {
	assert.deepEqual(huffDecode(huffEncode(new Uint8Array([2, 2, 2, 3]))), new Uint8Array([2, 2, 2, 3]));
	assert.deepEqual(huffDecode(huffEncode(new Uint8Array(1000).fill(2))), new Uint8Array(1000).fill(2));
	assert.deepEqual(huffDecode(huffEncode(new Uint8Array([]))), new Uint8Array([]));
});

test('huffman decode fails corrupt input instead of guessing', () => {
	assert.throws(() => huffDecode('AQ=='), /header/);
	assert.throws(
		() => loadTablebaseEnding({ version: 1, id: 'KBK', white: ['bishop'], positions: 2, wdl: 'x', dtm: 'x' }),
		/positions/,
	);
});

test('tablebaseId names endings strongest-first whatever the order', () => {
	assert.equal(tablebaseId(['bishop', 'queen']), 'KQBK');
	assert.equal(tablebaseId(['knight']), 'KNK');
});

test('the generator solves lone-bishop endings as all draws', () => {
	const result = tablebaseTask({ white: ['bishop'] }, null);
	assert.equal(result.positions, 524288);
	assert.ok(result.wdl.every((value: number) => value === 2));
	const rawDtm = new Uint16Array(result.dtm);
	const dtmBytes = new Uint8Array(rawDtm.length * 2);
	for (let i = 0; i < rawDtm.length; i++) {
		dtmBytes[2 * i] = rawDtm[i] & 255;
		dtmBytes[2 * i + 1] = rawDtm[i] >> 8;
	}
	const loaded = loadTablebaseEnding({
		version: 1,
		id: 'KBK',
		white: ['bishop'],
		positions: result.positions,
		wdl: huffEncode(Uint8Array.from(result.wdl)),
		dtm: huffEncode(dtmBytes),
	});
	assert.equal(loaded.id, 'KBK');
	assert.equal(probeTablebase({ KBK: loaded }, parseFen('k7/8/8/8/8/8/8/K6B w - - 0 1'))?.outcome, 'draw');
});

test('the shipped KQK table reports mate in one as win at distance one', () => {
	const loaded = { KQK: load('KQK') };
	const probe = probeTablebase(loaded, parseFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1'));
	assert.deepEqual(probe, { outcome: 'win', dtm: 1 });
});

test('the probe adjudicates the fifty-move clock instead of ignoring it', () => {
	const loaded = { KQK: load('KQK') };
	const position = parseFen('k7/8/8/8/8/8/8/K6Q w - - 0 1');
	assert.equal(probeTablebase(loaded, position)?.outcome, 'win');
	assert.equal(probeTablebase(loaded, position, 90)?.outcome, 'draw');
	assert.throws(() => probeTablebase(loaded, position, -1), RangeError);
});

test('the probe misses anything outside the shipped scope, never errors', () => {
	const loaded = { KQK: load('KQK') };
	assert.equal(probeTablebase({}, parseFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1')), null);
	assert.equal(probeTablebase(loaded, parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')), null);
	assert.equal(probeTablebase(loaded, parseFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1')), null);
});

test('the probe reads bitboard positions as well as rule positions', () => {
	const loaded = { KQK: load('KQK') };
	const fromFen = parseFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
	assert.deepEqual(probeTablebase(loaded, bitboardFromChess(fromFen)), probeTablebase(loaded, fromFen));
});

test('loading refuses a mistyped id, a wrong count and a short payload', () => {
	const good = JSON.parse(readFileSync(join(TABLES, 'KBK.json'), 'utf8'));
	assert.throws(() => loadTablebaseEnding({ ...good, id: 'KQK' }), /does not match/);
	assert.throws(() => loadTablebaseEnding({ ...good, positions: 4 }), /claims 4/);
	assert.throws(() => loadTablebaseEnding({ ...good, wdl: huffEncode(new Uint8Array([2, 2])) }), /decodes to 2/);
	assert.throws(() => loadTablebaseEnding({ ...good, version: 2 }), /version 2/);
});
