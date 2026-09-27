import { alphaBetaSearch, firstWins, rootSplits, type AlphaBetaGame } from '../ai/search.ts';
import { spawn } from '../threads/index.ts';
import {
	applyMove,
	cloneChess,
	gameResult,
	inCheck,
	legalMoves,
	type ChessCastling,
	type ChessKind,
	type ChessMove,
	type ChessPiece,
	type ChessResult,
	type ChessSide,
	type ChessSquare,
	type ChessState,
	type PromotionKind,
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

export interface ChessEngineAsyncOptions {
	/** plies to search; three stays the default - a worker is an optimization, not a license to raise depth */
	depth?: number;
	/**
	 * hard cap on visited positions, applied to *each* root move's search: every
	 * subtree is exact within the same budget the synchronous search gets as a whole,
	 * which is what keeps the chosen move identical to `search` inside the budget
	 */
	maxNodes?: number;
	/** aborting rejects the search and terminates its workers through `threads.spawn` */
	signal?: AbortSignal;
	/** root moves scored at once (default: hardware threads capped at 8, else 4) */
	jobs?: number;
}

/**
 * Chooses a move the way `search` does, but scores each root move on a worker thread,
 * so the 90 ms a depth-3 search costs (T161) does not drop the caller's frames. The
 * split is synchronous and cheap; one `threads.spawn` task per root move carries the
 * subtree, and `ai.firstWins` combines the scores in root order, so the choice is
 * deterministic. Inside the node budget the move is exactly the one `search` returns:
 * every subtree runs the same alpha-beta with a full window, and exact per-move scores
 * in the same order pick the same winner. Past the budget, or when cancelled, this
 * resolves `{ move: null }` the way the synchronous search does.
 *
 * @example
 * ```ts
 * import { searchAsync, startingChess } from '@datamoc/mw_games/board';
 *
 * const result = await searchAsync(startingChess(), { depth: 2 });
 * console.log(result.move !== null); // true - the opening position always has legal moves
 * ```
 */
export async function searchAsync(
	state: ChessState,
	options: ChessEngineAsyncOptions = {},
): Promise<ChessSearchResult> {
	const depth = Math.max(1, Math.floor(options.depth ?? 3));
	const maxNodes = options.maxNodes === undefined ? 100_000 : Math.max(1, Math.floor(options.maxNodes));
	const jobs = options.jobs ?? defaultSearchJobs();
	if (!Number.isInteger(jobs) || jobs < 1) throw new RangeError('jobs must be a positive integer');
	if (options.signal?.aborted) throw options.signal.reason;

	const rootPlayer = chessGame.currentPlayer(state);
	const splits = rootSplits(chessGame, state);
	if (chessGame.isTerminal(state) || !splits.length) {
		return { move: null, score: chessGame.evaluate(state, rootPlayer), nodes: 0 };
	}

	//one chain per job over the shared move queue, the tools/compress-dist.mjs shape:
	//scores land by index, so first-wins sees root order no matter who finishes first
	const lanes = Math.max(1, Math.min(jobs, splits.length));
	const scored = new Array<{ move: ChessMove; score: number } | undefined>(splits.length);
	let nodes = 0;
	let exceeded = false;
	let next = 0;
	const spawnOptions = options.signal ? { signal: options.signal } : {};
	await Promise.all(
		Array.from({ length: lanes }, async () => {
			for (;;) {
				const index = next++;
				if (index >= splits.length) return;
				const task = await spawn(
					chessSubtreeScore,
					[splits[index].child, rootPlayer, depth - 1, maxNodes],
					spawnOptions,
				);
				nodes += task.nodes;
				if (task.budgetExceeded) exceeded = true;
				else scored[index] = { move: splits[index].move, score: task.score };
			}
		}),
	);
	if (exceeded) {
		return { move: null, score: chessGame.evaluate(state, rootPlayer), nodes };
	}
	//the root side is the maximizer by construction: rootPlayer is its own player
	const valid = scored.filter((entry) => entry !== undefined);
	const move = firstWins(valid, true);
	const winner = valid.find((entry) => entry.move === move);
	return { move, score: winner?.score ?? chessGame.evaluate(state, rootPlayer), nodes };
}

/** hardware threads for a root split, capped: twenty opening moves need lanes, not a storm */
function defaultSearchJobs(): number {
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
 * One root move's subtree, scored with the same alpha-beta `search` runs. **Self-contained
 * by construction:** `spawn` stringifies this function into a worker, where `new Function`
 * rehydrates it with nothing but its own body in scope, so every rule it touches is
 * declared inside it. The nested rules mirror `chess.ts` and the scoring mirrors this
 * file's engine exactly; they cannot share code across the worker boundary, so the
 * async-equals-sync tests are what keeps the two copies honest.
 */
function chessSubtreeScore(
	child: ChessState,
	rootPlayer: number,
	remaining: number,
	maxNodes: number,
): { score: number; nodes: number; budgetExceeded: boolean } {
	const MATE = 100_000;
	const PIECE_VALUE: Record<ChessPiece['kind'], number> = {
		pawn: 100,
		knight: 320,
		bishop: 330,
		rook: 500,
		queen: 900,
		king: 0,
	};

	const other = (side: ChessSide): ChessSide => (side === 'white' ? 'black' : 'white');
	const fileOf = (square: ChessSquare): number => square & 7;
	const rankOf = (square: ChessSquare): number => square >> 3;
	const onBoard = (file: number, rank: number): boolean => file >= 0 && file < 8 && rank >= 0 && rank < 8;

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

	const attacks = (board: Array<ChessPiece | null>, square: ChessSquare, by: ChessSide): boolean => {
		const file = fileOf(square);
		const rank = rankOf(square);
		const pawnRank = by === 'white' ? rank - 1 : rank + 1;
		for (const df of [-1, 1]) {
			if (!onBoard(file + df, pawnRank)) continue;
			const found = board[pawnRank * 8 + file + df];
			if (found && found.side === by && found.kind === 'pawn') return true;
		}
		for (const [df, dr] of KNIGHT_STEPS) {
			if (!onBoard(file + df, rank + dr)) continue;
			const found = board[(rank + dr) * 8 + file + df];
			if (found && found.side === by && found.kind === 'knight') return true;
		}
		for (const [df, dr] of KING_STEPS) {
			if (!onBoard(file + df, rank + dr)) continue;
			const found = board[(rank + dr) * 8 + file + df];
			if (found && found.side === by && found.kind === 'king') return true;
		}
		const rays = [
			{ steps: DIAGONALS, kinds: ['bishop', 'queen'] as ChessKind[] },
			{ steps: STRAIGHTS, kinds: ['rook', 'queen'] as ChessKind[] },
		];
		for (const { steps, kinds } of rays) {
			for (const [df, dr] of steps) {
				let f = file + df;
				let r = rank + dr;
				while (onBoard(f, r)) {
					const found = board[r * 8 + f];
					if (found) {
						if (found.side === by && kinds.includes(found.kind)) return true;
						break;
					}
					f += df;
					r += dr;
				}
			}
		}
		return false;
	};

	const findKing = (board: Array<ChessPiece | null>, side: ChessSide): ChessSquare => {
		const king = board.findIndex((found) => found !== null && found.side === side && found.kind === 'king');
		if (king === -1) throw new Error(`a position without a ${side} king cannot be judged`);
		return king;
	};

	const inCheck = (state: ChessState, side: ChessSide): boolean =>
		attacks(state.board, findKing(state.board, side), other(side));

	interface RawMove {
		from: ChessSquare;
		to: ChessSquare;
		promotion?: PromotionKind;
		castle?: 'kingside' | 'queenside';
		enPassantTake?: ChessSquare;
	}

	const pseudoMoves = (state: ChessState, from: ChessSquare): RawMove[] => {
		const piece = state.board[from];
		if (!piece || piece.side !== state.turn) return [];
		const out: RawMove[] = [];
		const file = fileOf(from);
		const rank = rankOf(from);
		const slide = (steps: ReadonlyArray<readonly [number, number]>): void => {
			for (const [df, dr] of steps) {
				let f = file + df;
				let r = rank + dr;
				while (onBoard(f, r)) {
					const target = r * 8 + f;
					const found = state.board[target];
					if (!found) out.push({ from, to: target });
					else {
						if (found.side !== piece.side) out.push({ from, to: target });
						break;
					}
					f += df;
					r += dr;
				}
			}
		};
		switch (piece.kind) {
			case 'pawn': {
				const dir = piece.side === 'white' ? 1 : -1;
				const home = piece.side === 'white' ? 1 : 6;
				const last = piece.side === 'white' ? 7 : 0;
				if (onBoard(file, rank + dir) && !state.board[(rank + dir) * 8 + file]) {
					const to = (rank + dir) * 8 + file;
					if (rank + dir === last) {
						for (const promotion of ['knight', 'bishop', 'rook', 'queen'] as const) {
							out.push({ from, to, promotion });
						}
					} else {
						out.push({ from, to });
						if (rank === home && !state.board[(rank + 2 * dir) * 8 + file]) {
							out.push({ from, to: (rank + 2 * dir) * 8 + file });
						}
					}
				}
				for (const df of [-1, 1]) {
					if (!onBoard(file + df, rank + dir)) continue;
					const to = (rank + dir) * 8 + file + df;
					const found = state.board[to];
					if (found && found.side !== piece.side) {
						if (rank + dir === last) {
							for (const promotion of ['knight', 'bishop', 'rook', 'queen'] as const) {
								out.push({ from, to, promotion });
							}
						} else {
							out.push({ from, to });
						}
					} else if (!found && to === state.enPassant) {
						out.push({ from, to, enPassantTake: rank * 8 + file + df });
					}
				}
				break;
			}
			case 'knight':
				for (const [df, dr] of KNIGHT_STEPS) {
					if (!onBoard(file + df, rank + dr)) continue;
					const to = (rank + dr) * 8 + file + df;
					const found = state.board[to];
					if (!found || found.side !== piece.side) out.push({ from, to });
				}
				break;
			case 'bishop':
				slide(DIAGONALS);
				break;
			case 'rook':
				slide(STRAIGHTS);
				break;
			case 'queen':
				slide(DIAGONALS);
				slide(STRAIGHTS);
				break;
			case 'king': {
				for (const [df, dr] of KING_STEPS) {
					if (!onBoard(file + df, rank + dr)) continue;
					const to = (rank + dr) * 8 + file + df;
					const found = state.board[to];
					if (found && found.side === piece.side) continue;
					if (found && found.kind === 'king') continue;
					out.push({ from, to });
				}
				const home = piece.side === 'white' ? 0 : 56;
				const rights =
					piece.side === 'white'
						? { king: state.castling.whiteKingside, queen: state.castling.whiteQueenside }
						: { king: state.castling.blackKingside, queen: state.castling.blackQueenside };
				if (from === home + 4 && !inCheck(state, piece.side)) {
					if (
						rights.king &&
						!state.board[home + 5] &&
						!state.board[home + 6] &&
						!attacks(state.board, home + 5, other(piece.side)) &&
						!attacks(state.board, home + 6, other(piece.side))
					) {
						out.push({ from, to: home + 6, castle: 'kingside' });
					}
					if (
						rights.queen &&
						!state.board[home + 3] &&
						!state.board[home + 2] &&
						!state.board[home + 1] &&
						!attacks(state.board, home + 3, other(piece.side)) &&
						!attacks(state.board, home + 2, other(piece.side))
					) {
						out.push({ from, to: home + 2, castle: 'queenside' });
					}
				}
				break;
			}
		}
		return out;
	};

	const playRaw = (state: ChessState, move: RawMove): void => {
		const piece = state.board[move.from];
		if (!piece) throw new Error(`no piece on ${move.from} to move`);
		const homeCorner = (side: ChessSide, square: ChessSquare): boolean => {
			const base = side === 'white' ? 0 : 56;
			return square === base || square === base + 7;
		};
		const rightName = (side: ChessSide, rookFrom: ChessSquare): keyof ChessCastling => {
			const kingside = fileOf(rookFrom) === 7;
			if (side === 'white') return kingside ? 'whiteKingside' : 'whiteQueenside';
			return kingside ? 'blackKingside' : 'blackQueenside';
		};
		if (piece.kind === 'king') {
			if (piece.side === 'white') state.castling.whiteKingside = state.castling.whiteQueenside = false;
			else state.castling.blackKingside = state.castling.blackQueenside = false;
		}
		if (piece.kind === 'rook' && homeCorner(piece.side, move.from)) {
			state.castling[rightName(piece.side, move.from)] = false;
		}
		const taken = state.board[move.to];
		if (taken && taken.kind === 'rook' && homeCorner(taken.side, move.to)) {
			state.castling[rightName(taken.side, move.to)] = false;
		}
		state.board[move.to] = move.promotion ? { side: piece.side, kind: move.promotion } : piece;
		state.board[move.from] = null;
		if (move.enPassantTake !== undefined) state.board[move.enPassantTake] = null;
		if (move.castle) {
			const rank = piece.side === 'white' ? 0 : 56;
			if (move.castle === 'kingside') {
				state.board[rank + 5] = state.board[rank + 7];
				state.board[rank + 7] = null;
			} else {
				state.board[rank + 3] = state.board[rank];
				state.board[rank] = null;
			}
		}
		state.enPassant =
			piece.kind === 'pawn' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
		state.turn = other(piece.side);
	};

	const cloneState = (state: ChessState): ChessState => ({
		board: state.board.map((found) => (found ? { side: found.side, kind: found.kind } : null)),
		turn: state.turn,
		castling: { ...state.castling },
		enPassant: state.enPassant,
	});

	const legalMoves = (state: ChessState): ChessMove[] => {
		const out: ChessMove[] = [];
		for (let from = 0; from < 64; from++) {
			if (!state.board[from] || state.board[from]?.side !== state.turn) continue;
			for (const move of pseudoMoves(state, from)) {
				const trial = cloneState(state);
				playRaw(trial, move);
				if (inCheck(trial, state.turn)) continue;
				out.push({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
			}
		}
		return out;
	};

	const gameResult = (state: ChessState): ChessResult => {
		if (legalMoves(state).length > 0) return 'ongoing';
		if (inCheck(state, state.turn)) return state.turn === 'white' ? 'black-wins' : 'white-wins';
		return 'stalemate';
	};

	const moveOrder = (state: ChessState, move: ChessMove): number => {
		const captured = state.board[move.to];
		const promotion = move.promotion ? PIECE_VALUE[move.promotion] : 0;
		return promotion * 10 + (captured ? PIECE_VALUE[captured.kind] : 0);
	};

	const orderedMoves = (state: ChessState, moves: ChessMove[]): ChessMove[] =>
		moves.slice().sort((a, b) => moveOrder(state, b) - moveOrder(state, a));

	const evaluate = (state: ChessState, player: number): number => {
		let score = 0;
		for (const piece of state.board) {
			if (piece) score += (piece.side === 'white' ? 1 : -1) * PIECE_VALUE[piece.kind];
		}
		return player === 1 ? score : -score;
	};

	const terminalScore = (state: ChessState, player: number): number => {
		const result = gameResult(state);
		if (result === 'stalemate' || !inCheck(state, state.turn)) return 0;
		const winner = result === 'white-wins' ? 1 : -1;
		return winner === player ? MATE : -MATE;
	};

	const evaluatePosition = (state: ChessState): number =>
		gameResult(state) === 'ongoing' ? evaluate(state, rootPlayer) : terminalScore(state, rootPlayer);

	let nodes = 0;
	let exceeded = false;
	const visit = (current: ChessState, depthLeft: number, alpha: number, beta: number): number => {
		if (++nodes > maxNodes) {
			exceeded = true;
			return 0;
		}
		const maximizing = (current.turn === 'white' ? 1 : -1) === rootPlayer;
		if (depthLeft === 0 || gameResult(current) !== 'ongoing') return evaluatePosition(current);
		const moves = orderedMoves(current, legalMoves(current));
		if (!moves.length) return evaluatePosition(current);
		let best = maximizing ? -Infinity : Infinity;
		for (const move of moves) {
			const next = cloneState(current);
			const raw = pseudoMoves(next, move.from).find(
				(candidate) => candidate.to === move.to && (candidate.promotion ?? null) === (move.promotion ?? null),
			);
			if (!raw) throw new Error(`a legal move stopped being legal: ${move.from}-${move.to}`);
			playRaw(next, raw);
			const score = visit(next, depthLeft - 1, alpha, beta);
			if (exceeded) return score;
			if (maximizing) {
				best = Math.max(best, score);
				alpha = Math.max(alpha, best);
			} else {
				best = Math.min(best, score);
				beta = Math.min(beta, best);
			}
			if (beta <= alpha) break;
		}
		return best;
	};

	const score = visit(child, remaining, -Infinity, Infinity);
	return { score, nodes, budgetExceeded: exceeded };
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
