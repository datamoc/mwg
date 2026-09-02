/**
 * Chess: legal-move rules, no opponent.
 *
 * Two players across one screen, or puzzles with known solutions, is what this
 * covers: a position, every legal move in it, and whether it ends the game. An
 * AI that picks one is a separate, much larger question and lives nowhere here.
 * Draws by fifty moves, repetition or dead material are not detected either -
 * claims, not rules of movement, and a minigame ends on mate or stalemate.
 */

export type ChessSide = 'white' | 'black';
export type ChessKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface ChessPiece {
	side: ChessSide;
	kind: ChessKind;
}

/** a square 0-63: `file + rank * 8`, a1 is 0, h8 is 63 */
export type ChessSquare = number;

export type PromotionKind = 'knight' | 'bishop' | 'rook' | 'queen';

export interface ChessMove {
	from: ChessSquare;
	to: ChessSquare;
	promotion?: PromotionKind;
}

export interface ChessCastling {
	whiteKingside: boolean;
	whiteQueenside: boolean;
	blackKingside: boolean;
	blackQueenside: boolean;
}

export interface ChessState {
	board: Array<ChessPiece | null>;
	turn: ChessSide;
	castling: ChessCastling;
	/** a square a pawn could capture onto, left behind by a double push */
	enPassant: ChessSquare | null;
}

export type ChessResult = 'ongoing' | 'white-wins' | 'black-wins' | 'stalemate';

/** 'e4' to 28 and back - tests read `sq('e4')` rather than bare numbers */
export function sq(name: string): ChessSquare {
	const file = name.charCodeAt(0) - 97;
	const rank = name.charCodeAt(1) - 49;
	if (file < 0 || file > 7 || rank < 0 || rank > 7 || name.length !== 2) {
		throw new Error(`not a square: "${name}"`);
	}
	return rank * 8 + file;
}

export function squareName(sq: ChessSquare): string {
	return String.fromCharCode(97 + (sq & 7)) + String.fromCharCode(49 + (sq >> 3));
}

/**
 * Reads a position in Forsyth-Edwards Notation - the shape puzzles come in.
 *
 * Placement, side to move, castling rights and the en passant square are read;
 * the halfmove clock and move number are not (draw claims are out of scope),
 * and both kings must be present or there is nothing to judge.
 */
export function parseFen(fen: string): ChessState {
	const parts = fen.trim().split(/\s+/);
	if (parts.length < 4) throw new Error(`not a FEN string: "${fen}"`);

	const board: Array<ChessPiece | null> = new Array(64).fill(null);
	const rows = parts[0].split('/');
	if (rows.length !== 8) throw new Error(`a FEN placement needs 8 ranks: "${fen}"`);
	rows.forEach((row, i) => {
		const rank = 7 - i;
		let file = 0;
		for (const c of row) {
			if (c >= '1' && c <= '8') {
				file += c.charCodeAt(0) - 48;
			} else {
				const side: ChessSide = c === c.toUpperCase() ? 'white' : 'black';
				const kind = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[
					c.toLowerCase()
				] as ChessKind | undefined;
				if (!kind || file > 7) throw new Error(`bad FEN rank "${row}" in "${fen}"`);
				board[rank * 8 + file] = { side, kind };
				file++;
			}
		}
		if (file !== 8) throw new Error(`bad FEN rank "${row}" in "${fen}"`);
	});

	if (parts[1] !== 'w' && parts[1] !== 'b') throw new Error(`a FEN side is "w" or "b": "${fen}"`);
	const castling: ChessCastling = { whiteKingside: false, whiteQueenside: false, blackKingside: false, blackQueenside: false };
	if (parts[2] !== '-') {
		for (const c of parts[2]) {
			if (c === 'K') castling.whiteKingside = true;
			else if (c === 'Q') castling.whiteQueenside = true;
			else if (c === 'k') castling.blackKingside = true;
			else if (c === 'q') castling.blackQueenside = true;
			else throw new Error(`bad FEN castling "${parts[2]}" in "${fen}"`);
		}
	}
	const enPassant = parts[3] === '-' ? null : sq(parts[3]);
	if (enPassant !== null) {
		//a capture lands on rank 6 against black's push, rank 3 against white's
		const home = parts[1] === 'w' ? 5 : 2;
		if (rankOf(enPassant) !== home) throw new Error(`bad FEN en passant square "${parts[3]}" in "${fen}"`);
	}

	const state: ChessState = { board, turn: parts[1] === 'w' ? 'white' : 'black', castling, enPassant };
	findKing(board, 'white');
	findKing(board, 'black');
	return state;
}

function other(side: ChessSide): ChessSide {
	return side === 'white' ? 'black' : 'white';
}

function fileOf(sq: ChessSquare): number {
	return sq & 7;
}

function rankOf(sq: ChessSquare): number {
	return sq >> 3;
}

function onBoard(file: number, rank: number): boolean {
	return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

/** the standard opening array, white to move with every right intact */
export function startingChess(): ChessState {
	const back: ChessKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
	const board: Array<ChessPiece | null> = new Array(64).fill(null);
	for (let file = 0; file < 8; file++) {
		board[file] = { side: 'white', kind: back[file] };
		board[8 + file] = { side: 'white', kind: 'pawn' };
		board[48 + file] = { side: 'black', kind: 'pawn' };
		board[56 + file] = { side: 'black', kind: back[file] };
	}
	return {
		board,
		turn: 'white',
		castling: { whiteKingside: true, whiteQueenside: true, blackKingside: true, blackQueenside: true },
		enPassant: null,
	};
}

/** an independent copy, for searching a move without playing it */
export function cloneChess(state: ChessState): ChessState {
	return {
		board: state.board.map((p) => (p ? { side: p.side, kind: p.kind } : null)),
		turn: state.turn,
		castling: { ...state.castling },
		enPassant: state.enPassant,
	};
}

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

/** true when `by` attacks `sq`, whatever `by`'s own king thinks of the move */
function attacks(board: Array<ChessPiece | null>, sq: ChessSquare, by: ChessSide): boolean {
	const file = fileOf(sq);
	const rank = rankOf(sq);

	//pawns attack one step diagonally towards the other side
	const pawnRank = by === 'white' ? rank - 1 : rank + 1;
	for (const df of [-1, 1]) {
		if (!onBoard(file + df, pawnRank)) continue;
		const p = board[pawnRank * 8 + file + df];
		if (p && p.side === by && p.kind === 'pawn') return true;
	}

	for (const [df, dr] of KNIGHT_STEPS) {
		if (!onBoard(file + df, rank + dr)) continue;
		const p = board[(rank + dr) * 8 + file + df];
		if (p && p.side === by && p.kind === 'knight') return true;
	}

	for (const [df, dr] of KING_STEPS) {
		if (!onBoard(file + df, rank + dr)) continue;
		const p = board[(rank + dr) * 8 + file + df];
		if (p && p.side === by && p.kind === 'king') return true;
	}

	//sliders see until something stands in the way
	const rays: Array<{ steps: typeof DIAGONALS; kinds: ChessKind[] }> = [
		{ steps: DIAGONALS, kinds: ['bishop', 'queen'] },
		{ steps: STRAIGHTS, kinds: ['rook', 'queen'] },
	];
	for (const { steps, kinds } of rays) {
		for (const [df, dr] of steps) {
			let f = file + df;
			let r = rank + dr;
			while (onBoard(f, r)) {
				const p = board[r * 8 + f];
				if (p) {
					if (p.side === by && kinds.includes(p.kind)) return true;
					break;
				}
				f += df;
				r += dr;
			}
		}
	}

	return false;
}

function findKing(board: Array<ChessPiece | null>, side: ChessSide): ChessSquare {
	const king = board.findIndex((p) => p !== null && p.side === side && p.kind === 'king');
	if (king === -1) throw new Error(`a position without a ${side} king cannot be judged`);
	return king;
}

export function inCheck(state: ChessState, side: ChessSide): boolean {
	return attacks(state.board, findKing(state.board, side), other(side));
}

interface RawMove {
	from: ChessSquare;
	to: ChessSquare;
	promotion?: PromotionKind;
	castle?: 'kingside' | 'queenside';
	enPassantTake?: ChessSquare;
}

/** every move the piece could make ignoring its own king - checks filter later */
function pseudoMoves(state: ChessState, from: ChessSquare): RawMove[] {
	const piece = state.board[from];
	if (!piece || piece.side !== state.turn) return [];
	const out: RawMove[] = [];
	const file = fileOf(from);
	const rank = rankOf(from);

	const slide = (steps: ReadonlyArray<readonly [number, number]>) => {
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
			//one step, and two from home, into empty squares
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
			//captures, including onto the en passant square
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
					out.push({ from, to, enPassantTake: (rank * 8 + file + df) });
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
				//never capture the other king: kings are never adjacent after a legal move
				if (found && found.kind === 'king') continue;
				out.push({ from, to });
			}
			//castling: rights, empty passage, and no check on the way over
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
}

function playRaw(state: ChessState, move: RawMove): void {
	const piece = state.board[move.from];
	if (!piece) throw new Error(`no piece on ${squareName(move.from)} to move`);

	//castling rights die with the king's first step, a rook's, or a captured rook's.
	//A rook on its home corner never moved, so its rights are still alive to kill.
	const homeCorner = (side: ChessSide, sq: ChessSquare): boolean => {
		const base = side === 'white' ? 0 : 56;
		return sq === base || sq === base + 7;
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

	//a double pawn push leaves a square behind it; anything else clears the old one
	state.enPassant =
		piece.kind === 'pawn' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
	state.turn = other(piece.side);
}

function rightName(side: ChessSide, rookFrom: ChessSquare): keyof ChessCastling {
	const kingside = fileOf(rookFrom) === 7;
	if (side === 'white') return kingside ? 'whiteKingside' : 'whiteQueenside';
	return kingside ? 'blackKingside' : 'blackQueenside';
}

/**
 * Every legal move for the side to play: pseudo-moves that leave their own king
 * safe. Kingside castling sorts before queenside, promotions queen-first - a
 * stable order puzzles and tests can rely on.
 */
export function legalMoves(state: ChessState): ChessMove[] {
	const out: ChessMove[] = [];
	for (let from = 0; from < 64; from++) {
		if (!state.board[from] || state.board[from]?.side !== state.turn) continue;
		for (const move of pseudoMoves(state, from)) {
			const trial = cloneChess(state);
			playRaw(trial, move);
			if (inCheck(trial, state.turn)) continue;
			out.push({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
		}
	}
	return out;
}

/**
 * Plays a move, mutating the position. Refuses anything `legalMoves` would not
 * list - a silent illegal move is how a minigame corrupts its own board.
 */
export function applyMove(state: ChessState, move: ChessMove): void {
	const piece = state.board[move.from];
	if (!piece || piece.side !== state.turn) {
		throw new Error(`no ${state.turn} piece on ${squareName(move.from)} to move`);
	}
	const raw = pseudoMoves(state, move.from).find(
		(m) => m.to === move.to && (m.promotion ?? null) === (move.promotion ?? null)
	);
	if (!raw) throw new Error(`${squareName(move.from)}-${squareName(move.to)} is not a legal move here`);
	const trial = cloneChess(state);
	playRaw(trial, raw);
	if (inCheck(trial, state.turn)) {
		throw new Error(`${squareName(move.from)}-${squareName(move.to)} leaves the king in check`);
	}
	playRaw(state, raw);
}

/** mate, stalemate, or more game: whoever just moved is judged through the side to play */
export function gameResult(state: ChessState): ChessResult {
	if (legalMoves(state).length > 0) return 'ongoing';
	if (inCheck(state, state.turn)) return state.turn === 'white' ? 'black-wins' : 'white-wins';
	return 'stalemate';
}
