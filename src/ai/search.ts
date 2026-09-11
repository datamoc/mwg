import type { AIValue } from './index.ts';

export interface AlphaBetaGame<State, Move> {
	/** The side whose turn it is. Alpha-beta assumes a two-player zero-sum game. */
	readonly currentPlayer: (state: State) => number;
	/** Legal moves from this state, in the game's preferred stable order. */
	readonly moves: (state: State) => readonly Move[];
	/** Apply a move and return the next state. Do not mutate the input state. */
	readonly apply: (state: State, move: Move) => State;
	readonly isTerminal: (state: State) => boolean;
	/** Score from the perspective of the root player. Higher is better. */
	readonly evaluate: (state: State, rootPlayer: number) => number;
}

export interface AlphaBetaOptions {
	readonly depth: number;
	readonly maxNodes?: number;
	readonly signal?: AbortSignal;
	readonly onNode?: (depth: number, maximizing: boolean) => void;
}

export interface AlphaBetaResult<State, Move> {
	readonly move: Move | null;
	readonly score: number;
	readonly depth: number;
	readonly nodes: number;
	readonly cutoffs: number;
	readonly status: 'complete' | 'cancelled' | 'budget-exceeded';
	readonly state: State;
}

const DEFAULT_MAX_NODES = 100_000;

/**
 * Deterministic minimax with alpha-beta pruning for a game-owned state adapter.
 *
 * @example
 * ```ts
 * import { alphaBetaSearch } from '@datamoc/mw_games/ai';
 *
 * const result = alphaBetaSearch({
 *   currentPlayer: () => 1,
 *   moves: (state: number) => state < 2 ? [1] : [],
 *   apply: (state: number, move: number) => state + move,
 *   isTerminal: (state: number) => state >= 2,
 *   evaluate: (state: number) => state,
 * }, 0, { depth: 2 });
 * console.log(result.move); // 1
 * ```
 */
export function alphaBetaSearch<State, Move>(
	game: AlphaBetaGame<State, Move>,
	state: State,
	options: AlphaBetaOptions,
): AlphaBetaResult<State, Move> {
	if (!Number.isInteger(options.depth) || options.depth < 1) throw new RangeError('depth must be a positive integer');
	const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
	if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new RangeError('maxNodes must be a positive integer');
	const rootPlayer = game.currentPlayer(state);
	let nodes = 0;
	let cutoffs = 0;
	let stopped: AlphaBetaResult<State, Move>['status'] | undefined;

	const visit = (current: State, remaining: number, alpha: number, beta: number): number => {
		if (options.signal?.aborted) {
			stopped = 'cancelled';
			return 0;
		}
		if (++nodes > maxNodes) {
			stopped = 'budget-exceeded';
			return 0;
		}
		const maximizing = game.currentPlayer(current) === rootPlayer;
		options.onNode?.(remaining, maximizing);
		if (remaining === 0 || game.isTerminal(current)) return game.evaluate(current, rootPlayer);
		const moves = game.moves(current);
		if (!moves.length) return game.evaluate(current, rootPlayer);
		let best = maximizing ? -Infinity : Infinity;
		for (const move of moves) {
			const score = visit(game.apply(current, move), remaining - 1, alpha, beta);
			if (stopped) return score;
			if (maximizing) {
				best = Math.max(best, score);
				alpha = Math.max(alpha, best);
			} else {
				best = Math.min(best, score);
				beta = Math.min(beta, best);
			}
			if (beta <= alpha) {
				cutoffs++;
				break;
			}
		}
		return best;
	};

	const rootMoves = game.moves(state);
	let chosen: Move | null = null;
	let score = game.evaluate(state, rootPlayer);
	if (!game.isTerminal(state) && rootMoves.length) {
		const maximizing = game.currentPlayer(state) === rootPlayer;
		let bestScore = maximizing ? -Infinity : Infinity;
		let alpha = -Infinity;
		let beta = Infinity;
		for (const move of rootMoves) {
			const child = game.apply(state, move);
			const candidate = visit(child, options.depth - 1, alpha, beta);
			if (stopped) break;
			if (chosen === null || (maximizing ? candidate > bestScore : candidate < bestScore)) {
				chosen = move;
				bestScore = candidate;
			}
			if (maximizing) alpha = Math.max(alpha, bestScore);
			else beta = Math.min(beta, bestScore);
		}
		if (chosen !== null) score = bestScore;
	}
	return {
		move: stopped ? null : chosen,
		score,
		depth: options.depth,
		nodes,
		cutoffs,
		status: stopped ?? 'complete',
		state,
	};
}

export interface LuaAlphaBetaFunctions {
	readonly player?: string;
	readonly moves?: string;
	readonly apply?: string;
	readonly terminal?: string;
	readonly evaluate?: string;
}

export interface LuaSearchValueAdapter {
	readonly toMoves: (value: AIValue) => readonly AIValue[];
	readonly toBoolean: (value: AIValue) => boolean;
	readonly toNumber: (value: AIValue) => number;
	readonly toPlayer: (value: AIValue) => number;
}
