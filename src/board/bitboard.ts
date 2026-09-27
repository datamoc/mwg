import { startingChess, type ChessKind, type ChessSide, type ChessState, type PromotionKind } from './chess.ts';

/**
 * Chess on bitboards: the first slice of the tournament engine (item 390).
 *
 * Twelve 64-bit boards (`pieces[color * 6 + kind]`, white 0-5, black 6-11, square 0 is
 * a1 exactly like `chess.ts`), side to move, castling rights, en passant square, the
 * halfmove clock and both king squares. Everything in it is plain data (`bigint`
 * included), so a position structured-clones into a worker untouched.
 *
 * Two implementations of the rules now exist on purpose: `chess.ts` is the readable
 * reference a minigame runs directly, this one is the fast mutable board a search
 * makes and unmakes millions of times. `tests/board-bitboard.test.ts` keeps them
 * honest two ways: every legal move of one is a legal move of the other on a suite of
 * positions, and perft counts match the published node counts.
 */

export interface BitboardState {
	/** twelve bitboards: white pawn..king, then black pawn..king */
	pieces: bigint[];
	turn: ChessSide;
	/** castling rights as a mask: 1 white kingside, 2 white queenside, 4 black kingside, 8 black queenside */
	castling: number;
	/** a square a pawn could capture onto, left behind by a double push */
	enPassant: number | null;
	halfmove: number;
	/** king squares, white then black: maintained on every move, so checks never scan */
	kings: [number, number];
}

export interface BitboardMove {
	from: number;
	to: number;
	promotion?: PromotionKind;
}

/** everything `makeMove` changes besides the moved piece, handed back to `unmakeMove` */
export interface BitboardUndo {
	captured: { color: 0 | 1; kind: number } | null;
	castling: number;
	enPassant: number | null;
	halfmove: number;
	kingSquare: number;
}

const KIND_INDEX: Record<ChessKind, number> = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5 };
const PROMOTION_ORDER: PromotionKind[] = ['queen', 'rook', 'bishop', 'knight'];

const KNIGHT_STEPS: ReadonlyArray<readonly [number, number]> = [
	[1, 2],
	[2, 1],
	[2, -1],
	[1, -2],
	[-1, -2],
	[-2, -1],
	[-2, 1],
	[-1, 2],
];
const KING_STEPS: ReadonlyArray<readonly [number, number]> = [
	[1, 0],
	[1, 1],
	[0, 1],
	[-1, 1],
	[-1, 0],
	[-1, -1],
	[0, -1],
	[1, -1],
];
const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
	[1, 1],
	[-1, 1],
	[-1, -1],
	[1, -1],
];
const STRAIGHTS: ReadonlyArray<readonly [number, number]> = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
];

/** the single bit for a square */
function bit(square: number): bigint {
	return 1n << BigInt(square);
}

/** exact index of a single-bit board: powers of two survive the trip through Number */
function bitIndex(single: bigint): number {
	return Math.log2(Number(single));
}

function leaperTable(steps: ReadonlyArray<readonly [number, number]>): bigint[] {
	return Array.from({ length: 64 }, (_, square) => {
		const file = square & 7;
		const rank = square >> 3;
		let attacks = 0n;
		for (const [df, dr] of steps) {
			const f = file + df;
			const r = rank + dr;
			if (f >= 0 && f < 8 && r >= 0 && r < 8) attacks |= bit(r * 8 + f);
		}
		return attacks;
	});
}

const KNIGHT_TABLE = leaperTable(KNIGHT_STEPS);
const KING_TABLE = leaperTable(KING_STEPS);

function occupancyOf(board: BitboardState, colorBase: number): bigint {
	return (
		board.pieces[colorBase] |
		board.pieces[colorBase + 1] |
		board.pieces[colorBase + 2] |
		board.pieces[colorBase + 3] |
		board.pieces[colorBase + 4] |
		board.pieces[colorBase + 5]
	);
}

/** piece-board index holding the square, or -1 */
function squareBoard(board: BitboardState, square: number): number {
	const mask = bit(square);
	for (let i = 0; i < 12; i++) {
		if (board.pieces[i] & mask) return i;
	}
	return -1;
}

/** true when `byWhite` attacks the square, whatever its own king thinks of the move */
function isAttacked(board: BitboardState, square: number, byWhite: boolean): boolean {
	const by = byWhite ? 0 : 6;
	const file = square & 7;
	const rank = square >> 3;
	//pawns attack one step diagonally towards the other side
	const pawnRank = byWhite ? rank - 1 : rank + 1;
	for (const df of [-1, 1]) {
		const f = file + df;
		if (pawnRank >= 0 && pawnRank < 8 && f >= 0 && f < 8 && board.pieces[by] & bit(pawnRank * 8 + f)) return true;
	}
	if (KNIGHT_TABLE[square] & board.pieces[by + 1]) return true;
	if (KING_TABLE[square] & board.pieces[by + 5]) return true;
	//sliders see until something stands in the way
	const rays: Array<{ steps: ReadonlyArray<readonly [number, number]>; kinds: number[] }> = [
		{ steps: DIAGONALS, kinds: [2, 4] },
		{ steps: STRAIGHTS, kinds: [3, 4] },
	];
	for (const { steps, kinds } of rays) {
		for (const [df, dr] of steps) {
			let f = file + df;
			let r = rank + dr;
			while (f >= 0 && f < 8 && r >= 0 && r < 8) {
				const found = squareBoard(board, r * 8 + f);
				if (found !== -1) {
					if (found >= by && found < by + 6 && kinds.includes(found - by)) return true;
					break;
				}
				f += df;
				r += dr;
			}
		}
	}
	return false;
}

function rightBit(side: ChessSide, kingside: boolean): number {
	return side === 'white' ? (kingside ? 1 : 2) : kingside ? 4 : 8;
}

/**
 * Reads a `chess.ts` position onto bitboards: the bridge the differential tests cross
 * in both directions, and the way a FEN reaches the fast board.
 *
 * @example
 * ```ts
 * import { bitboardFromChess, bitboardMoves, startingChess } from '@datamoc/mw_games/board';
 *
 * const moves = bitboardMoves(bitboardFromChess(startingChess()));
 * console.log(moves.length); // 20 - the opening position's own count
 * ```
 */
export function bitboardFromChess(state: ChessState): BitboardState {
	const pieces = new Array<bigint>(12).fill(0n);
	const kings: [number, number] = [-1, -1];
	state.board.forEach((piece, square) => {
		if (!piece) return;
		const index = (piece.side === 'white' ? 0 : 6) + KIND_INDEX[piece.kind];
		pieces[index] |= bit(square);
		if (piece.kind === 'king') kings[piece.side === 'white' ? 0 : 1] = square;
	});
	if (kings[0] === -1 || kings[1] === -1) throw new Error('a position without both kings cannot go on bitboards');
	return {
		pieces,
		turn: state.turn,
		castling:
			(state.castling.whiteKingside ? 1 : 0) |
			(state.castling.whiteQueenside ? 2 : 0) |
			(state.castling.blackKingside ? 4 : 0) |
			(state.castling.blackQueenside ? 8 : 0),
		enPassant: state.enPassant,
		halfmove: 0,
		kings,
	};
}

/**
 * The standard opening array on bitboards, white to move with every right intact.
 *
 * @example
 * ```ts
 * import { bitboardMoves, startingBitboard } from '@datamoc/mw_games/board';
 *
 * console.log(bitboardMoves(startingBitboard()).length); // 20 - 16 pawn moves, 4 knight moves
 * ```
 */
export function startingBitboard(): BitboardState {
	return bitboardFromChess(startingChess());
}

/**
 * Every legal move for the side to play, in stable square order: pseudo-moves that leave
 * their own king safe, each tried with `makeMove` and taken back with `unmakeMove`.
 * Castling needs its rights, an empty passage and no check on the way over; en passant
 * pins fall out of the make-and-test filter rather than special-casing.
 *
 * @example
 * ```ts
 * import { bitboardMoves, startingBitboard } from '@datamoc/mw_games/board';
 *
 * const moves = bitboardMoves(startingBitboard());
 * console.log(moves.every((move) => move.from >= 0 && move.to < 64)); // true
 * ```
 */
export function bitboardMoves(board: BitboardState): BitboardMove[] {
	const white = board.turn === 'white';
	const us = white ? 0 : 6;
	const own = occupancyOf(board, us);
	const enemy = occupancyOf(board, us === 0 ? 6 : 0);
	const all = own | enemy;
	const out: BitboardMove[] = [];
	const pseudo: BitboardMove[] = [];
	for (let from = 0; from < 64; from++) {
		if (!(own & bit(from))) continue;
		let kind = -1;
		for (let k = 0; k < 6; k++) {
			if (board.pieces[us + k] & bit(from)) {
				kind = k;
				break;
			}
		}
		pseudo.length = 0;
		pseudoMoves(board, from, kind, all, enemy, pseudo);
		for (const move of pseudo) {
			const undo = makeMove(board, move);
			if (!isAttacked(board, board.kings[white ? 0 : 1], !white)) out.push({ ...move });
			unmakeMove(board, move, undo);
		}
	}
	return out;
}

/** pseudo-moves for the piece on `from`, ignoring its own king; castling checks rights and passage */
function pseudoMoves(
	board: BitboardState,
	from: number,
	kind: number,
	all: bigint,
	enemy: bigint,
	out: BitboardMove[],
): void {
	const white = board.turn === 'white';
	const file = from & 7;
	const rank = from >> 3;
	const push = (to: number, promotion?: PromotionKind): void => {
		out.push(promotion ? { from, to, promotion } : { from, to });
	};
	const slide = (steps: ReadonlyArray<readonly [number, number]>): void => {
		for (const [df, dr] of steps) {
			let f = file + df;
			let r = rank + dr;
			while (f >= 0 && f < 8 && r >= 0 && r < 8) {
				const to = r * 8 + f;
				const mask = bit(to);
				if (!(all & mask)) push(to);
				else {
					if (enemy & mask) push(to);
					break;
				}
				f += df;
				r += dr;
			}
		}
	};
	switch (kind) {
		case 0: {
			const dir = white ? 8 : -8;
			const home = white ? 1 : 6;
			const last = white ? 7 : 0;
			const one = from + dir;
			if (one >= 0 && one < 64 && !(all & bit(one))) {
				if (one >> 3 === last) {
					for (const promotion of PROMOTION_ORDER) push(one, promotion);
				} else {
					push(one);
					const two = from + 2 * dir;
					if (rank === home && !(all & bit(two))) push(two);
				}
			}
			for (const df of [-1, 1]) {
				const f = file + df;
				if (f < 0 || f > 7) continue;
				const to = from + dir + df;
				if (to < 0 || to >= 64) continue;
				const mask = bit(to);
				if (enemy & mask) {
					if (to >> 3 === last) {
						for (const promotion of PROMOTION_ORDER) push(to, promotion);
					} else push(to);
				} else if (to === board.enPassant) push(to);
			}
			break;
		}
		case 1: {
			let targets = KNIGHT_TABLE[from] & ~occupancyOf(board, white ? 0 : 6);
			while (targets) {
				const single = targets & -targets;
				push(bitIndex(single));
				targets ^= single;
			}
			break;
		}
		case 2:
			slide(DIAGONALS);
			break;
		case 3:
			slide(STRAIGHTS);
			break;
		case 4:
			slide(DIAGONALS);
			slide(STRAIGHTS);
			break;
		case 5: {
			let targets = KING_TABLE[from] & ~occupancyOf(board, white ? 0 : 6);
			//never capture the other king: kings are never adjacent after a legal move
			targets &= ~board.pieces[white ? 11 : 5];
			while (targets) {
				const single = targets & -targets;
				push(bitIndex(single));
				targets ^= single;
			}
			const home = white ? 0 : 56;
			const rights = board.castling;
			const kingside = white ? rights & 1 : rights & 4;
			const queenside = white ? rights & 2 : rights & 8;
			if (from === home + 4 && !isAttacked(board, from, !white)) {
				if (
					kingside &&
					!(all & bit(home + 5)) &&
					!(all & bit(home + 6)) &&
					!isAttacked(board, home + 5, !white) &&
					!isAttacked(board, home + 6, !white)
				) {
					push(home + 6);
				}
				if (
					queenside &&
					!(all & bit(home + 3)) &&
					!(all & bit(home + 2)) &&
					!(all & bit(home + 1)) &&
					!isAttacked(board, home + 3, !white) &&
					!isAttacked(board, home + 2, !white)
				) {
					push(home + 2);
				}
			}
			break;
		}
	}
}

/**
 * Plays a move, mutating the position, and returns what `unmakeMove` needs to take it
 * back. Special moves are read off the position rather than flagged on the move: a pawn
 * onto the en passant square captures the pawn behind it, a king stepping two squares
 * swings its rook, a pawn stride of sixteen leaves a square behind it.
 *
 * @example
 * ```ts
 * import { bitboardMoves, makeMove, startingBitboard, unmakeMove } from '@datamoc/mw_games/board';
 *
 * const board = startingBitboard();
 * const move = bitboardMoves(board)[0];
 * const undo = makeMove(board, move);
 * console.log(board.turn); // 'black' - the move is played
 * unmakeMove(board, move, undo);
 * ```
 */
export function makeMove(board: BitboardState, move: BitboardMove): BitboardUndo {
	const white = board.turn === 'white';
	const us = white ? 0 : 1;
	const colorBase = us * 6;
	const fromBit = bit(move.from);
	const toBit = bit(move.to);
	let kind = -1;
	for (let k = 0; k < 6; k++) {
		if (board.pieces[colorBase + k] & fromBit) {
			kind = k;
			break;
		}
	}
	if (kind === -1) throw new Error(`no piece on ${move.from} to move`);
	const undo: BitboardUndo = {
		captured: null,
		castling: board.castling,
		enPassant: board.enPassant,
		halfmove: board.halfmove,
		kingSquare: board.kings[us],
	};
	const themBase = (1 - us) * 6;
	const dir = white ? 8 : -8;
	//a pawn onto the en passant square takes the pawn behind it, not the empty square
	let capturedSquare = move.to;
	if (kind === 0 && move.to === board.enPassant) capturedSquare = move.to - dir;
	const capturedBit = bit(capturedSquare);
	for (let k = 0; k < 6; k++) {
		if (board.pieces[themBase + k] & capturedBit) {
			undo.captured = { color: (1 - us) as 0 | 1, kind: k };
			board.pieces[themBase + k] ^= capturedBit;
			break;
		}
	}
	//castling rights die with the king's first step, a rook's, or a captured rook's
	const home = white ? 0 : 56;
	const themHome = white ? 56 : 0;
	if (kind === 5) board.castling &= ~(rightBit(board.turn, true) | rightBit(board.turn, false));
	if (kind === 3 && (move.from === home || move.from === home + 7)) {
		board.castling &= ~rightBit(board.turn, move.from === home + 7);
	}
	if (undo.captured?.kind === 3 && (capturedSquare === themHome || capturedSquare === themHome + 7)) {
		board.castling &= ~rightBit(white ? 'black' : 'white', capturedSquare === themHome + 7);
	}
	board.pieces[colorBase + kind] ^= fromBit;
	if (move.promotion) board.pieces[colorBase + KIND_INDEX[move.promotion]] |= toBit;
	else board.pieces[colorBase + kind] |= toBit;
	if (kind === 5 && Math.abs(move.to - move.from) === 2) {
		const rook = colorBase + 3;
		if (move.to > move.from) board.pieces[rook] ^= bit(home + 7) | bit(home + 5);
		else board.pieces[rook] ^= bit(home) | bit(home + 3);
	}
	board.enPassant = kind === 0 && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
	board.halfmove = kind === 0 || undo.captured ? 0 : board.halfmove + 1;
	if (kind === 5) board.kings[us] = move.to;
	board.turn = white ? 'black' : 'white';
	return undo;
}

/**
 * Takes back exactly what `makeMove` played: the mover returns, the taken piece (or the
 * en passant pawn behind the landing square) is restored, and rights, en passant
 * square, halfmove clock and king square come back from the undo.
 *
 * @example
 * ```ts
 * import { bitboardMoves, makeMove, startingBitboard, unmakeMove } from '@datamoc/mw_games/board';
 *
 * const board = startingBitboard();
 * const move = bitboardMoves(board)[0];
 * const undo = makeMove(board, move);
 * unmakeMove(board, move, undo);
 * console.log(board.turn, bitboardMoves(board).length); // 'white' 20 - taken back whole
 * ```
 */
export function unmakeMove(board: BitboardState, move: BitboardMove, undo: BitboardUndo): void {
	board.turn = board.turn === 'white' ? 'black' : 'white';
	const white = board.turn === 'white';
	const us = white ? 0 : 1;
	const colorBase = us * 6;
	const toBit = bit(move.to);
	//a promotion leaves a pawn to restore, anything else the piece standing on `to`
	const kind = move.promotion
		? 0
		: (() => {
				for (let k = 0; k < 6; k++) {
					if (board.pieces[colorBase + k] & toBit) return k;
				}
				throw new Error(`nothing on ${move.to} to take back`);
			})();
	if (move.promotion) board.pieces[colorBase + KIND_INDEX[move.promotion]] ^= toBit;
	else board.pieces[colorBase + kind] ^= toBit;
	board.pieces[colorBase + kind] |= bit(move.from);
	if (kind === 5 && Math.abs(move.to - move.from) === 2) {
		const home = white ? 0 : 56;
		const rook = colorBase + 3;
		if (move.to > move.from) board.pieces[rook] ^= bit(home + 7) | bit(home + 5);
		else board.pieces[rook] ^= bit(home) | bit(home + 3);
	}
	if (undo.captured) {
		const dir = white ? 8 : -8;
		const square = kind === 0 && move.to === undo.enPassant ? move.to - dir : move.to;
		board.pieces[(1 - us) * 6 + undo.captured.kind] |= bit(square);
	}
	board.castling = undo.castling;
	board.enPassant = undo.enPassant;
	board.halfmove = undo.halfmove;
	board.kings[us] = undo.kingSquare;
}

/**
 * Move-generation node count: 1 at depth 0, else the sum over every legal move. The
 * position is played and taken back as it goes, so it reads identical afterwards.
 * Counts match the published perft numbers, which is the whole point: a wrong move
 * generator cannot hide from them.
 *
 * @example
 * ```ts
 * import { perft, startingBitboard } from '@datamoc/mw_games/board';
 *
 * console.log(perft(startingBitboard(), 2)); // 400 - the opening's two-ply count
 * ```
 */
export function perft(board: BitboardState, depth: number): number {
	if (!Number.isInteger(depth) || depth < 0) throw new RangeError('perft depth must be a non-negative integer');
	if (depth === 0) return 1;
	let nodes = 0;
	for (const move of bitboardMoves(board)) {
		const undo = makeMove(board, move);
		nodes += perft(board, depth - 1);
		unmakeMove(board, move, undo);
	}
	return nodes;
}
