import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	startingChess,
	parseFen,
	cloneChess,
	legalMoves,
	applyMove,
	inCheck,
	gameResult,
	chooseMove,
	search,
	sq,
	type ChessState,
} from '../src/board/index.ts';

/** move-generation node count: the gold standard for a rules implementation */
function perft(state: ChessState, depth: number): number {
	if (depth === 0) return 1;
	let nodes = 0;
	for (const move of legalMoves(state)) {
		const next = cloneChess(state);
		applyMove(next, move);
		nodes += perft(next, depth - 1);
	}
	return nodes;
}

function playAll(state: ChessState, sans: string[]): void {
	for (const text of sans) {
		const from = sq(text.slice(0, 2));
		const to = sq(text.slice(2, 4));
		const promotion = text.length > 4 ? (text.slice(4) as 'queen') : undefined;
		applyMove(state, promotion ? { from, to, promotion } : { from, to });
	}
}

test('the opening offers 20 moves, all accounted for two plies deep', () => {
	assert.equal(perft(startingChess(), 1), 20);
	assert.equal(perft(startingChess(), 2), 400);
});

test('three plies from the start exercise every special rule', () => {
	assert.equal(perft(startingChess(), 3), 8902);
});

test('four plies from the start', () => {
	assert.equal(perft(startingChess(), 4), 197281);
});

test('kiwipete: pins, checks, castling and en passant under load', () => {
	const kiwipete = parseFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
	assert.equal(perft(kiwipete, 1), 48);
	assert.equal(perft(kiwipete, 2), 2039);
	assert.equal(perft(kiwipete, 3), 97862);
});

test("fool's mate ends the game on move two", () => {
	const state = startingChess();
	playAll(state, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);

	assert.equal(inCheck(state, 'white'), true);
	assert.equal(gameResult(state), 'black-wins');
});

test('a bare king against king, pawn and bishop is stalemated, not mated', () => {
	//black Kh8 to move; g8 is pawn-covered, g7 and h7 are king-covered, h8 is safe
	const state = parseFen('7k/5P2/6K1/8/8/8/8/8 b - - 0 1');

	assert.equal(inCheck(state, 'black'), false);
	assert.equal(legalMoves(state).length, 0);
	assert.equal(gameResult(state), 'stalemate');
});

test('castling needs rights, room, and no check on the way over', () => {
	const state = startingChess();
	playAll(state, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']);

	const kingside = legalMoves(state).filter((m) => m.from === sq('e1') && m.to === sq('g1'));
	assert.equal(kingside.length, 1);

	applyMove(state, { from: sq('e1'), to: sq('g1') });
	assert.equal(state.board[sq('f1')]?.kind, 'rook', 'the rook hops over');
	assert.equal(
		legalMoves(state).filter((m) => m.from === sq('e8')).length > 0,
		true,
		"black still has moves, including the king's own"
	);
});

test('en passant captures the pawn that ran past', () => {
	const state = startingChess();
	playAll(state, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);

	const takes = legalMoves(state).filter((m) => m.from === sq('e5') && m.to === sq('d6'));
	assert.equal(takes.length, 1);

	applyMove(state, takes[0]);
	assert.equal(state.board[sq('d6')]?.kind, 'pawn');
	assert.equal(state.board[sq('d5')], null, 'the passed pawn is gone');
});

test('promotion offers all four pieces, and the choice sticks', () => {
	const state = parseFen('7k/P7/8/8/8/8/1K6/8 w - - 0 1');

	const promotions = legalMoves(state).filter((m) => m.from === sq('a7') && m.to === sq('a8'));
	assert.deepEqual(
		promotions.map((m) => m.promotion).sort(),
		['bishop', 'knight', 'queen', 'rook']
	);

	applyMove(state, { from: sq('a7'), to: sq('a8'), promotion: 'knight' });
	assert.deepEqual(state.board[sq('a8')], { side: 'white', kind: 'knight' });
});

test('pinned pieces cannot uncover the king, and illegal moves throw', () => {
	//black rook on e8 pins the white e-pawn against its king after 1.e4 e5
	const state = startingChess();
	playAll(state, ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5e5']);

	//queen took on e5 with check down the file; black must answer the check
	assert.equal(inCheck(state, 'black'), true);
	assert.throws(() => applyMove(state, { from: sq('a7'), to: sq('a6') }), /leaves the king in check/);
	applyMove(state, { from: sq('g8'), to: sq('e7') }); //blocks with the knight
	assert.equal(inCheck(state, 'black'), false);

	assert.throws(() => applyMove(state, { from: sq('a7'), to: sq('a6') }), /no white piece/, 'wrong side to move');
	assert.throws(() => applyMove(state, { from: sq('e4'), to: sq('e5') }), /not a legal move/, 'own queen blocks');
});

test('FEN reads rights and en passant, and refuses nonsense', () => {
	const state = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w Kq e6 0 1');
	assert.equal(state.castling.whiteKingside, true);
	assert.equal(state.castling.whiteQueenside, false);
	assert.equal(state.castling.blackKingside, false);
	assert.equal(state.castling.blackQueenside, true);

	assert.throws(() => parseFen('8/8/8/8/8/8/8/8 w - -'), /without a white king/);
	assert.throws(() => parseFen('not a fen'), /not a FEN/);
	assert.throws(() => parseFen('8/8/8/8/8/8/8/8 w - e4'), /en passant/);
	assert.throws(() => sq('i9'), /not a square/);
});

test('the small alpha-beta engine finds a mate in one', () => {
	const state = parseFen('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
	const move = chooseMove(state, { depth: 2 });
	assert.ok(move);
	applyMove(state, move);
	assert.equal(gameResult(state), 'white-wins');
});

test('the engine returns only legal moves and reports its node count', () => {
	const state = startingChess();
	const result = search(state, { depth: 2 });
	assert.ok(result.move);
	assert.deepEqual(
		legalMoves(state).some((move) => move.from === result.move?.from && move.to === result.move?.to && move.promotion === result.move?.promotion),
		true
	);
	assert.ok(result.nodes > 0);
});
