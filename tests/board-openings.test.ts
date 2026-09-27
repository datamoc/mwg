import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startingChess, applyMove } from '../src/board/index.ts';
import { probeBook, parseUciMove, type OpeningBook } from '../src/board/index.ts';

const BOOK: OpeningBook = {
	version: 1,
	positions: {
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': {
			moves: ['b2b4', 'e2e4'],
		},
		'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq b3': {
			eco: 'A00',
			name: 'Polish Opening',
			moves: ['e7e5'],
		},
	},
};

test('probeBook names a booked position and misses past the book', () => {
	const entry = probeBook(BOOK, startingChess());
	assert.deepEqual(entry?.moves, ['b2b4', 'e2e4']);
	assert.equal(entry?.name, undefined, 'no line ends at the start');
	const polish = startingChess();
	applyMove(polish, { from: 9, to: 25 });
	assert.equal(probeBook(BOOK, polish)?.name, 'Polish Opening');
	assert.equal(probeBook(BOOK, { ...startingChess(), turn: 'black' }), null);
});

test('parseUciMove reads moves and promotions, and refuses garbage', () => {
	assert.deepEqual(parseUciMove('e2e4'), { from: 12, to: 28 });
	assert.deepEqual(parseUciMove('e7e8q'), { from: 52, to: 60, promotion: 'queen' });
	assert.throws(() => parseUciMove('e2e9'), /not a UCI move/);
	assert.throws(() => parseUciMove('junk'), /not a UCI move/);
	assert.throws(() => parseUciMove('e2e4x'), /not a UCI move/);
});
