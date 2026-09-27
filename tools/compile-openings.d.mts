import type { OpeningBook } from '../src/board/openings.ts';

/** SAN tokens of one PGN line, without move numbers or results. */
export function sanTokens(pgn: string): string[];

/**
 * Resolves one SAN token against the position into a UCI move (`e2e4`, `e7e8q`).
 * Anything resolving to zero (or several) legal moves throws with the row it came
 * from, because a silent guess would poison every position past it.
 */
export function sanToUci(state: import('../src/board/chess.ts').ChessState, san: string, context: string): string;

/** A whole PGN line to UCI, played from the starting position. */
export function lineToUci(pgn: string, context: string): string[];

/**
 * Compiles every TSV row in `dir` into a book: each position along each line keeps the
 * continuation there, and the longest line through the position names it.
 */
export function compileBook(dir: string): OpeningBook;
