import type { ChessMove } from '../src/board/chess.ts';
import type { OpeningBook } from '../src/board/openings.ts';
import type { LoadedEnding } from '../src/board/tablebase.ts';

export interface UciSessionOptions {
	/** plies when `go` names no depth */
	depth?: number;
	/** compiled opening book, probed before anything thinks */
	book?: OpeningBook | null;
	/** loaded tablebase endings, probed before the search */
	tables?: Record<string, LoadedEnding>;
}

export interface UciSession {
	/** one input line in, zero or more output lines out; never throws */
	input(line: string): string[];
}

/** a move in UCI coordinates (`e2e4`, `e7e8q`). */
export function uciString(move: ChessMove): string;

/**
 * One stateful UCI conversation over the tournament engine: book, then
 * tablebase, then `searchTourney`. Feed it input lines, read back output lines.
 */
export function createUciSession(options?: UciSessionOptions): UciSession;
