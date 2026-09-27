#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { applyMove, legalMoves, positionKey, sq, squareName, startingChess } from '../src/board/chess.ts';
import { parseUciMove } from '../src/board/openings.ts';

/**
 * Compiles opening tables (`eco`, `name`, `pgn` TSV rows, one per line after the header)
 * into a position-keyed book a game checks in beside its own code.
 *
 * Each row's PGN is SAN, resolved against the real move generator and replayed from the
 * starting position; every position along the line records the continuation, and the
 * longest line ending at a position names it (first seen wins ties). The output is plain
 * JSON (`{ version: 1, positions: { [key]: { eco?, name?, moves: [uci...] } } }`), keyed
 * by `positionKey`, which is what `board.probeBook` reads back.
 *
 * Only Node built-ins plus the framework's own board rules are used, so this adds no
 * dependency. Rows are vendored data (`data/openings/`, CC0), never fetched: re-vendoring
 * is copying five files at a new commit, and a row that no longer parses fails the
 * compile instead of silently dropping a line.
 *
 * usage: node tools/compile-openings.mjs <tsv folder> <book.json>
 */

const PROMOTION_KIND = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' };
const PROMOTION_LETTER = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

/** SAN tokens of one PGN line, without move numbers or results */
export function sanTokens(pgn) {
	return pgn
		.split(/\s+/)
		.map((token) => token.replace(/^\d+\.+/, ''))
		.filter((token) => token && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

/**
 * Resolves one SAN token against the position into a UCI move (`e2e4`, `e7e8q`).
 * Castling, disambiguation, captures, promotions and trailing check/mate marks are
 * understood; anything resolving to zero (or several) legal moves throws with the row
 * it came from, because a silent guess would poison every position past it.
 */
export function sanToUci(state, san, context) {
	const move = san.replace(/[+#?!]+$/, '');
	if (/^O-O(-O)?$/.test(move)) {
		const home = state.turn === 'white' ? 0 : 56;
		return squareName(home + 4) + squareName(home + (move === 'O-O' ? 6 : 2));
	}
	const match = /^([KQRBN]?)([a-h]?[1-8]?)(x?)([a-h][1-8])(?:=([QRBN]))?$/.exec(move);
	if (!match) throw new Error(`${context}: cannot parse '${san}'`);
	const kind = match[1] === '' ? 'pawn' : { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' }[match[1]];
	const to = sq(match[4]);
	const promotion = match[5] ? PROMOTION_KIND[match[5].toLowerCase()] : undefined;
	const candidates = legalMoves(state).filter(
		(candidate) =>
			state.board[candidate.from]?.kind === kind &&
			candidate.to === to &&
			(candidate.promotion ?? null) === (promotion ?? null) &&
			[...match[2]].every((c) => squareName(candidate.from).includes(c)),
	);
	if (candidates.length !== 1) throw new Error(`${context}: '${san}' matches ${candidates.length} moves`);
	const chosen = candidates[0];
	return (
		squareName(chosen.from) + squareName(chosen.to) + (chosen.promotion ? PROMOTION_LETTER[chosen.promotion] : '')
	);
}

/** a whole PGN line to UCI, played from the starting position */
export function lineToUci(pgn, context) {
	const state = startingChess();
	const uci = [];
	for (const san of sanTokens(pgn)) {
		const move = sanToUci(state, san, context);
		uci.push(move);
		applyMove(state, parseUciMove(move));
	}
	return uci;
}

/**
 * Compiles every TSV row in `dir` into a book: each position along each line keeps the
 * continuation there, and the longest line ending at a position names it. Terminal
 * positions keep entries of their own, so a line that stops early still classifies.
 */
export function compileBook(dir) {
	const positions = {};
	for (const file of readdirSync(dir)
		.filter((entry) => entry.endsWith('.tsv'))
		.sort()) {
		const rows = readFileSync(join(dir, file), 'utf8').split('\n');
		rows.slice(1).forEach((row, index) => {
			if (!row.trim()) return;
			const [eco, name, pgn] = row.split('\t');
			const context = `${file}:${index + 2} (${eco} ${name})`;
			if (!eco || !name || !pgn) throw new Error(`${context}: malformed row`);
			const uci = lineToUci(pgn, context);
			const state = startingChess();
			const keys = [positionKey(state)];
			for (const move of uci) {
				applyMove(state, parseUciMove(move));
				keys.push(positionKey(state));
			}
			keys.forEach((key, ply) => {
				let entry = positions[key];
				if (!entry) entry = positions[key] = { length: 0, moves: [] };
				if (ply === uci.length && uci.length > entry.length) {
					entry.eco = eco;
					entry.name = name;
					entry.length = uci.length;
				}
				if (ply < uci.length && !entry.moves.includes(uci[ply])) entry.moves.push(uci[ply]);
			});
		});
	}
	for (const key of Object.keys(positions)) delete positions[key].length;
	return { version: 1, positions };
}

const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));

if (isMain) {
	const [dir, out] = process.argv.slice(2);
	if (!dir || !out) {
		console.error('usage: node tools/compile-openings.mjs <tsv folder> <book.json>');
		process.exit(1);
	}
	const book = compileBook(dir);
	writeFileSync(out, `${JSON.stringify(book)}\n`);
	const count = Object.keys(book.positions).length;
	console.log(`  ${count} positions from ${relative(process.cwd(), dir)} -> ${relative(process.cwd(), out)}`);
}
