import { bitboardFromChess, bitboardMoves, makeMove } from './bitboard.ts';
import type { BitboardMove, BitboardState } from './bitboard.ts';
import type { ChessState } from './chess.ts';
import { spawn } from '../threads/index.ts';

export interface TourneyOptions {
	/** plies to search; the iterative deepener completes 1..depth while the budget lasts */
	depth?: number;
	/** hard cap on visited positions; the best completed iteration is returned past it */
	maxNodes?: number;
	/** soft wall-clock budget in milliseconds; checked every few thousand nodes */
	timeMs?: number;
	/** aborting stops the search at the next check and keeps the best completed iteration */
	signal?: AbortSignal;
}

export interface TourneyAsyncOptions extends TourneyOptions {
	/** root moves searched at once (default: hardware threads capped at 8, else 4) */
	jobs?: number;
}

export interface TourneyResult {
	/** the move to play, null only with no legal moves */
	move: BitboardMove | null;
	/** centipawns from the side to move's view; mate scores near 100000, adjusted by distance */
	score: number;
	/** positions visited, quiescence included */
	nodes: number;
	/** the deepest fully completed iteration */
	depth: number;
	/** async search only: every legal root move and its score from the side to move's view, in root order */
	rootScores?: Array<{ move: BitboardMove; score: number }>;
}

/**
 * The tournament engine's serializable task: a full iterative-deepening search over a
 * bitboard position, with nothing outside its own body.
 *
 * `threads.spawn` rehydrates this function in a worker with `new Function`, so it may
 * not reference imports, module scope, or any outer binding: every rule it touches is
 * nested inside it. The main-thread wrappers call this same function directly, so the
 * two sides cannot diverge the way a copied worker body could.
 *
 * What it does, per Roadmap item 390 phase 1: negamax alpha-beta with principal
 * variation search, null-move pruning, late-move reductions, iterative deepening with
 * aspiration windows, a bounded transposition table over Zobrist keys, quiescence over
 * captures and promotions, ordering by hash move then MVV-LVA captures then killers
 * then history, and a classical material plus in-house piece-square evaluation.
 * Positions are plain bitboard data, so they structured-clone into a worker untouched.
 *
 * Draws: stalemate, fifty moves, KvK/KBvK/KNvK dead material, and repetition along the
 * search path all score 0. Repetition only sees the path from the searched position,
 * not the game before it; mate scores prefer the faster mate.
 */
export function tourneyThink(
	position: BitboardState,
	options: { depth?: number; maxNodes?: number; timeMs?: number; signal?: AbortSignal } = {},
): TourneyResult {
	const MATE = 100_000;
	const INFINITY = 1_000_000;
	const VALUES = [100, 320, 330, 500, 900, 0];
	const ASPIRATION = 24;
	const MAX_PLY = 64;

	const target = Math.max(1, Math.floor(options.depth ?? 3));
	const maxNodes = options.maxNodes === undefined ? 500_000 : Math.max(1, Math.floor(options.maxNodes));
	const deadline = options.timeMs === undefined ? -1 : Date.now() + Math.max(1, options.timeMs);

	const board: BitboardState = {
		pieces: position.pieces.slice(),
		turn: position.turn,
		castling: position.castling,
		enPassant: position.enPassant,
		halfmove: position.halfmove,
		kings: [position.kings[0], position.kings[1]],
	};

	function bit(square: number): bigint {
		return 1n << BigInt(square);
	}

	function bitIndex(single: bigint): number {
		return Math.log2(Number(single));
	}

	const KNIGHT_STEPS: Array<readonly [number, number]> = [
		[1, 2],
		[2, 1],
		[2, -1],
		[1, -2],
		[-1, -2],
		[-2, -1],
		[-2, 1],
		[-1, 2],
	];
	const KING_STEPS: Array<readonly [number, number]> = [
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
		[0, -1],
		[1, -1],
	];
	const DIAGONALS: Array<readonly [number, number]> = [
		[1, 1],
		[-1, 1],
		[-1, -1],
		[1, -1],
	];
	const STRAIGHTS: Array<readonly [number, number]> = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0, -1],
	];

	function leaperTable(steps: Array<readonly [number, number]>): bigint[] {
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

	function occupancy(colorBase: number): bigint {
		return (
			board.pieces[colorBase] |
			board.pieces[colorBase + 1] |
			board.pieces[colorBase + 2] |
			board.pieces[colorBase + 3] |
			board.pieces[colorBase + 4] |
			board.pieces[colorBase + 5]
		);
	}

	function squareKind(square: number): number {
		const mask = bit(square);
		for (let i = 0; i < 12; i++) {
			if (board.pieces[i] & mask) return i % 6;
		}
		return -1;
	}

	function isAttacked(square: number, byWhite: boolean): boolean {
		const by = byWhite ? 0 : 6;
		const file = square & 7;
		const rank = square >> 3;
		const pawnRank = byWhite ? rank - 1 : rank + 1;
		for (const df of [-1, 1]) {
			const f = file + df;
			if (pawnRank >= 0 && pawnRank < 8 && f >= 0 && f < 8 && board.pieces[by] & bit(pawnRank * 8 + f))
				return true;
		}
		if (KNIGHT_TABLE[square] & board.pieces[by + 1]) return true;
		if (KING_TABLE[square] & board.pieces[by + 5]) return true;
		const rays = [
			{ steps: DIAGONALS, kinds: [2, 4] },
			{ steps: STRAIGHTS, kinds: [3, 4] },
		];
		for (const { steps, kinds } of rays) {
			for (const [df, dr] of steps) {
				let f = file + df;
				let r = rank + dr;
				while (f >= 0 && f < 8 && r >= 0 && r < 8) {
					const found = squareKind(r * 8 + f);
					if (found !== -1) {
						const owner = ((): number => {
							const mask = bit(r * 8 + f);
							for (let i = 0; i < 12; i++) {
								if (board.pieces[i] & mask) return i < 6 ? 0 : 1;
							}
							return -1;
						})();
						if (owner === (byWhite ? 0 : 1) && kinds.includes(found)) return true;
						break;
					}
					f += df;
					r += dr;
				}
			}
		}
		return false;
	}

	interface Undo {
		captured: { color: 0 | 1; kind: number } | null;
		castling: number;
		enPassant: number | null;
		halfmove: number;
		kingSquare: number;
		key: bigint;
		nullMove: boolean;
	}

	let key = 0n;
	let zstate = 0x9e3779b97f4a7c15n;
	function znext(): bigint {
		zstate = (zstate + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
		let z = zstate;
		z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
		z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
		return z ^ (z >> 31n);
	}
	const PIECE_KEYS: bigint[][] = Array.from({ length: 12 }, () => Array.from({ length: 64 }, () => znext()));
	const SIDE_KEY = znext();
	const CASTLE_KEYS = Array.from({ length: 16 }, () => znext());
	const EP_KEYS = Array.from({ length: 8 }, () => znext());

	function fullKey(): bigint {
		let k = 0n;
		for (let i = 0; i < 12; i++) {
			let bb = board.pieces[i];
			while (bb) {
				const single = bb & -bb;
				k ^= PIECE_KEYS[i][bitIndex(single)];
				bb ^= single;
			}
		}
		if (board.turn === 'black') k ^= SIDE_KEY;
		k ^= CASTLE_KEYS[board.castling];
		if (board.enPassant !== null) k ^= EP_KEYS[board.enPassant & 7];
		return k;
	}
	key = fullKey();

	function rightBit(side: 'white' | 'black', kingside: boolean): number {
		return side === 'white' ? (kingside ? 1 : 2) : kingside ? 4 : 8;
	}

	function doMove(move: { from: number; to: number; promotion?: string }): Undo {
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
		const undo: Undo = {
			captured: null,
			castling: board.castling,
			enPassant: board.enPassant,
			halfmove: board.halfmove,
			kingSquare: board.kings[us],
			key,
			nullMove: false,
		};
		const themBase = (1 - us) * 6;
		const dir = white ? 8 : -8;
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
		const home = white ? 0 : 56;
		const themHome = white ? 56 : 0;
		if (kind === 5) board.castling &= ~(rightBit(board.turn, true) | rightBit(board.turn, false));
		if (kind === 3 && (move.from === home || move.from === home + 7)) {
			board.castling &= ~rightBit(board.turn, move.from === home + 7);
		}
		if (
			undo.captured &&
			undo.captured.kind === 3 &&
			(capturedSquare === themHome || capturedSquare === themHome + 7)
		) {
			board.castling &= ~rightBit(white ? 'black' : 'white', capturedSquare === themHome + 7);
		}
		const PROMOTION_INDEX: Record<string, number> = { queen: 4, rook: 3, bishop: 2, knight: 1 };
		board.pieces[colorBase + kind] ^= fromBit;
		if (move.promotion) board.pieces[colorBase + PROMOTION_INDEX[move.promotion]] |= toBit;
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
		key = fullKey();
		return undo;
	}

	function undoMove(move: { from: number; to: number; promotion?: string }, undo: Undo): void {
		board.turn = board.turn === 'white' ? 'black' : 'white';
		const white = board.turn === 'white';
		const us = white ? 0 : 1;
		const colorBase = us * 6;
		const toBit = bit(move.to);
		const kind = move.promotion
			? 0
			: (() => {
					for (let k = 0; k < 6; k++) {
						if (board.pieces[colorBase + k] & toBit) return k;
					}
					return -1;
				})();
		const PROMOTION_INDEX: Record<string, number> = { queen: 4, rook: 3, bishop: 2, knight: 1 };
		if (move.promotion) board.pieces[colorBase + PROMOTION_INDEX[move.promotion]] ^= toBit;
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
		key = undo.key;
	}

	function doNull(): Undo {
		const undo: Undo = {
			captured: null,
			castling: board.castling,
			enPassant: board.enPassant,
			halfmove: board.halfmove,
			kingSquare: -1,
			key,
			nullMove: true,
		};
		board.enPassant = null;
		board.halfmove += 1;
		board.turn = board.turn === 'white' ? 'black' : 'white';
		key = fullKey();
		return undo;
	}

	function undoNull(undo: Undo): void {
		board.turn = board.turn === 'white' ? 'black' : 'white';
		board.enPassant = undo.enPassant;
		board.halfmove = undo.halfmove;
		key = undo.key;
	}

	interface Pseudo {
		from: number;
		to: number;
		promotion?: 'queen' | 'rook' | 'bishop' | 'knight';
	}

	function pseudoMoves(from: number, kind: number, all: bigint, enemy: bigint, out: Pseudo[]): void {
		const white = board.turn === 'white';
		const file = from & 7;
		const rank = from >> 3;
		const push = (to: number, promotion?: 'queen' | 'rook' | 'bishop' | 'knight'): void => {
			out.push(promotion ? { from, to, promotion } : { from, to });
		};
		const slide = (steps: Array<readonly [number, number]>): void => {
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
		const PROMOTIONS: Array<'queen' | 'rook' | 'bishop' | 'knight'> = ['queen', 'rook', 'bishop', 'knight'];
		if (kind === 0) {
			const dir = white ? 8 : -8;
			const home = white ? 1 : 6;
			const last = white ? 7 : 0;
			const one = from + dir;
			if (one >= 0 && one < 64 && !(all & bit(one))) {
				if (one >> 3 === last) {
					for (const promotion of PROMOTIONS) push(one, promotion);
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
						for (const promotion of PROMOTIONS) push(to, promotion);
					} else push(to);
				} else if (to === board.enPassant) push(to);
			}
		} else if (kind === 1) {
			let targets = KNIGHT_TABLE[from] & ~occupancy(white ? 0 : 6);
			while (targets) {
				const single = targets & -targets;
				push(bitIndex(single));
				targets ^= single;
			}
		} else if (kind === 2) slide(DIAGONALS);
		else if (kind === 3) slide(STRAIGHTS);
		else if (kind === 4) {
			slide(DIAGONALS);
			slide(STRAIGHTS);
		} else {
			let targets = KING_TABLE[from] & ~occupancy(white ? 0 : 6);
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
			if (from === home + 4 && !isAttacked(from, !white)) {
				if (
					kingside &&
					!(all & bit(home + 5)) &&
					!(all & bit(home + 6)) &&
					!isAttacked(home + 5, !white) &&
					!isAttacked(home + 6, !white)
				) {
					push(home + 6);
				}
				if (
					queenside &&
					!(all & bit(home + 3)) &&
					!(all & bit(home + 2)) &&
					!(all & bit(home + 1)) &&
					!isAttacked(home + 3, !white) &&
					!isAttacked(home + 2, !white)
				) {
					push(home + 2);
				}
			}
		}
	}

	function legalMoves(): Pseudo[] {
		const white = board.turn === 'white';
		const us = white ? 0 : 6;
		const own = occupancy(us);
		const enemy = occupancy(us === 0 ? 6 : 0);
		const all = own | enemy;
		const out: Pseudo[] = [];
		const pseudo: Pseudo[] = [];
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
			pseudoMoves(from, kind, all, enemy, pseudo);
			for (const move of pseudo) {
				const undo = doMove(move);
				if (!isAttacked(board.kings[white ? 0 : 1], !white)) out.push({ ...move });
				undoMove(move, undo);
			}
		}
		return out;
	}

	function hasNonPawnMaterial(white: boolean): boolean {
		const base = white ? 0 : 6;
		return (
			board.pieces[base + 1] !== 0n ||
			board.pieces[base + 2] !== 0n ||
			board.pieces[base + 3] !== 0n ||
			board.pieces[base + 4] !== 0n
		);
	}

	function deadMaterial(): boolean {
		let count = 0;
		let minor = 0;
		for (let i = 0; i < 12; i++) {
			if (i % 6 === 5) continue;
			let bb = board.pieces[i];
			while (bb) {
				bb &= bb - 1n;
				count++;
				if (i % 6 === 1 || i % 6 === 2) minor++;
			}
		}
		if (count === 0) return true;
		return count === 1 && minor === 1;
	}

	function endgamePhase(): boolean {
		let queens = 0;
		let other = 0;
		for (let i = 0; i < 12; i++) {
			let bb = board.pieces[i];
			while (bb) {
				bb &= bb - 1n;
				if (i % 6 === 4) queens++;
				else if (i % 6 !== 5 && i % 6 !== 0) other++;
			}
		}
		return queens === 0 || (queens === 2 && other <= 2);
	}

	function pieceSquare(kind: number, square: number, white: boolean, endgame: boolean): number {
		const file = square & 7;
		const rank = white ? square >> 3 : 7 - (square >> 3);
		const centerFile = 3.5 - Math.abs(file - 3.5);
		const centerRank = 3.5 - Math.abs(rank - 3.5);
		if (kind === 0) return (rank - 1) * 12 + Math.max(0, centerFile) * 4;
		if (kind === 1) return (centerFile + centerRank) * 6 - 12;
		if (kind === 2) return (centerFile + centerRank) * 4;
		if (kind === 3) return (centerFile + centerRank) * 2 + (rank === 6 ? 12 : 0);
		if (kind === 4) return (centerFile + centerRank) * 2;
		return endgame ? (centerFile + centerRank) * 10 : -rank * 10 + centerFile * 2;
	}

	function evaluate(): number {
		const endgame = endgamePhase();
		let score = 0;
		for (let i = 0; i < 12; i++) {
			const whitePiece = i < 6;
			const kind = i % 6;
			let bb = board.pieces[i];
			while (bb) {
				const single = bb & -bb;
				const square = bitIndex(single);
				const value = VALUES[kind] + pieceSquare(kind, square, whitePiece, endgame);
				score += whitePiece ? value : -value;
				bb ^= single;
			}
		}
		return board.turn === 'white' ? score : -score;
	}

	const TT_SIZE = 65536;
	const ttKey = new Array<bigint>(TT_SIZE).fill(-1n);
	const ttDepth = new Array<number>(TT_SIZE).fill(-1);
	const ttScore = new Array<number>(TT_SIZE).fill(0);
	const ttFlag = new Array<number>(TT_SIZE).fill(0);
	const ttMove = new Array<number>(TT_SIZE).fill(0);

	function encodeMove(move: Pseudo): number {
		const promo =
			move.promotion === 'queen'
				? 1
				: move.promotion === 'rook'
					? 2
					: move.promotion === 'bishop'
						? 3
						: move.promotion === 'knight'
							? 4
							: 0;
		return move.from | (move.to << 6) | (promo << 12);
	}

	function ttProbe(depth: number, alpha: number, beta: number, ply: number): { score: number | null; move: number } {
		const slot = Number(key & BigInt(TT_SIZE - 1));
		if (ttKey[slot] !== key) return { score: null, move: 0 };
		const move = ttMove[slot];
		if (ttDepth[slot] < depth) return { score: null, move };
		let score = ttScore[slot];
		if (score > MATE - 1000) score -= ply;
		else if (score < -(MATE - 1000)) score += ply;
		const flag = ttFlag[slot];
		if (flag === 0) return { score, move };
		if (flag === 1 && score >= beta) return { score, move };
		if (flag === 2 && score <= alpha) return { score, move };
		return { score: null, move };
	}

	function ttStore(depth: number, score: number, flag: number, move: number, ply: number): void {
		const slot = Number(key & BigInt(TT_SIZE - 1));
		if (ttKey[slot] === key && ttDepth[slot] > depth) return;
		let stored = score;
		if (score > MATE - 1000) stored += ply;
		else if (score < -(MATE - 1000)) stored -= ply;
		ttKey[slot] = key;
		ttDepth[slot] = depth;
		ttScore[slot] = stored;
		ttFlag[slot] = flag;
		ttMove[slot] = move;
	}

	const killers: number[][] = Array.from({ length: MAX_PLY }, () => [0, 0]);
	const history: number[][][] = Array.from({ length: 2 }, () =>
		Array.from({ length: 64 }, () => new Array<number>(64).fill(0)),
	);

	function victimOn(square: number): number {
		const white = board.turn === 'white';
		const themBase = white ? 6 : 0;
		const mask = bit(square);
		for (let k = 4; k >= 0; k--) {
			if (board.pieces[themBase + k] & mask) return k;
		}
		return -1;
	}

	function orderMoves(moves: Pseudo[], tt: number, ply: number): number[] {
		const white = board.turn === 'white';
		const color = white ? 0 : 1;
		const scored = moves.map((move) => {
			const encoded = encodeMove(move);
			if (encoded === tt) return 3_000_000;
			const victim = victimOn(move.to);
			const attacker = squareKind(move.from);
			const isEp = move.to === board.enPassant && attacker === 0;
			if (victim !== -1 || isEp) {
				const victimValue = isEp ? VALUES[0] : VALUES[victim];
				let value = 2_000_000 + victimValue * 8 - attacker;
				if (move.promotion) value += 900;
				return value;
			}
			if (move.promotion) return 1_500_000;
			if (ply < MAX_PLY) {
				if (killers[ply][0] === encoded) return 1_000_000;
				if (killers[ply][1] === encoded) return 900_000;
				return history[color][move.from][move.to];
			}
			return 0;
		});
		const order = moves.map((_, index) => index);
		for (let i = 0; i < order.length; i++) {
			let best = i;
			for (let j = i + 1; j < order.length; j++) {
				if (scored[order[j]] > scored[order[best]]) best = j;
			}
			[order[i], order[best]] = [order[best], order[i]];
		}
		return order;
	}

	let nodes = 0;
	let stopped = false;
	const pathKeys: bigint[] = [];

	function checkStop(): boolean {
		if (stopped) return true;
		if (nodes > maxNodes) {
			stopped = true;
			return true;
		}
		if (options.signal?.aborted) {
			stopped = true;
			return true;
		}
		if (deadline !== -1 && (nodes & 2047) === 0 && Date.now() >= deadline) {
			stopped = true;
			return true;
		}
		return false;
	}

	function quiescence(alpha: number, beta: number, ply: number): number {
		nodes++;
		if (checkStop()) return 0;
		const white = board.turn === 'white';
		if (board.halfmove >= 100 || deadMaterial()) return 0;
		if (isAttacked(board.kings[white ? 0 : 1], !white)) {
			return search(1, alpha, beta, ply, false);
		}
		const standPat = evaluate();
		if (standPat >= beta) return beta;
		if (standPat > alpha) alpha = standPat;
		const moves = legalMoves().filter((move) => {
			if (move.promotion) return true;
			if (move.to === board.enPassant && squareKind(move.from) === 0) return true;
			const themBase = white ? 6 : 0;
			const mask = bit(move.to);
			for (let k = 0; k < 5; k++) {
				if (board.pieces[themBase + k] & mask) return true;
			}
			return false;
		});
		const order = orderMoves(moves, 0, Math.min(ply, MAX_PLY - 1));
		for (const index of order) {
			const move = moves[index];
			const victim = victimOn(move.to);
			if (standPat + (victim === -1 ? 900 : VALUES[victim]) + 200 < alpha) continue;
			const undo = doMove(move);
			pathKeys.push(key);
			const score = -quiescence(-beta, -alpha, ply + 1);
			pathKeys.pop();
			undoMove(move, undo);
			if (stopped) return 0;
			if (score >= beta) return beta;
			if (score > alpha) alpha = score;
		}
		return alpha;
	}

	function search(depth: number, alpha: number, beta: number, ply: number, allowNull: boolean): number {
		nodes++;
		if (checkStop()) return 0;
		const white = board.turn === 'white';
		if (board.halfmove >= 100 || deadMaterial()) return 0;
		let repetitions = 0;
		for (const past of pathKeys) {
			if (past === key && ++repetitions >= 2) return 0;
		}
		if (ply >= MAX_PLY) return evaluate();
		if (depth <= 0) return quiescence(alpha, beta, ply);
		const inCheck = isAttacked(board.kings[white ? 0 : 1], !white);
		const probe = ttProbe(depth, alpha, beta, ply);
		if (probe.score !== null) return probe.score;
		if (inCheck) {
			allowNull = false;
		} else if (allowNull && depth >= 3 && hasNonPawnMaterial(white) && beta < MATE - 1000) {
			const reduction = depth > 4 ? 3 : 2;
			const undo = doNull();
			pathKeys.push(key);
			const score = -search(depth - 1 - reduction, -beta, -beta + 1, ply + 1, false);
			pathKeys.pop();
			undoNull(undo);
			if (stopped) return 0;
			if (score >= beta) return beta;
		}
		const moves = legalMoves();
		if (moves.length === 0) return inCheck ? -(MATE - ply) : 0;
		const order = orderMoves(moves, probe.move, Math.min(ply, MAX_PLY - 1));
		const color = white ? 0 : 1;
		let best = -INFINITY;
		let bestMove = 0;
		let flag = 2;
		for (let i = 0; i < order.length; i++) {
			const move = moves[order[i]];
			const encoded = encodeMove(move);
			const capture = victimOn(move.to) !== -1 || (move.to === board.enPassant && squareKind(move.from) === 0);
			const undo = doMove(move);
			pathKeys.push(key);
			let score: number;
			if (i === 0) {
				score = -search(depth - 1, -beta, -alpha, ply + 1, true);
			} else {
				let reduction = 0;
				if (depth >= 3 && i >= 4 && !capture && !move.promotion && !inCheck) reduction = 1;
				if (reduction > 0) {
					score = -search(depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true);
					if (!stopped && score > alpha) {
						score = -search(depth - 1, -beta, -alpha, ply + 1, true);
					}
				} else {
					score = -search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
					if (!stopped && score > alpha && score < beta) {
						score = -search(depth - 1, -beta, -alpha, ply + 1, true);
					}
				}
			}
			pathKeys.pop();
			undoMove(move, undo);
			if (stopped) return 0;
			if (score > best) {
				best = score;
				bestMove = encoded;
			}
			if (score > alpha) {
				alpha = score;
				flag = score >= beta ? 1 : 0;
				if (!capture && !move.promotion && ply < MAX_PLY) {
					history[color][move.from][move.to] += depth * depth;
					if (killers[ply][0] !== encoded) {
						killers[ply][1] = killers[ply][0];
						killers[ply][0] = encoded;
					}
				}
			}
			if (alpha >= beta) break;
		}
		ttStore(depth, best, flag, bestMove, ply);
		return best;
	}

	const rootMoves = legalMoves();
	if (rootMoves.length === 0) {
		const white = board.turn === 'white';
		const mated = isAttacked(board.kings[white ? 0 : 1], !white);
		return { move: null, score: mated ? -MATE : 0, nodes, depth: 0 };
	}
	pathKeys.push(key);
	let best: BitboardMove = {
		from: rootMoves[0].from,
		to: rootMoves[0].to,
		...(rootMoves[0].promotion ? { promotion: rootMoves[0].promotion as BitboardMove['promotion'] } : {}),
	};
	let bestScore = -INFINITY;
	let completed = 0;
	let ordered = rootMoves.map((move) => ({ ...move }));
	for (let depth = 1; depth <= target; depth++) {
		let alpha = -INFINITY;
		let beta = INFINITY;
		let windowed = false;
		let iterationBest = best;
		let iterationScore = bestScore;
		if (depth >= 4 && completed > 0) {
			windowed = true;
			alpha = bestScore - ASPIRATION;
			beta = bestScore + ASPIRATION;
		}
		for (let attempt = 0; attempt < 3; attempt++) {
			const alphaEdge = alpha;
			const betaEdge = beta;
			let roundBest = iterationBest;
			let roundScore = -INFINITY;
			const order = orderMoves(
				ordered,
				encodeMove({ from: iterationBest.from, to: iterationBest.to, promotion: iterationBest.promotion }),
				0,
			);
			const round: typeof ordered = [];
			for (let i = 0; i < order.length; i++) {
				const move = ordered[order[i]];
				const undo = doMove(move);
				pathKeys.push(key);
				let score: number;
				if (i === 0) {
					score = -search(depth - 1, -beta, -alpha, 1, true);
				} else {
					score = -search(depth - 1, -alpha - 1, -alpha, 1, true);
					if (!stopped && score > alpha && score < beta) {
						score = -search(depth - 1, -beta, -alpha, 1, true);
					}
				}
				pathKeys.pop();
				undoMove(move, undo);
				if (stopped) break;
				round.push(move);
				if (score > roundScore) {
					roundScore = score;
					roundBest = move;
				}
				if (score > alpha) alpha = score;
			}
			if (stopped) break;
			for (const move of ordered) {
				if (!round.includes(move)) round.push(move);
			}
			ordered = round;
			iterationBest = roundBest;
			iterationScore = roundScore;
			if (!windowed) break;
			if (roundScore <= alphaEdge || roundScore >= betaEdge) {
				alpha = -INFINITY;
				beta = INFINITY;
				windowed = false;
				continue;
			}
			break;
		}
		if (stopped) break;
		best = iterationBest;
		bestScore = iterationScore;
		ordered = [best, ...ordered.filter((move) => move !== best)];
		completed = depth;
		if (bestScore > MATE - 1000 || bestScore < -(MATE - 1000)) break;
		if (checkStop()) break;
	}
	pathKeys.pop();
	if (completed === 0) return { move: null, score: evaluate(), nodes, depth: 0 };
	return { move: best, score: bestScore, nodes, depth: completed };
}

function toBitboard(state: ChessState | BitboardState): BitboardState {
	const board = 'pieces' in state ? state : bitboardFromChess(state);
	return {
		pieces: board.pieces.slice(),
		turn: board.turn,
		castling: board.castling,
		enPassant: board.enPassant,
		halfmove: board.halfmove,
		kings: [board.kings[0], board.kings[1]],
	};
}

/**
 * Chooses a move with the tournament search: the same `tourneyThink` task the
 * workers run, called directly, so one implementation serves both sides.
 *
 * This is the stronger engine beside `board/Engine`'s small deterministic one: the
 * minigame path keeps the small search and never pays for this module. Scores are
 * centipawns from the side to move's view; mate scores sit near 100000, adjusted so
 * the faster mate scores higher.
 *
 * @example
 * ```ts
 * import { searchTourney, startingBitboard, tourneyThink } from '@datamoc/mw_games/board';
 *
 * const direct = tourneyThink(startingBitboard(), { depth: 1 });
 * const result = searchTourney(startingBitboard(), { depth: 2 });
 * console.log(direct.move !== null && result.move !== null); // true - the opening position always has legal moves
 * ```
 */
export function searchTourney(state: ChessState | BitboardState, options: TourneyOptions = {}): TourneyResult {
	return tourneyThink(toBitboard(state), {
		depth: options.depth,
		maxNodes: options.maxNodes,
		timeMs: options.timeMs,
		signal: options.signal,
	});
}

/** hardware threads for a root split, capped: twenty opening moves need lanes, not a storm */
function defaultTourneyJobs(): number {
	const scope = globalThis as {
		navigator?: { hardwareConcurrency?: unknown };
		process?: { getBuiltinModule?: (id: string) => { availableParallelism?: () => unknown } | undefined };
	};
	const concurrent = scope.navigator?.hardwareConcurrency;
	if (typeof concurrent === 'number' && Number.isInteger(concurrent) && concurrent > 0) {
		return Math.min(concurrent, 8);
	}
	try {
		const parallelism = scope.process?.getBuiltinModule?.('node:os')?.availableParallelism?.();
		if (typeof parallelism === 'number' && Number.isInteger(parallelism) && parallelism > 0) {
			return Math.min(parallelism, 8);
		}
	} catch {
		//a search must never fail for lack of a hint about its own host
	}
	return 4;
}

/**
 * Chooses a move the way `searchTourney` does, but thinks on worker threads through
 * `threads.spawn`, so a deep search does not drop the caller's frames. Each root move
 * is a self-contained `tourneyThink` task over a structured-cloned bitboard, scored
 * concurrently down a capped lane queue; the best child score from the opponent's
 * view is the worst for us, so the root plays the move whose child scored lowest,
 * with ties going to the earlier root move. `rootScores` exposes every candidate so
 * games can choose near-best moves without repeating the search on the UI thread.
 * An aborting signal rejects through
 * `threads.spawn` and terminates the workers.
 *
 * @example
 * ```ts
 * import { searchTourneyAsync, startingBitboard } from '@datamoc/mw_games/board';
 *
 * const result = await searchTourneyAsync(startingBitboard(), { depth: 2 });
 * console.log(result.move !== null); // true - the opening position always has legal moves
 * ```
 */
export async function searchTourneyAsync(
	state: ChessState | BitboardState,
	options: TourneyAsyncOptions = {},
): Promise<TourneyResult> {
	const depth = Math.max(1, Math.floor(options.depth ?? 3));
	const maxNodes = options.maxNodes === undefined ? 500_000 : Math.max(1, Math.floor(options.maxNodes));
	const jobs = options.jobs ?? defaultTourneyJobs();
	if (!Number.isInteger(jobs) || jobs < 1) throw new RangeError('jobs must be a positive integer');
	if (options.signal?.aborted) throw options.signal.reason;
	const root = toBitboard(state);
	const moves = bitboardMoves(root);
	if (!moves.length) return { ...tourneyThink(root, { depth, maxNodes }), rootScores: [] };
	//one chain per lane over the shared move queue, the tools/compress-dist.mjs shape:
	//scores land by index, so ties break in root order no matter who finishes first
	const lanes = Math.max(1, Math.min(jobs, moves.length));
	const children: BitboardState[] = moves.map((move) => {
		const child = toBitboard(root);
		makeMove(child, move);
		return child;
	});
	const scores = new Array<number | undefined>(moves.length);
	let nodes = 0;
	let next = 0;
	const spawnOptions = options.signal ? { signal: options.signal } : {};
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			for (;;) {
				const index = next++;
				if (index >= moves.length) return;
				const task = await spawn(
					tourneyThink,
					[children[index], { depth: Math.max(1, depth - 1), maxNodes, timeMs: options.timeMs }],
					spawnOptions,
				);
				nodes += task.nodes;
				scores[index] = -task.score;
			}
		}),
	);
	let bestIndex = 0;
	for (let i = 1; i < moves.length; i++) {
		if ((scores[i] ?? -Infinity) > (scores[bestIndex] ?? -Infinity)) bestIndex = i;
	}
	const best = moves[bestIndex];
	return {
		move: { from: best.from, to: best.to, ...(best.promotion ? { promotion: best.promotion } : {}) },
		score: scores[bestIndex] ?? 0,
		nodes,
		depth,
		rootScores: moves.map((move, index) => ({
			move: { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) },
			score: scores[index] ?? 0,
		})),
	};
}
