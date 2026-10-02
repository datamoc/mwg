import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFen, legalMoves, cloneChess, applyMove } from '../src/board/chess.ts';
import { bitboardFromChess } from '../src/board/bitboard.ts';
import { searchTourney, searchTourneyAsync, tourneyThink } from '../src/board/tourney.ts';
import { spawn } from '../src/threads/index.ts';

const MATE_IN_ONE = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('tourney finds mate in one and scores near mate, not material', () => {
	const result = searchTourney(parseFen(MATE_IN_ONE), { depth: 2 });
	assert.deepEqual([result.move?.from, result.move?.to], [53, 60]);
	assert.ok(result.score > 99_000);
});

test('tourney reports stalemate as no move with a drawn score', () => {
	const result = searchTourney(parseFen(STALEMATE), { depth: 2 });
	assert.equal(result.move, null);
	assert.equal(result.score, 0);
});

test('tourney is deterministic across repeated searches', () => {
	const first = searchTourney(parseFen(START), { depth: 2 });
	const second = searchTourney(parseFen(START), { depth: 2 });
	assert.deepEqual(second.move, first.move);
	assert.equal(second.score, first.score);
	assert.equal(first.depth, 2);
});

test('tourney respects a tiny node budget instead of searching past it', () => {
	const result = searchTourney(parseFen(START), { depth: 3, maxNodes: 10 });
	assert.equal(result.move, null);
	assert.equal(result.depth, 0);
	assert.ok(result.nodes <= 10 + 128);
});

test('tourney answers from a ChessState as well as from bitboards', () => {
	const fromFen = searchTourney(parseFen(MATE_IN_ONE), { depth: 2 });
	const fromBitboard = searchTourney(bitboardFromChess(parseFen(MATE_IN_ONE)), { depth: 2 });
	assert.deepEqual(fromBitboard.move, fromFen.move);
	assert.equal(fromBitboard.score, fromFen.score);
});

test('tourneyThink survives a worker round-trip with its answer intact', async () => {
	const position = bitboardFromChess(parseFen(MATE_IN_ONE));
	const sync = tourneyThink(position, { depth: 2 });
	const task = await spawn(tourneyThink, [position, { depth: 2 }]);
	assert.deepEqual(task.move, sync.move);
	assert.equal(task.score, sync.score);
});

test('tourney async agrees with sync on a forced mate', async () => {
	const sync = searchTourney(parseFen(MATE_IN_ONE), { depth: 2 });
	const asyncResult = await searchTourneyAsync(parseFen(MATE_IN_ONE), { depth: 2, jobs: 2 });
	assert.deepEqual(asyncResult.move, sync.move);
	assert.ok(asyncResult.score > 99_000);
});

test('tourney async rejects an aborted signal and refuses zero jobs', async () => {
	const controller = new AbortController();
	controller.abort(new Error('stop'));
	await assert.rejects(searchTourneyAsync(parseFen(START), { depth: 2, signal: controller.signal }));
	await assert.rejects(searchTourneyAsync(parseFen(START), { depth: 2, jobs: 0 }), RangeError);
});

test('tourney async exposes every root score in the mover view without changing the position', async () => {
	const state = parseFen(START);
	const original = cloneChess(state);
	const result = await searchTourneyAsync(state, { depth: 2, jobs: 2 });
	assert.deepEqual(state, original);
	assert.equal(result.rootScores?.length, legalMoves(state).length);
	for (const entry of result.rootScores!) {
		assert.ok(legalMoves(state).some((move) => move.from === entry.move.from && move.to === entry.move.to));
		const child = cloneChess(state);
		applyMove(child, entry.move);
		assert.equal(entry.score, -searchTourney(child, { depth: 1 }).score);
	}
	const best = result.rootScores!.reduce((a, b) => (b.score > a.score ? b : a));
	assert.deepEqual(result.move, best.move);
	assert.equal(result.score, best.score);
});

test('tourney async returns no candidates for stalemate', async () => {
	const result = await searchTourneyAsync(parseFen(STALEMATE));
	assert.equal(result.move, null);
	assert.deepEqual(result.rootScores, []);
});

test('tourney sync answers nothing completed when already aborted', () => {
	const controller = new AbortController();
	controller.abort(new Error('stop'));
	const result = searchTourney(parseFen(START), { depth: 2, signal: controller.signal });
	assert.equal(result.move, null);
	assert.equal(result.depth, 0);
});
