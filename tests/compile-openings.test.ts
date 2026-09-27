import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseFen, startingChess, applyMove } from '../src/board/index.ts';
import { probeBook } from '../src/board/index.ts';
import { sanTokens, sanToUci, lineToUci, compileBook } from '../tools/compile-openings.mjs';

test('sanTokens strips move numbers and keeps the moves', () => {
	assert.deepEqual(sanTokens('1. e4 e5 2. Nf3'), ['e4', 'e5', 'Nf3']);
	assert.deepEqual(sanTokens('1.e4 e5 2.Nf3'), ['e4', 'e5', 'Nf3']);
});

test("lineToUci replays Scholar's mate, check mark and all", () => {
	assert.deepEqual(lineToUci('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#', 'scholars mate'), [
		'e2e4',
		'e7e5',
		'd1h5',
		'b8c6',
		'f1c4',
		'g8f6',
		'h5f7',
	]);
});

test('lineToUci understands castling and disambiguation', () => {
	const uci = lineToUci(
		'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2',
		'ruy lopez',
	);
	assert.equal(uci[8], 'e1g1', 'white castles kingside');
	assert.equal(uci[15], 'e8g8', 'black castles kingside');
	assert.equal(uci[uci.length - 1], 'b1d2', 'the b-knight is disambiguated');
});

test('sanToUci reads promotions with and without the equals sign', () => {
	const queen = parseFen('7k/P7/8/8/8/8/1K6/8 w - - 0 1');
	assert.equal(sanToUci(queen, 'a8=Q', 'promotion'), 'a7a8q');
	const knight = parseFen('1r5k/P7/8/8/8/8/1K6/8 w - - 0 1');
	assert.equal(sanToUci(knight, 'axb8=N', 'underpromotion'), 'a7b8n');
});

test('sanToUci throws with the row instead of guessing', () => {
	assert.throws(() => sanToUci(startingChess(), 'Qh5', 'blocked queen'), /matches 0 moves/);
	assert.throws(() => sanToUci(startingChess(), 'ZZZ', 'gibberish'), /cannot parse/);
});

test('compileBook keys positions by longest line and keeps every continuation', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'mwg-openings-'));
	try {
		await writeFile(
			join(dir, 'x.tsv'),
			['eco\tname\tpgn', 'C20\tKing Pawn Game\t1. e4 e5', 'C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4'].join(
				'\n',
			),
		);
		const book = compileBook(dir);
		const start = probeBook(book, startingChess());
		assert.deepEqual(start?.moves, ['e2e4']);
		assert.equal(start?.name, undefined, 'no line ends at the start');
		const afterE4E5 = startingChess();
		applyMove(afterE4E5, { from: 12, to: 28 });
		applyMove(afterE4E5, { from: 52, to: 36 });
		assert.equal(probeBook(book, afterE4E5)?.name, 'King Pawn Game', 'the line ending here names it');
		assert.deepEqual(probeBook(book, afterE4E5)?.moves, ['g1f3']);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
