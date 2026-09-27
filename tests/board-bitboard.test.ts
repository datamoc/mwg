import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startingChess, parseFen, legalMoves, applyMove, sq, type ChessState } from '../src/board/index.ts';
import {
	startingBitboard,
	bitboardFromChess,
	bitboardMoves,
	makeMove,
	unmakeMove,
	perft,
	type BitboardMove,
	type BitboardState,
} from '../src/board/index.ts';

/** comparable shape shared by both move lists: promotion sorts with the move */
function shape(move: { from: number; to: number; promotion?: string }): string {
	return `${move.from}-${move.to}${move.promotion ?? ''}`;
}

function moveSet(state: ChessState): string[] {
	return legalMoves(state).map(shape).sort();
}

function bitboardSet(board: BitboardState): string[] {
	return bitboardMoves(board).map(shape).sort();
}

function key(board: BitboardState): string {
	return [
		...board.pieces.map((pieces) => pieces.toString(16)),
		board.turn,
		board.castling,
		board.enPassant,
		board.halfmove,
		...board.kings,
	].join('|');
}

const POSITIONS: Array<{ name: string; fen: string }> = [
	{ name: 'opening', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
	{ name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
	{ name: 'position 3', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1' },
	{ name: 'position 4', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1' },
	{ name: 'mate in one', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1' },
	{ name: 'mated side to move', fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' },
	{ name: 'promotion', fen: '7k/P7/8/8/8/8/1K6/8 w - - 0 1' },
	{ name: 'en passant', fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3' },
	{ name: 'both castles ready', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' },
	{
		name: 'midgame',
		fen: 'r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
	},
];

for (const { name, fen } of POSITIONS) {
	test(`bitboards agree with chess.ts on every legal move: ${name}`, () => {
		const state = parseFen(fen);
		assert.deepEqual(bitboardSet(bitboardFromChess(state)), moveSet(state));
	});
}

test('bitboards agree with chess.ts twelve plies deep, then unmake back to the start', () => {
	const state = startingChess();
	const board = startingBitboard();
	const before = key(board);
	const undos: Array<{ move: BitboardMove; undo: ReturnType<typeof makeMove> }> = [];
	for (let ply = 0; ply < 12; ply++) {
		assert.deepEqual(bitboardSet(board), moveSet(state), `move sets diverge at ply ${ply}`);
		const move = bitboardMoves(board)[(ply * 7 + 3) % bitboardMoves(board).length];
		undos.push({ move, undo: makeMove(board, move) });
		applyMove(state, { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
	}
	assert.deepEqual(bitboardSet(board), moveSet(state), 'move sets diverge at ply 12');
	for (let ply = undos.length - 1; ply >= 0; ply--) {
		unmakeMove(board, undos[ply].move, undos[ply].undo);
	}
	assert.equal(key(board), before);
});

test('a bitboard survives a structured clone with its move list intact', () => {
	const board = bitboardFromChess(parseFen(POSITIONS[1].fen));
	const clone: BitboardState = structuredClone(board);
	assert.equal(key(clone), key(board));
	assert.deepEqual(bitboardSet(clone), bitboardSet(board));
});

test('makeMove refuses a square with no piece of its own on it', () => {
	const board = startingBitboard();
	assert.throws(() => makeMove(board, { from: sq('e4'), to: sq('e5') }), /no piece on/);
});

test('perft counts match the published node counts', () => {
	const start = startingBitboard();
	assert.equal(perft(start, 0), 1);
	assert.equal(perft(start, 1), 20);
	assert.equal(perft(start, 2), 400);
	assert.equal(perft(start, 3), 8902);
	assert.equal(perft(start, 4), 197281);
	assert.equal(key(start), key(startingBitboard()), 'perft must leave the position as it found it');

	const kiwipete = bitboardFromChess(parseFen(POSITIONS[1].fen));
	assert.equal(perft(kiwipete, 1), 48);
	assert.equal(perft(kiwipete, 2), 2039);
	assert.equal(perft(kiwipete, 3), 97862);

	const position3 = bitboardFromChess(parseFen(POSITIONS[2].fen));
	assert.equal(perft(position3, 1), 14);
	assert.equal(perft(position3, 2), 191);
	assert.equal(perft(position3, 3), 2812);

	const position4 = bitboardFromChess(parseFen(POSITIONS[3].fen));
	assert.equal(perft(position4, 1), 6);
	assert.equal(perft(position4, 2), 264);
	assert.equal(perft(position4, 3), 9467);
});

test('perft rejects a negative or fractional depth', () => {
	assert.throws(() => perft(startingBitboard(), -1), /non-negative integer/);
	assert.throws(() => perft(startingBitboard(), 1.5), /non-negative integer/);
});
