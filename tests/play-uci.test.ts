import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadTablebaseEnding, positionKey, startingChess } from '../src/board/index.ts';
import { createUciSession } from '../tools/play-uci.mjs';

const TABLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tablebases');
const tables = { KQK: loadTablebaseEnding(JSON.parse(readFileSync(join(TABLES, 'KQK.json'), 'utf8'))) };

const run = (session: { input: (line: string) => string[] }, lines: string[]): string[] =>
	lines.flatMap((line) => session.input(line));

test('uci answers the handshake and readiness without a position', () => {
	const session = createUciSession();
	assert.deepEqual(run(session, ['uci']), ['id name mwg tourney', 'uciok']);
	assert.deepEqual(run(session, ['isready']), ['readyok']);
});

test('uci plays the opening move search finds from startpos', () => {
	const session = createUciSession({ depth: 1 });
	const out = run(session, ['position startpos', 'go depth 1']);
	assert.match(out[out.length - 1], /^bestmove [a-h][1-8][a-h][1-8][qrbn]?$/);
});

test('uci mates in one through the tablebase without searching', () => {
	const session = createUciSession({ tables });
	const out = run(session, ['position fen 7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', 'go depth 1']);
	assert.ok(out.includes('info string tablebase'));
	assert.ok(out.includes('bestmove f7e8'));
});

test('uci prefers the compiled book over its own search', () => {
	const session = createUciSession({
		book: { version: 1, positions: { [positionKey(startingChess())]: { moves: ['e2e4'] } } },
		depth: 1,
	});
	const out = run(session, ['position startpos', 'go depth 1']);
	assert.ok(out.includes('bestmove e2e4'));
});

test('uci reports illegal moves and unknown commands instead of dying', () => {
	const session = createUciSession({ depth: 1 });
	assert.deepEqual(run(session, ['position startpos moves e2e5']), ['info string illegal move: e2e5']);
	assert.deepEqual(run(session, ['dance']), ['info string unknown command: dance']);
	assert.deepEqual(run(session, ['position fen nope']), ['info string bad fen: nope']);
	const out = run(session, ['position startpos', 'go depth 1']);
	assert.match(out[out.length - 1], /^bestmove /);
});

test('uci answers 0000 with no legal moves', () => {
	const session = createUciSession({ depth: 1 });
	const out = run(session, ['position fen 7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'go depth 1']);
	assert.ok(out.includes('bestmove 0000'));
});
