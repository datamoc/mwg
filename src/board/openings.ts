import { positionKey, sq, type ChessMove, type ChessState, type PromotionKind } from './chess.ts';

/**
 * An opening book: positions with the ECO code, English name and continuations the
 * table assigns them. The data is compiled out of the game by
 * `tools/compile-openings.mjs` from the vendored lichess tables (`data/openings/`,
 * CC0), so the framework ships this probe logic and no table: a book big enough to
 * matter would blow the bundle budget if it rode along.
 *
 * Positions are keyed by `positionKey`: placement, side to move, castling rights and
 * en passant square, no clocks. Moves ride as UCI strings (`e2e4`, `e7e8q`), which
 * survive JSON untouched; `parseUciMove` turns one back into a `ChessMove`.
 */

export interface OpeningBookEntry {
	/** ECO code, present where a known line ends; bare transpositions carry moves but no name */
	readonly eco?: string;
	/** English opening name, present where a known line ends */
	readonly name?: string;
	readonly moves: readonly string[];
}

export interface OpeningBook {
	readonly version: 1;
	readonly positions: Record<string, OpeningBookEntry>;
}

/**
 * Looks a position up in the book: its continuations, plus the ECO code and name where
 * a known line ends there (mid-line transpositions carry moves but no name). Pure and
 * total: an unknown key is a miss, never an error.
 *
 * @example
 * ```ts
 * import { probeBook, startingChess } from '@datamoc/mw_games/board';
 *
 * const book = {
 *   version: 1 as const,
 *   positions: {
 *     'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': {
 *       moves: ['b2b4'],
 *     },
 *   },
 * };
 * console.log(probeBook(book, startingChess())?.moves); // ['b2b4']
 * ```
 */
export function probeBook(book: OpeningBook, state: ChessState): OpeningBookEntry | null {
	return book.positions[positionKey(state)] ?? null;
}

const PROMOTION_LETTER: Record<string, PromotionKind> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };

/**
 * Reads a UCI move (`e2e4`, `e7e8q`) back into a `ChessMove`. The inverse of what the
 * book compiler writes; it checks the shape, not the legality, so the caller matches
 * the result against `legalMoves` before playing it.
 *
 * @example
 * ```ts
 * import { parseUciMove } from '@datamoc/mw_games/board';
 *
 * console.log(parseUciMove('e2e4')); // { from: 12, to: 28 }
 * ```
 */
export function parseUciMove(uci: string): ChessMove {
	const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
	if (!match) throw new Error(`not a UCI move: "${uci}"`);
	const promotion = match[3] ? PROMOTION_LETTER[match[3]] : undefined;
	return promotion ? { from: sq(match[1]), to: sq(match[2]), promotion } : { from: sq(match[1]), to: sq(match[2]) };
}
