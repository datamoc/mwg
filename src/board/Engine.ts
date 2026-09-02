import {
	applyMove,
	cloneChess,
	gameResult,
	inCheck,
	legalMoves,
	type ChessMove,
	type ChessPiece,
	type ChessState,
} from './chess.ts';

export interface ChessEngineOptions {
	/** plies to search; three is a useful small browser default */
	depth?: number;
	/** optional hard cap on visited positions */
	maxNodes?: number;
}

export interface ChessSearchResult {
	move: ChessMove | null;
	score: number;
	nodes: number;
}

const MATE = 100_000;
const PIECE_VALUE: Record<ChessPiece['kind'], number> = {
	pawn: 100,
	knight: 320,
	bishop: 330,
	rook: 500,
	queen: 900,
	king: 0,
};

/**
 * Chooses a move with a small negamax alpha-beta search.
 *
 * This is intentionally a rules engine, not a tournament engine: it searches legal
 * positions, orders captures and promotions first, and evaluates material only. It has
 * no opening book, transposition table, clock, or repetition scoring, which keeps it
 * deterministic and small enough to run synchronously in a browser minigame.
 */
export function chooseMove(state: ChessState, options: ChessEngineOptions = {}): ChessMove | null {
	return search(state, options).move;
}

export function search(state: ChessState, options: ChessEngineOptions = {}): ChessSearchResult {
	const depth = Math.max(1, Math.floor(options.depth ?? 3));
	const maxNodes = options.maxNodes === undefined ? Infinity : Math.max(1, Math.floor(options.maxNodes));
	const moves = orderedMoves(state, legalMoves(state));
	if (moves.length === 0) return { move: null, score: terminalScore(state, 0), nodes: 1 };

	let nodes = 0;
	let bestMove = moves[0];
	let bestScore = -Infinity;
	let alpha = -Infinity;
	for (const move of moves) {
		if (nodes >= maxNodes) break;
		const next = cloneChess(state);
		applyMove(next, move);
		const score = -negamax(next, depth - 1, -Infinity, -alpha, 1);
		if (score > bestScore) {
			bestScore = score;
			bestMove = move;
		}
		alpha = Math.max(alpha, score);
	}
	return { move: bestMove, score: bestScore, nodes };

	function negamax(position: ChessState, remaining: number, low: number, high: number, ply: number): number {
		if (nodes >= maxNodes) return evaluate(position);
		nodes++;
		const result = gameResult(position);
		if (result !== 'ongoing') return terminalScore(position, ply);
		if (remaining === 0) return evaluate(position);

		let value = -Infinity;
		for (const move of orderedMoves(position, legalMoves(position))) {
			const next = cloneChess(position);
			applyMove(next, move);
			value = Math.max(value, -negamax(next, remaining - 1, -high, -low, ply + 1));
			low = Math.max(low, value);
			if (low >= high) break;
		}
		return value;
	}
}

function evaluate(state: ChessState): number {
	let score = 0;
	for (const piece of state.board) {
		if (piece) score += (piece.side === 'white' ? 1 : -1) * PIECE_VALUE[piece.kind];
	}
	return state.turn === 'white' ? score : -score;
}

function terminalScore(state: ChessState, ply: number): number {
	if (!inCheck(state, state.turn)) return 0;
	return -MATE + ply;
}

function orderedMoves(state: ChessState, moves: ChessMove[]): ChessMove[] {
	return moves.slice().sort((a, b) => moveOrder(state, b) - moveOrder(state, a));
}

function moveOrder(state: ChessState, move: ChessMove): number {
	const captured = state.board[move.to];
	const promotion = move.promotion ? PIECE_VALUE[move.promotion] : 0;
	return promotion * 10 + (captured ? PIECE_VALUE[captured.kind] : 0);
}
