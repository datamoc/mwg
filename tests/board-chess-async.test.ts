import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startingChess, parseFen, applyMove, gameResult, search, searchAsync } from '../src/board/index.ts';

test('searchAsync finds the same mate in one as search', async () => {
	const state = parseFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
	const expected = search(state, { depth: 2 });
	const actual = await searchAsync(state, { depth: 2 });
	assert.ok(actual.move);
	assert.deepEqual(actual.move, expected.move);
	assert.equal(actual.score, expected.score);
	assert.ok(actual.nodes > 0);

	applyMove(state, actual.move!);
	assert.equal(gameResult(state), 'white-wins');
});

test('searchAsync agrees with search on the opening at depth 2', async () => {
	const state = startingChess();
	const expected = search(state, { depth: 2 });
	const actual = await searchAsync(state, { depth: 2 });
	assert.deepEqual(actual.move, expected.move);
	assert.equal(actual.score, expected.score);
});

test('searchAsync is deterministic across lane counts on a midgame position', async () => {
	const state = parseFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
	const expected = search(state, { depth: 2 });
	const wide = await searchAsync(state, { depth: 2 });
	const narrow = await searchAsync(state, { depth: 2, jobs: 1 });
	assert.deepEqual(wide.move, expected.move);
	assert.deepEqual(narrow.move, expected.move);
	assert.equal(wide.score, expected.score);
});

test('searchAsync rejects when its signal is already aborted', async () => {
	const controller = new AbortController();
	controller.abort(controller.signal.reason);
	await assert.rejects(searchAsync(startingChess(), { depth: 2, signal: controller.signal }));
});

test('searchAsync validates its job count', async () => {
	await assert.rejects(searchAsync(startingChess(), { jobs: 0 }), /jobs must be a positive integer/);
	await assert.rejects(searchAsync(startingChess(), { jobs: 2.5 }), /jobs must be a positive integer/);
});
