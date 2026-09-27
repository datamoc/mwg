#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { huffEncode } from '../src/board/tablebase.ts';
import { spawn } from '../src/threads/spawn.ts';

/**
 * Generates pawnless endgame tablebases (WDL plus distance-to-mate) and ships
 * them compiled as JSON a game checks in beside its own code.
 *
 * Each ending is white extras against a lone black king (`KQK`, `KBNK`, ...): a
 * retrograde solve over every placement, verified against the known results
 * (queens and rooks win, lone bishops and knights draw). Captures convert into
 * the already-generated smaller tables, so 3-piece endings generate first and
 * ride along as the 4-piece tasks' arguments.
 *
 * Only Node built-ins plus the framework's own rule shape are used, so this
 * adds no dependency. Generation is the parallel half of item 390's data story
 * beside the in-page search: one `threads.spawn` task per ending over a capped
 * lane queue (each big ending holds hundreds of megabytes of arrays, so lanes
 * default to 4, not the search's 8), the same tools/compress-dist.mjs shape the
 * async search uses. A row that no longer parses fails the compile instead of
 * silently dropping a line; a corrupt artifact fails the load, never misprobes.
 *
 * usage: node tools/build-tablebases.mjs <outDir> [ending ...] [--jobs=N]
 *   endings default to the shipped set: KQK KRK KBK KNK KBNK KBBK
 */

/**
 * Solves one ending by retrograde analysis: every placement with every side to
 * move, wins/losses propagated from mates and stalemates until nothing changes,
 * the rest draws. **Self-contained by construction:** `spawn` stringifies this
 * function into a worker, so everything it touches is nested inside it; the
 * async-equals-sync probe tests are what keep it honest against `tablebase.ts`.
 *
 * `spec` is `{ white: ['queen', ...] }`; `lower` carries the smaller tables a
 * capture converts into (`{ [id]: { wdl: number[], dtm: number[] } }`, null for
 * 3-piece endings where every capture leaves bare kings). Returns plain arrays
 * so the result structured-clones straight into the writer below.
 */
export function tablebaseTask(spec, lower) {
	const extras = spec.white.map((kind) => ({ queen: 4, rook: 3, bishop: 2, knight: 1 })[kind]).sort((a, b) => b - a);
	const kinds = [5, ...extras, 5];
	const colors = [0, ...extras.map(() => 0), 1];
	const count = kinds.length;
	let positions = 1;
	for (let i = 0; i < count; i++) positions *= 64;
	positions *= 2;

	const indexOf = (squares, side) => {
		let index = squares[0];
		for (let i = 1; i < squares.length; i++) index = index * 64 + squares[i];
		return index * 2 + side;
	};

	const adjacent = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) <= 1;

	const KNIGHT_STEPS = [
		[1, 2],
		[2, 1],
		[2, -1],
		[1, -2],
		[-1, -2],
		[-2, -1],
		[-2, 1],
		[-1, 2],
	];
	const KING_STEPS = [
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
		[-1, 0],
		[-1, -1],
		[0, -1],
		[1, -1],
	];
	const DIAGONALS = [
		[1, 1],
		[-1, 1],
		[-1, -1],
		[1, -1],
	];
	const STRAIGHTS = [
		[1, 0],
		[0, 1],
		[-1, 0],
		[0, -1],
	];

	const squaresOf = (index) => {
		const squares = new Array(count);
		let rest = Math.floor(index / 2);
		for (let i = count - 1; i >= 0; i--) {
			squares[i] = rest % 64;
			rest = Math.floor(rest / 64);
		}
		return { squares, side: index % 2 };
	};

	const occupiedSet = (squares, skip) => {
		const set = new Set();
		for (let i = 0; i < squares.length; i++) {
			if (i !== skip && squares[i] >= 0) set.add(squares[i]);
		}
		return set;
	};

	/** side `by` (0 white, 1 black) attacks `square` on this occupancy */
	const attacked = (squares, square, by) => {
		const file = square & 7;
		const rank = square >> 3;
		for (let i = 0; i < count; i++) {
			if (colors[i] !== by || squares[i] < 0) continue;
			const kind = kinds[i];
			const f = squares[i] & 7;
			const r = squares[i] >> 3;
			if (kind === 1) {
				for (const [df, dr] of KNIGHT_STEPS) {
					if (f + df === file && r + dr === rank) return true;
				}
			} else if (kind === 5) {
				if (Math.max(Math.abs(f - file), Math.abs(r - rank)) === 1) return true;
			} else {
				const rays = kind === 2 ? DIAGONALS : kind === 3 ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
				for (const [df, dr] of rays) {
					let a = f + df;
					let b = r + dr;
					while (a >= 0 && a < 8 && b >= 0 && b < 8) {
						if (a === file && b === rank) return true;
						let blocked = false;
						for (let j = 0; j < count; j++) {
							if ((squares[j] & 7) === a && squares[j] >> 3 === b) {
								blocked = true;
								break;
							}
						}
						if (blocked) break;
						a += df;
						b += dr;
					}
				}
			}
		}
		return false;
	};

	const kingOf = (squares, side) => squares[side === 0 ? 0 : count - 1];

	/** every move for `side`: `{ from: pieceIndex, to, capture: capturedIndex | -1 }` */
	const genMoves = (squares, side) => {
		const occupied = occupiedSet(squares, -1);
		const out = [];
		for (let i = 0; i < count; i++) {
			if (colors[i] !== side) continue;
			const kind = kinds[i];
			const f = squares[i] & 7;
			const r = squares[i] >> 3;
			const slide = (steps) => {
				for (const [df, dr] of steps) {
					let a = f + df;
					let b = r + dr;
					while (a >= 0 && a < 8 && b >= 0 && b < 8) {
						const to = b * 8 + a;
						if (!occupied.has(to)) out.push({ from: i, to, capture: -1 });
						else {
							for (let j = 0; j < count; j++) {
								if (squares[j] === to && colors[j] !== side && kinds[j] !== 5) {
									out.push({ from: i, to, capture: j });
									break;
								}
							}
							break;
						}
						a += df;
						b += dr;
					}
				}
			};
			if (kind === 1) {
				for (const [df, dr] of KNIGHT_STEPS) {
					const a = f + df;
					const b = r + dr;
					if (a < 0 || a > 7 || b < 0 || b > 7) continue;
					const to = b * 8 + a;
					const capture = captureAt(squares, side, to);
					if (capture === -1 && occupied.has(to)) continue;
					out.push({ from: i, to, capture });
				}
			} else if (kind === 5) {
				for (const [df, dr] of KING_STEPS) {
					const a = f + df;
					const b = r + dr;
					if (a < 0 || a > 7 || b < 0 || b > 7) continue;
					const to = b * 8 + a;
					const capture = captureAt(squares, side, to);
					if (capture === -1 && occupied.has(to)) continue;
					out.push({ from: i, to, capture });
				}
			} else if (kind === 2) slide(DIAGONALS);
			else if (kind === 3) slide(STRAIGHTS);
			else slide([...DIAGONALS, ...STRAIGHTS]);
		}
		return out;
	};

	/** captured piece index on `to`, -1 when empty, -2 when it holds a king (never generated) */
	const captureAt = (squares, side, to) => {
		for (let j = 0; j < count; j++) {
			if (squares[j] === to) {
				if (colors[j] === side) return -1;
				return kinds[j] === 5 ? -2 : j;
			}
		}
		return -1;
	};

	/** legal moves: captures verified like quiets, kings never adjacent afterwards */
	const legalMoves = (squares, side) => {
		const out = [];
		for (const move of genMoves(squares, side)) {
			if (move.capture === -2) continue;
			const next = squares.slice();
			next[move.from] = move.to;
			if (move.capture >= 0) next[move.capture] = -1;
			if (adjacent(next[0], next[count - 1])) continue;
			if (attacked(next, kingOf(next, side), 1 - side)) continue;
			out.push(move);
		}
		return out;
	};

	/** reduced ending id after piece `gone` is captured, or null for bare kings */
	const reducedId = (gone) => {
		const rest = kinds.filter((kind, i) => i !== 0 && i !== count - 1 && i !== gone && kind !== 5);
		if (!rest.length) return null;
		const letter = { 4: 'Q', 3: 'R', 2: 'B', 1: 'N' };
		return `K${rest
			.slice()
			.sort((a, b) => b - a)
			.map((kind) => letter[kind])
			.join('')}K`;
	};

	/** index of these squares in the reduced ending's order */
	const reducedIndex = (squares, side, gone) => {
		const order = [0];
		const rest = [];
		for (let i = 1; i < count - 1; i++) {
			if (i !== gone) rest.push(i);
		}
		rest.sort((a, b) => kinds[b] - kinds[a]);
		const seq = [squares[0], ...rest.map((i) => squares[i]), squares[count - 1]];
		let index = seq[0];
		for (let i = 1; i < seq.length; i++) index = index * 64 + seq[i];
		return index * 2 + (1 - side);
	};

	/** conversion value from the mover's view: 1 loss, 2 draw, 3 win, with distance */
	const convert = (squares, side, gone) => {
		const id = reducedId(gone);
		if (id === null) return { value: 2, dtm: 0 };
		const table = lower?.[id];
		if (!table) throw new Error(`tablebaseTask needs ${id} to convert a capture`);
		const index = reducedIndex(squares, side, gone);
		const opponent = table.wdl[index];
		const dtm = table.dtm[index] + 1;
		if (opponent === 1) return { value: 3, dtm };
		if (opponent === 3) return { value: 1, dtm };
		return { value: 2, dtm: 0 };
	};

	const wdl = new Uint8Array(positions);
	const dtm = new Uint16Array(positions);
	const remaining = new Uint16Array(positions);
	const queue = [];

	/** predecessors: quiet un-moves of one enemy piece back onto an empty square */
	const predecessors = (squares, side) => {
		const out = [];
		const enemy = 1 - side;
		for (let i = 0; i < count; i++) {
			if (colors[i] !== enemy) continue;
			const kind = kinds[i];
			const t = squares[i];
			const rays =
				kind === 2 ? DIAGONALS : kind === 3 ? STRAIGHTS : kind === 4 ? [...DIAGONALS, ...STRAIGHTS] : null;
			const consume = (f) => {
				if (squares.includes(f)) return;
				//forward legality lives in the post-move occupancy, which is exactly
				//this position: the destination is safe for a king, and the mover's
				//own king stands safe (moving out of check is legal, so the
				//pre-move square is never tested)
				const ownKing = kind === 5 ? t : kingOf(squares, enemy);
				if (attacked(squares, ownKing, side)) return;
				const prev = squares.slice();
				prev[i] = f;
				if (adjacent(prev[0], prev[count - 1])) return;
				out.push({ squares: prev, side: enemy });
			};
			if (rays) {
				const f = t & 7;
				const r = t >> 3;
				for (const [df, dr] of rays) {
					let a = f + df;
					let b = r + dr;
					while (a >= 0 && a < 8 && b >= 0 && b < 8) {
						const from = b * 8 + a;
						if (squares.includes(from)) break;
						consume(from);
						a += df;
						b += dr;
					}
				}
			} else {
				const steps = kind === 1 ? KNIGHT_STEPS : KING_STEPS;
				const f = t & 7;
				const r = t >> 3;
				for (const [df, dr] of steps) {
					const a = f + df;
					const b = r + dr;
					if (a < 0 || a > 7 || b < 0 || b > 7) continue;
					consume(b * 8 + a);
				}
			}
		}
		return out;
	};

	for (let index = 0; index < positions; index++) {
		const { squares, side } = squaresOf(index);
		const seen = new Set(squares);
		if (seen.size !== count || adjacent(squares[0], squares[count - 1])) {
			wdl[index] = 2;
			continue;
		}
		const moves = legalMoves(squares, side);
		let quiet = 0;
		let draws = 0;
		let won = false;
		let wonDtm = 0;
		let badDelay = 0;
		for (const move of moves) {
			if (move.capture === -1) {
				quiet++;
				continue;
			}
			const { value, dtm: distance } = convert(squares, side, move.capture);
			if (value === 3) {
				won = true;
				wonDtm = distance;
				break;
			}
			if (value === 2) draws++;
			else if (distance > badDelay) badDelay = distance;
		}
		if (won) {
			wdl[index] = 3;
			dtm[index] = Math.min(65535, wonDtm);
			queue.push(index);
		} else if (moves.length === 0) {
			if (attacked(squares, kingOf(squares, side), 1 - side)) {
				wdl[index] = 1;
				dtm[index] = 0;
			} else {
				wdl[index] = 2;
			}
			queue.push(index);
		} else if (quiet === 0) {
			if (draws > 0) {
				wdl[index] = 2;
			} else {
				wdl[index] = 1;
				dtm[index] = Math.min(65535, badDelay);
			}
			queue.push(index);
		} else {
			remaining[index] = quiet;
		}
	}

	for (let head = 0; head < queue.length; head++) {
		const index = queue[head];
		const { squares, side } = squaresOf(index);
		const value = wdl[index];
		for (const pred of predecessors(squares, side)) {
			const at = indexOf(pred.squares, pred.side);
			if (wdl[at] !== 0) continue;
			if (value === 1) {
				wdl[at] = 3;
				dtm[at] = Math.min(65535, dtm[index] + 1);
				queue.push(at);
			} else if (value === 3) {
				remaining[at]--;
				if (remaining[at] === 0) {
					const { squares: ps, side: pside } = squaresOf(at);
					const moves = legalMoves(ps, pside);
					let delay = 0;
					let drawn = false;
					for (const move of moves) {
						if (move.capture === -1) {
							const next = ps.slice();
							next[move.from] = move.to;
							const child = indexOf(next, 1 - pside);
							if (wdl[child] === 3 && dtm[child] + 1 > delay) delay = dtm[child] + 1;
						} else {
							const { value: converted } = convert(ps, pside, move.capture);
							if (converted === 2) drawn = true;
						}
					}
					if (drawn) {
						wdl[at] = 2;
					} else {
						wdl[at] = 1;
						dtm[at] = Math.min(65535, delay);
					}
					queue.push(at);
				}
			}
		}
	}

	/** anything unreachable stays unknown: no forced result, so a draw */
	for (let index = 0; index < positions; index++) {
		if (wdl[index] === 0) wdl[index] = 2;
	}
	return { wdl: Array.from(wdl), dtm: Array.from(dtm), positions };
}

const SHIPPED = ['KQK', 'KRK', 'KBK', 'KNK', 'KBNK', 'KBBK'];
const LETTER_KIND = { Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };

export function specOf(id) {
	const kinds = id
		.slice(1, -1)
		.split('')
		.map((letter) => LETTER_KIND[letter]);
	if (!kinds.length || kinds.some((kind) => !kind)) throw new Error(`not a tablebase ending: "${id}"`);
	return { white: kinds };
}

function defaultJobs() {
	try {
		const parallelism = globalThis.process?.getBuiltinModule?.('node:os')?.availableParallelism?.();
		if (typeof parallelism === 'number' && Number.isInteger(parallelism) && parallelism > 0) {
			return Math.min(parallelism, 4);
		}
	} catch {
		//generation must never fail for lack of a hint about its own host
	}
	return 2;
}

const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));

if (isMain) {
	const args = process.argv.slice(2);
	const outDir = args.find((arg) => !arg.startsWith('--'));
	const jobsArg = args.find((arg) => arg.startsWith('--jobs='));
	const jobs = jobsArg ? Math.max(1, Math.floor(Number(jobsArg.slice(7)))) : defaultJobs();
	if (!Number.isInteger(jobs)) {
		console.error('jobs must be a positive integer, e.g. --jobs=4');
		process.exit(1);
	}
	const wanted = args.filter((arg) => !arg.startsWith('--') && arg !== outDir);
	if (!outDir) {
		console.error('usage: node tools/build-tablebases.mjs <outDir> [ending ...] [--jobs=N]');
		process.exit(1);
	}
	const ids = (wanted.length ? wanted : SHIPPED).map((id) => {
		if (!/^K[QRBN]+K$/.test(id)) throw new Error(`not a tablebase ending: "${id}"`);
		const strength = { Q: 0, R: 1, B: 2, N: 3 };
		const canonical = `K${id
			.slice(1, -1)
			.split('')
			.sort((a, b) => strength[a] - strength[b])
			.join('')}K`;
		if (id !== canonical) throw new Error(`not a canonical ending id (want "${canonical}"): "${id}"`);
		return id;
	});
	//a capture converts into the ending without the taken piece, so requested
	//4-piece endings pull in the 3-piece reductions they convert to
	const withDeps = new Set(ids);
	for (const id of ids) {
		if (id.length !== 4) continue;
		const extras = id.slice(1, -1).split('');
		for (let gone = 0; gone < extras.length; gone++) {
			withDeps.add(`K${extras.filter((_, i) => i !== gone).join('')}K`);
		}
	}
	const three = [...withDeps].filter((id) => id.length === 3);
	const four = [...withDeps].filter((id) => id.length === 4);
	if (ids.some((id) => id.length > 4))
		throw new Error('only 3-to-4-piece endings generate here; 5-piece stays out (see the roadmap)');
	mkdirSync(outDir, { recursive: true });

	const writeEnding = (id, result, seconds) => {
		const wdl = huffEncode(Uint8Array.from(result.wdl));
		const raw = Uint16Array.from(result.dtm);
		const bytes = new Uint8Array(raw.length * 2);
		for (let i = 0; i < raw.length; i++) {
			bytes[2 * i] = raw[i] & 255;
			bytes[2 * i + 1] = raw[i] >> 8;
		}
		const dtm = huffEncode(bytes);
		const file = { version: 1, id, white: specOf(id).white, positions: result.positions, wdl, dtm };
		writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(file, null, 2)}\n`);
		console.log(
			`  ${id}: ${result.positions} positions in ${seconds}s -> ${relative(process.cwd(), join(outDir, `${id}.json`))}`,
		);
	};
	//4-piece endings hold hundreds of megabytes of arrays each, so their lanes
	//stay narrow whatever --jobs says; 3-piece endings are megabytes and share wide
	const lanes = async (items, solve, cap = jobs) => {
		let next = 0;
		const width = Math.max(1, Math.min(cap, items.length));
		await Promise.all(
			Array.from({ length: width }, async () => {
				for (;;) {
					const index = next++;
					if (index >= items.length) return;
					await solve(items[index]);
				}
			}),
		);
	};

	//3-piece endings solve with no smaller table (every capture leaves bare
	//kings); 4-piece tasks then receive them for their conversions
	const lower = {};
	await lanes(three, async (id) => {
		const started = Date.now();
		const result = await spawn(tablebaseTask, [specOf(id), null]);
		lower[id] = { wdl: result.wdl, dtm: result.dtm };
		writeEnding(id, result, ((Date.now() - started) / 1000).toFixed(1));
	});
	await lanes(
		four,
		async (id) => {
			const started = Date.now();
			const result = await spawn(tablebaseTask, [specOf(id), lower]);
			writeEnding(id, result, ((Date.now() - started) / 1000).toFixed(1));
		},
		Math.min(jobs, 2),
	);
	console.log(
		`\ntablebases in ${relative(process.cwd(), outDir)}. Load the endings a game needs with board.loadTablebaseEnding.`,
	);
}
