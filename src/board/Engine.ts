import { alphaBetaSearch, type AlphaBetaGame } from '../ai/search.ts';
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
 *
 * @example
 * ```ts
 * import { chooseMove } from '@datamoc/mw_games/board';
 * import { startingChess, applyMove } from '@datamoc/mw_games/board';
 *
 * const state = startingChess();
 * const move = chooseMove(state, { depth: 2 });
 * if (move) applyMove(state, move); // the engine's own reply, played for it
 * ```
 */
export function chooseMove(state: ChessState, options: ChessEngineOptions = {}): ChessMove | null {
	return search(state, options).move;
}

/**
 * The full negamax result behind `chooseMove` - the move it would play, its evaluation, and
 * how many positions it visited to get there.
 *
 * @example
 * ```ts
 * import { search, startingChess } from '@datamoc/mw_games/board';
 *
 * const result = search(startingChess(), { depth: 2 });
 * console.log(result.move !== null); // true - the opening position always has legal moves
 * console.log(typeof result.score, typeof result.nodes); // 'number' 'number'
 * ```
 */
export function search(state: ChessState, options: ChessEngineOptions = {}): ChessSearchResult {
	const depth = Math.max(1, Math.floor(options.depth ?? 3));
	const maxNodes = options.maxNodes === undefined ? 100_000 : Math.max(1, Math.floor(options.maxNodes));
	const result = alphaBetaSearch(chessGame, state, { depth, maxNodes });
	return { move: result.move, score: result.score, nodes: result.nodes };
}

/**
 * The chess rules adapter consumed by the shared `ai.alphaBetaSearch` primitive.
 *
 * @example
 * ```ts
 * import { chessGame, startingChess } from '@datamoc/mw_games/board';
 * import { alphaBetaSearch } from '@datamoc/mw_games/ai';
 *
 * const result = alphaBetaSearch(chessGame, startingChess(), { depth: 2 });
 * console.log(result.move !== null); // true
 * ```
 */
export const chessGame: AlphaBetaGame<ChessState, ChessMove> = {
	currentPlayer: (state) => (state.turn === 'white' ? 1 : -1),
	moves: (state) => orderedMoves(state, legalMoves(state)),
	apply: (state, move) => {
		const next = cloneChess(state);
		applyMove(next, move);
		return next;
	},
	isTerminal: (state) => gameResult(state) !== 'ongoing',
	evaluate: (state, rootPlayer) =>
		gameResult(state) === 'ongoing' ? evaluate(state, rootPlayer) : terminalScore(state, rootPlayer),
};

function evaluate(state: ChessState, rootPlayer: number): number {
	let score = 0;
	for (const piece of state.board) {
		if (piece) score += (piece.side === 'white' ? 1 : -1) * PIECE_VALUE[piece.kind];
	}
	return rootPlayer === 1 ? score : -score;
}

function terminalScore(state: ChessState, rootPlayer: number): number {
	const result = gameResult(state);
	if (result === 'stalemate' || !inCheck(state, state.turn)) return 0;
	const winner = result === 'white-wins' ? 1 : -1;
	return winner === rootPlayer ? MATE : -MATE;
}

function orderedMoves(state: ChessState, moves: ChessMove[]): ChessMove[] {
	return moves.slice().sort((a, b) => moveOrder(state, b) - moveOrder(state, a));
}

function moveOrder(state: ChessState, move: ChessMove): number {
	const captured = state.board[move.to];
	const promotion = move.promotion ? PIECE_VALUE[move.promotion] : 0;
	return promotion * 10 + (captured ? PIECE_VALUE[captured.kind] : 0);
}
