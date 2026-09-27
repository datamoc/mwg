#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createInterface } from 'node:readline';
import { applyMove, cloneChess, legalMoves, parseFen, squareName, startingChess } from '../src/board/chess.ts';
import { parseUciMove, probeBook } from '../src/board/openings.ts';
import { searchTourney } from '../src/board/tourney.ts';
import { loadTablebaseEnding, probeTablebase } from '../src/board/tablebase.ts';

/**
 * A UCI adapter over the tournament engine: `position`/`go` on stdin, `bestmove`
 * on stdout, the way a GUI expects. Move choice runs book first, then tablebase,
 * then `searchTourney`, so each layer only pays when the earlier ones miss.
 *
 * This is a Node tool, never part of the browser bundle: it reads files and
 * stdio, which a `file://` page cannot do. `info score` is centipawns from the
 * side to move's view (documented because GUIs vary); `bestmove 0000` answers
 * a position with no legal moves, per the UCI convention.
 *
 * usage: node tools/play-uci.mjs [--book <book.json>] [--tables <dir>] [--depth N]
 */

const PROMOTION_LETTER = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export function uciString(move) {
	return squareName(move.from) + squareName(move.to) + (move.promotion ? PROMOTION_LETTER[move.promotion] : '');
}

/**
 * One stateful conversation: feed it input lines, read back output lines. Pure
 * except for the injected search, book and tables, so tests drive transcripts
 * without spawning anything.
 */
export function createUciSession(options = {}) {
	const book = options.book ?? null;
	const tables = options.tables ?? {};
	const fallbackDepth = options.depth ?? 4;
	let state = startingChess();
	let halfmove = 0;

	const findMove = (token) => {
		let parsed;
		try {
			parsed = parseUciMove(token);
		} catch {
			return null;
		}
		return (
			legalMoves(state).find(
				(move) =>
					move.from === parsed.from &&
					move.to === parsed.to &&
					(parsed.promotion === undefined
						? move.promotion === undefined
						: move.promotion === parsed.promotion),
			) ?? null
		);
	};

	const play = (move) => {
		const target = move.to === state.enPassant && state.board[move.from]?.kind === 'pawn';
		const capture = target || state.board[move.to] !== null;
		const pawn = state.board[move.from]?.kind === 'pawn';
		applyMove(state, move);
		halfmove = pawn || capture ? 0 : halfmove + 1;
	};

	const tablebest = () => {
		const ids = Object.keys(tables);
		if (!ids.length) return null;
		let best = null;
		let complete = true;
		for (const move of legalMoves(state)) {
			const next = cloneChess(state);
			applyMove(next, move);
			const probe = probeTablebase(tables, next, halfmove);
			if (!probe) {
				complete = false;
				continue;
			}
			const score =
				probe.outcome === 'loss' ? 100000 - probe.dtm : probe.outcome === 'draw' ? 0 : -(100000 - probe.dtm);
			if (best === null || score > best.score) best = { move, score };
		}
		//a forced mate beats any unprobed capture line; otherwise every successor
		//must probe, or the search (which sees captures) takes the move instead
		if (best !== null && (best.score > 90000 || complete)) return best;
		return null;
	};

	const go = (args) => {
		let depth = fallbackDepth;
		let maxNodes;
		let timeMs;
		for (let i = 0; i < args.length; i++) {
			if (args[i] === 'depth' && args[i + 1] !== undefined) depth = Math.max(1, Math.floor(Number(args[i + 1])));
			if (args[i] === 'nodes' && args[i + 1] !== undefined)
				maxNodes = Math.max(1, Math.floor(Number(args[i + 1])));
			if (args[i] === 'movetime' && args[i + 1] !== undefined)
				timeMs = Math.max(1, Math.floor(Number(args[i + 1])));
		}
		if (!Number.isInteger(depth)) depth = fallbackDepth;
		const moves = legalMoves(state);
		if (!moves.length) return ['bestmove 0000'];
		const entry = book ? probeBook(book, state) : null;
		if (entry?.moves.length) return ['info string book', `bestmove ${entry.moves[0]}`];
		const tabled = tablebest();
		if (tabled) return ['info string tablebase', `bestmove ${uciString(tabled.move)}`];
		const result = searchTourney(state, { depth, maxNodes, timeMs });
		if (!result.move) return ['bestmove 0000'];
		return [
			`info depth ${result.depth} score cp ${result.score} nodes ${result.nodes}`,
			`bestmove ${uciString(result.move)}`,
		];
	};

	const position = (args) => {
		const movesAt = args.indexOf('moves');
		const head = movesAt === -1 ? args : args.slice(0, movesAt);
		const tail = movesAt === -1 ? [] : args.slice(movesAt + 1);
		if (head[0] === 'startpos') {
			state = startingChess();
			halfmove = 0;
		} else if (head[0] === 'fen') {
			try {
				const fen = head.slice(1).join(' ');
				state = parseFen(fen);
				const parts = fen.split(' ');
				halfmove = parts[4] !== undefined && /^\d+$/.test(parts[4]) ? Number(parts[4]) : 0;
			} catch {
				return [`info string bad fen: ${head.slice(1).join(' ')}`];
			}
		} else {
			return [`info string unknown position: ${head[0] ?? ''}`];
		}
		for (const token of tail) {
			const move = findMove(token);
			if (!move) return [`info string illegal move: ${token}`];
			play(move);
		}
		return [];
	};

	return {
		input(line) {
			const parts = line
				.trim()
				.split(/\s+/)
				.filter((part) => part.length);
			if (!parts.length) return [];
			const [command, ...args] = parts;
			if (command === 'uci') return ['id name mwg tourney', 'uciok'];
			if (command === 'isready') return ['readyok'];
			if (command === 'ucinewgame') {
				state = startingChess();
				halfmove = 0;
				return [];
			}
			if (command === 'position') return position(args);
			if (command === 'go') return go(args);
			if (command === 'quit') return [];
			return [`info string unknown command: ${command}`];
		},
	};
}

const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));

if (isMain) {
	const args = process.argv.slice(2);
	const flag = (name) => {
		const at = args.indexOf(name);
		return at === -1 ? undefined : args[at + 1];
	};
	const bookPath = flag('--book');
	const tablesDir = flag('--tables');
	const depth = flag('--depth') === undefined ? 4 : Math.max(1, Math.floor(Number(flag('--depth'))));
	const book = bookPath ? JSON.parse(readFileSync(bookPath, 'utf8')) : null;
	if (book && book.version !== 1) throw new Error(`${bookPath}: unknown opening-book version`);
	const tables = {};
	if (tablesDir) {
		for (const file of readdirSync(tablesDir)) {
			if (extname(file) !== '.json') continue;
			const ending = loadTablebaseEnding(JSON.parse(readFileSync(join(tablesDir, file), 'utf8')));
			tables[ending.id] = ending;
		}
	}
	const session = createUciSession({ book, tables, depth });
	const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	for await (const line of lines) {
		if (line.trim() === 'quit') break;
		for (const out of session.input(line)) console.log(out);
	}
}
