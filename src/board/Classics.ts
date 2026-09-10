import * as Random from '../core/Random.ts';

export type BoardOwner = string;

export interface BoardPiece<K = string> {
	id: string;
	owner: BoardOwner;
	kind: K;
	count?: number;
}

/**
 * A generic rectangular grid of pieces - the shared shape underneath a game-specific board
 * (chess, checkers, or a custom game entirely) that only needs cells, bounds checking, and
 * moving a piece from one cell to another.
 *
 * @example
 * ```ts
 * import { BoardGrid } from '@datamoc/mw_games/board';
 *
 * const board = new BoardGrid<{ id: string; owner: string; kind: string }>(3, 3);
 * board.set(1, 1, { id: 'king', owner: 'white', kind: 'king' });
 *
 * console.log(board.move({ x: 1, y: 1 }, { x: 2, y: 2 })); // { id: 'king', owner: 'white', kind: 'king' }
 * console.log(board.get(2, 2)); // the same piece, now at its new cell
 * console.log(board.get(1, 1)); // null - the old cell is empty
 * ```
 */
export class BoardGrid<P> {
	readonly cells: Array<P | null>;
	readonly width: number;
	readonly height: number;

	constructor(width: number, height: number, cells?: readonly (P | null)[]) {
		this.width = width;
		this.height = height;
		if (width < 1 || height < 1) throw new Error('a board needs positive dimensions');
		if (cells && cells.length !== width * height) throw new Error('board cell count does not match dimensions');
		this.cells = cells ? [...cells] : new Array(width * height).fill(null);
	}

	index(x: number, y: number): number {
		if (!this.inside(x, y)) throw new Error(`cell (${x},${y}) is outside the board`);
		return y * this.width + x;
	}

	inside(x: number, y: number): boolean {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
	get(x: number, y: number): P | null {
		return this.cells[this.index(x, y)];
	}
	set(x: number, y: number, piece: P | null): void {
		this.cells[this.index(x, y)] = piece;
	}

	move(from: { x: number; y: number }, to: { x: number; y: number }): P {
		const piece = this.get(from.x, from.y);
		if (piece === null) throw new Error('cannot move an empty cell');
		this.set(from.x, from.y, null);
		this.set(to.x, to.y, piece);
		return piece;
	}
}

export type CheckersSide = 'red' | 'black';
export interface CheckersPiece {
	side: CheckersSide;
	king: boolean;
}
export interface CheckersMove {
	from: number;
	to: number;
	captures: number[];
}
export interface CheckersState {
	board: Array<CheckersPiece | null>;
	turn: CheckersSide;
	forcedFrom: number | null;
}

/**
 * @example
 * ```ts
 * import { startingCheckers } from '@datamoc/mw_games/board';
 *
 * const state = startingCheckers();
 * console.log(state.turn, state.board.length); // 'red' 64
 * ```
 */
export function startingCheckers(): CheckersState {
	const board: Array<CheckersPiece | null> = new Array(64).fill(null);
	for (let y = 0; y < 3; y++)
		for (let x = 0; x < 8; x++) if ((x + y) % 2) board[y * 8 + x] = { side: 'black', king: false };
	for (let y = 5; y < 8; y++)
		for (let x = 0; x < 8; x++) if ((x + y) % 2) board[y * 8 + x] = { side: 'red', king: false };
	return { board, turn: 'red', forcedFrom: null };
}

/**
 * Legal moves for whoever's turn it is - captures only, when one is available, since a
 * capture is forced in checkers; `forcedFrom` narrows this to one piece mid-multi-jump.
 *
 * @example
 * ```ts
 * import { startingCheckers, checkersMoves } from '@datamoc/mw_games/board';
 *
 * const moves = checkersMoves(startingCheckers());
 * console.log(moves.length); // 7 - every red piece on the back row can step forward
 * ```
 */
export function checkersMoves(state: CheckersState): CheckersMove[] {
	const sources =
		state.forcedFrom === null
			? state.board.map((piece, from) => (piece?.side === state.turn ? from : -1)).filter((from) => from >= 0)
			: [state.forcedFrom];
	const captures = sources.flatMap((from) => checkersFrom(state, from, true));
	return captures.length > 0
		? captures
		: state.forcedFrom === null
			? sources.flatMap((from) => checkersFrom(state, from, false))
			: [];
}

/**
 * @example
 * ```ts
 * import { startingCheckers, checkersMoves, applyCheckersMove } from '@datamoc/mw_games/board';
 *
 * const state = startingCheckers();
 * applyCheckersMove(state, checkersMoves(state)[0]);
 * console.log(state.turn); // 'black' - the move used no capture, so the turn passes
 * ```
 */
export function applyCheckersMove(state: CheckersState, move: CheckersMove): void {
	if (
		!checkersMoves(state).some(
			(candidate) =>
				candidate.from === move.from &&
				candidate.to === move.to &&
				candidate.captures.length === move.captures.length,
		)
	)
		throw new Error('illegal checkers move');
	const piece = state.board[move.from];
	if (!piece) throw new Error('no checkers piece on the source cell');
	state.board[move.from] = null;
	for (const captured of move.captures) state.board[captured] = null;
	const promoted =
		!piece.king &&
		((piece.side === 'red' && Math.floor(move.to / 8) === 0) ||
			(piece.side === 'black' && Math.floor(move.to / 8) === 7));
	state.board[move.to] = { ...piece, king: piece.king || promoted };
	const next: CheckersState = {
		board: state.board,
		turn: state.turn,
		forcedFrom: move.captures.length > 0 ? move.to : null,
	};
	if (move.captures.length === 0 || checkersFrom(next, move.to, true).length === 0) {
		state.turn = state.turn === 'red' ? 'black' : 'red';
		state.forcedFrom = null;
	} else state.forcedFrom = move.to;
}

function checkersFrom(state: CheckersState, from: number, capture: boolean): CheckersMove[] {
	const piece = state.board[from];
	if (!piece) return [];
	const x = from % 8;
	const y = Math.floor(from / 8);
	const directions = piece.king ? [-1, 1] : piece.side === 'red' ? [-1] : [1];
	const out: CheckersMove[] = [];
	for (const dy of directions)
		for (const dx of [-1, 1]) {
			const mx = x + dx;
			const my = y + dy;
			const tx = x + dx * 2;
			const ty = y + dy * 2;
			if (capture) {
				if (tx < 0 || ty < 0 || tx >= 8 || ty >= 8) continue;
				const middle = my * 8 + mx;
				const target = ty * 8 + tx;
				if (state.board[middle]?.side !== piece.side && state.board[middle] && !state.board[target])
					out.push({ from, to: target, captures: [middle] });
			} else if (mx >= 0 && my >= 0 && mx < 8 && my < 8 && !state.board[my * 8 + mx]) {
				out.push({ from, to: my * 8 + mx, captures: [] });
			}
		}
	return out;
}

export type GoStone = 'black' | 'white';
export interface GoState {
	size: number;
	board: Array<GoStone | null>;
	turn: GoStone;
	ko: number | null;
	passes: number;
}

/**
 * @example
 * ```ts
 * import { startingGo } from '@datamoc/mw_games/board';
 *
 * const state = startingGo(9);
 * console.log(state.turn, state.board.length); // 'black' 81
 * ```
 */
export function startingGo(size = 9): GoState {
	if (size < 2 || size > 25) throw new Error('Go size must be between 2 and 25');
	return { size, board: new Array(size * size).fill(null), turn: 'black', ko: null, passes: 0 };
}

/**
 * Places a stone, captures any enemy group left with no liberties, and enforces ko (a move
 * that would recreate the position before the opponent's last capture is refused).
 *
 * @example
 * ```ts
 * import { startingGo, playGo } from '@datamoc/mw_games/board';
 *
 * const state = startingGo(9);
 * playGo(state, 4, 4);
 * console.log(state.turn); // 'white' - the turn passes after a legal move
 * ```
 */
export function playGo(state: GoState, x: number, y: number): void {
	const index = goIndex(state, x, y);
	if (state.board[index] || state.ko === index) throw new Error('Go cell is occupied or forbidden by ko');
	const board = [...state.board];
	board[index] = state.turn;
	const enemy = state.turn === 'black' ? 'white' : 'black';
	let captured = 0;
	//tracked directly rather than diffed against the old board afterwards, since the played
	//stone's own cell also differs and diffing can't tell the two apart
	let soleCaptured: number | null = null;
	for (const neighbour of goNeighbours(state, index)) {
		if (board[neighbour] !== enemy || liberties(board, state.size, neighbour) !== 0) continue;
		const removed = group(board, state.size, neighbour);
		if (removed.length === 1) soleCaptured = removed[0];
		for (const cell of removed) board[cell] = null;
		captured += removed.length;
	}
	if (liberties(board, state.size, index) === 0) throw new Error('suicide is not a legal Go move');
	state.ko = captured === 1 && liberties(board, state.size, index) === 1 ? soleCaptured : null;
	state.board = board;
	state.turn = enemy;
	state.passes = 0;
}

/**
 * @example
 * ```ts
 * import { startingGo, passGo, goResult } from '@datamoc/mw_games/board';
 *
 * const state = startingGo(9);
 * passGo(state);
 * passGo(state); // two passes in a row ends the game
 * console.log(goResult(state)); // 'finished'
 * ```
 */
export function passGo(state: GoState): void {
	state.turn = state.turn === 'black' ? 'white' : 'black';
	state.ko = null;
	state.passes++;
}

/**
 * @example
 * ```ts
 * import { startingGo, goResult } from '@datamoc/mw_games/board';
 *
 * console.log(goResult(startingGo(9))); // 'ongoing' - nobody has passed yet
 * ```
 */
export function goResult(state: GoState): 'ongoing' | 'finished' {
	return state.passes >= 2 ? 'finished' : 'ongoing';
}

/**
 * Stones on the board plus surrounded empty territory, per side - area scoring, not the
 * Japanese rule set's separate prisoner count.
 *
 * @example
 * ```ts
 * import { startingGo, playGo, goScore } from '@datamoc/mw_games/board';
 *
 * const state = startingGo(9);
 * playGo(state, 4, 4);
 * console.log(goScore(state)); // { black: 1, white: 0 } - one stone, no territory settled yet
 * ```
 */
export function goScore(state: GoState): { black: number; white: number } {
	const score = { black: 0, white: 0 };
	const seen = new Set<number>();
	for (let i = 0; i < state.board.length; i++) {
		const stone = state.board[i];
		if (stone) score[stone]++;
		else if (!seen.has(i)) {
			const area = group(state.board, state.size, i);
			const borders = new Set<GoStone>();
			for (const cell of area)
				for (const neighbour of goNeighbours(state, cell))
					if (state.board[neighbour]) borders.add(state.board[neighbour]!);
			for (const cell of area) seen.add(cell);
			if (borders.size === 1) score[[...borders][0]] += area.length;
		}
	}
	return score;
}

function goIndex(state: GoState, x: number, y: number): number {
	if (x < 0 || y < 0 || x >= state.size || y >= state.size) throw new Error('Go cell is outside the board');
	return y * state.size + x;
}
function goNeighbours(state: GoState, index: number): number[] {
	const x = index % state.size;
	const y = Math.floor(index / state.size);
	return [
		[x - 1, y],
		[x + 1, y],
		[x, y - 1],
		[x, y + 1],
	]
		.filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < state.size && ny < state.size)
		.map(([nx, ny]) => ny * state.size + nx);
}
function group(board: Array<GoStone | null>, size: number, start: number): number[] {
	const stone = board[start];
	if (!stone) return [];
	const found: number[] = [];
	const todo = [start];
	const seen = new Set<number>();
	while (todo.length) {
		const index = todo.pop()!;
		if (seen.has(index) || board[index] !== stone) continue;
		seen.add(index);
		found.push(index);
		const x = index % size;
		const y = Math.floor(index / size);
		for (const [nx, ny] of [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1],
		])
			if (nx >= 0 && ny >= 0 && nx < size && ny < size) todo.push(ny * size + nx);
	}
	return found;
}
function liberties(board: Array<GoStone | null>, size: number, start: number): number {
	const cells = group(board, size, start);
	const empty = new Set<number>();
	for (const index of cells) {
		const x = index % size;
		const y = Math.floor(index / size);
		for (const [nx, ny] of [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1],
		])
			if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny * size + nx] === null)
				empty.add(ny * size + nx);
	}
	return empty.size;
}

export interface BackgammonState {
	points: number[];
	bar: { white: number; black: number };
	off: { white: number; black: number };
	turn: 'white' | 'black';
}
export interface BackgammonMove {
	from: number | 'bar';
	to: number | 'off';
	die: number;
}

/**
 * @example
 * ```ts
 * import { startingBackgammon } from '@datamoc/mw_games/board';
 *
 * const state = startingBackgammon();
 * console.log(state.points[0], state.points[23]); // 2 -2 - white's and black's back checkers
 * ```
 */
export function startingBackgammon(): BackgammonState {
	const points = new Array(24).fill(0);
	points[0] = 2;
	points[11] = 5;
	points[16] = 3;
	points[18] = 5;
	points[23] = -2;
	points[12] = -5;
	points[7] = -3;
	points[5] = -5;
	return { points, bar: { white: 0, black: 0 }, off: { white: 0, black: 0 }, turn: 'white' };
}

/** Doubles roll as four of the same die, not two - the standard backgammon rule.
 *
 * @example
 * ```ts
 * import { rollBackgammonDice } from '@datamoc/mw_games/board';
 *
 * const dice = rollBackgammonDice();
 * console.log(dice.length === 2 || dice.length === 4); // true
 * ```
 */
export function rollBackgammonDice(): number[] {
	const dice = rollDice(2, 6);
	return dice[0] === dice[1] ? [...dice, ...dice] : dice;
}

/**
 * @example
 * ```ts
 * import { startingBackgammon, backgammonMoves } from '@datamoc/mw_games/board';
 *
 * const moves = backgammonMoves(startingBackgammon(), [1]);
 * console.log(moves.length, moves[0]); // 3 { from: 0, to: 1, die: 1 }
 * ```
 */
export function backgammonMoves(state: BackgammonState, dice: readonly number[]): BackgammonMove[] {
	const side = state.turn === 'white' ? 1 : -1;
	const out: BackgammonMove[] = [];
	for (const die of dice) {
		if (state.bar[state.turn] > 0) {
			const to = state.turn === 'white' ? die - 1 : 24 - die;
			if (canBackgammonLand(state, to, side)) out.push({ from: 'bar', to, die });
			continue;
		}
		for (let from = 0; from < 24; from++)
			if (state.points[from] * side > 0) {
				const to = from + die * side;
				if (to < 0 || to >= 24) out.push({ from, to: 'off', die });
				else if (canBackgammonLand(state, to, side)) out.push({ from, to, die });
			}
	}
	return out;
}

/**
 * @example
 * ```ts
 * import { startingBackgammon, backgammonMoves, applyBackgammonMove } from '@datamoc/mw_games/board';
 *
 * const state = startingBackgammon();
 * applyBackgammonMove(state, backgammonMoves(state, [1])[0]);
 * console.log(state.points[0], state.points[1]); // 1 1 - one checker moved from point 0 to point 1
 * ```
 */
export function applyBackgammonMove(state: BackgammonState, move: BackgammonMove): void {
	if (
		!backgammonMoves(state, [move.die]).some(
			(candidate) => candidate.from === move.from && candidate.to === move.to,
		)
	)
		throw new Error('illegal backgammon move');
	const side = state.turn === 'white' ? 1 : -1;
	if (move.from === 'bar') state.bar[state.turn]--;
	else state.points[move.from] -= side;
	if (move.to === 'off') state.off[state.turn]++;
	else {
		if (state.points[move.to] * side < 0) {
			const enemy = state.turn === 'white' ? 'black' : 'white';
			state.points[move.to] = 0;
			state.bar[enemy]++;
		}
		state.points[move.to] += side;
	}
}
function canBackgammonLand(state: BackgammonState, to: number, side: number): boolean {
	return state.points[to] * side >= -1;
}

export type CardSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type CardRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export interface Card {
	suit: CardSuit;
	rank: CardRank;
}

/**
 * @example
 * ```ts
 * import { createDeck } from '@datamoc/mw_games/board';
 *
 * console.log(createDeck().length); // 52
 * console.log(createDeck(2).length); // 54 - two jokers added
 * ```
 */
export function createDeck(jokers = 0): Card[] {
	const suits: CardSuit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
	const cards: Card[] = [];
	for (const suit of suits) for (let rank = 1; rank <= 13; rank++) cards.push({ suit, rank: rank as CardRank });
	return cards.concat(new Array(jokers).fill(null).map(() => ({ suit: 'spades' as const, rank: 1 as const })));
}
/**
 * @example
 * ```ts
 * import { createDeck, shuffleDeck } from '@datamoc/mw_games/board';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * const shuffled = Random.withSeed(1, () => shuffleDeck(createDeck()));
 * console.log(shuffled[0]); // { suit: 'hearts', rank: 6 } - deterministic for seed 1
 * ```
 */
export function shuffleDeck(deck: Card[]): Card[] {
	return Random.shuffle(deck);
}
/**
 * @example
 * ```ts
 * import { createDeck, deal } from '@datamoc/mw_games/board';
 *
 * const hands = deal(createDeck(), 4, 13);
 * console.log(hands.length, hands[0].length); // 4 13 - a full deck dealt to four players
 * ```
 */
export function deal<T>(deck: T[], hands: number, cardsEach: number): T[][] {
	if (hands < 0 || cardsEach < 0 || deck.length < hands * cardsEach) throw new Error('not enough cards to deal');
	return Array.from({ length: hands }, () => deck.splice(0, cardsEach));
}

export interface TrickPlay<O = string> {
	owner: O;
	card: Card;
}
/** Highest card of the trump suit wins; failing that, highest card of whoever led. Ace (rank 1) ranks lowest, as in belote/tarot/bridge follow-suit play.
 *
 * @example
 * ```ts
 * import { trickWinner } from '@datamoc/mw_games/board';
 *
 * const plays = [
 * 	{ owner: 'north', card: { suit: 'hearts' as const, rank: 5 as const } },
 * 	{ owner: 'south', card: { suit: 'hearts' as const, rank: 10 as const } },
 * 	{ owner: 'east', card: { suit: 'spades' as const, rank: 13 as const } },
 * ];
 *
 * console.log(trickWinner(plays)); // 'south' - highest heart, hearts led
 * console.log(trickWinner(plays, 'spades')); // 'east' - the only spade played beats every heart
 * ```
 */
export function trickWinner<O = string>(plays: TrickPlay<O>[], trumpSuit?: CardSuit): O {
	if (plays.length === 0) throw new Error('a trick needs at least one play');
	const leadSuit = plays[0].card.suit;
	const rankValue = (card: Card): number => (card.rank === 1 ? 14 : card.rank);
	const contest =
		trumpSuit && plays.some((play) => play.card.suit === trumpSuit)
			? plays.filter((play) => play.card.suit === trumpSuit)
			: plays.filter((play) => play.card.suit === leadSuit);
	return contest.reduce((best, play) => (rankValue(play.card) > rankValue(best.card) ? play : best)).owner;
}

export interface SolitaireState {
	stock: Card[];
	waste: Card[];
	tableau: Array<{ down: Card[]; up: Card[] }>;
	foundations: Card[][];
}
/**
 * A Klondike-shaped deal: seven tableau columns, each with one face-up card on a run of
 * face-down ones, the rest in the stock.
 *
 * @example
 * ```ts
 * import { dealSolitaire } from '@datamoc/mw_games/board';
 *
 * const state = dealSolitaire(1); // seeded, for a reproducible deal
 * console.log(state.stock.length); // 24 - 52 minus the 28 dealt across the tableau
 * console.log(state.tableau[0].up); // [{ suit: 'clubs', rank: 12 }] - one face-up card to start
 * ```
 */
export function dealSolitaire(seed?: number): SolitaireState {
	const deck = createDeck();
	if (seed === undefined) shuffleDeck(deck);
	else Random.withSeed(seed, () => shuffleDeck(deck));
	const tableau = Array.from({ length: 7 }, (_, column) => ({
		down: deck.splice(0, 6 - column),
		up: deck.splice(0, 1),
	}));
	return { stock: deck, waste: [], tableau, foundations: [[], [], [], []] };
}
/**
 * Draws from the stock to the waste; once the stock is empty, the waste is turned back over
 * into a new stock rather than the game being stuck.
 *
 * @example
 * ```ts
 * import { dealSolitaire, drawSolitaire } from '@datamoc/mw_games/board';
 *
 * const state = dealSolitaire(1);
 * const card = drawSolitaire(state);
 * console.log(card); // { suit: 'hearts', rank: 7 }
 * console.log(state.waste.length, state.stock.length); // 1 23
 * ```
 */
export function drawSolitaire(state: SolitaireState): Card | null {
	if (state.stock.length === 0) {
		state.stock = state.waste.reverse();
		state.waste = [];
	}
	const card = state.stock.pop() ?? null;
	if (card) state.waste.push(card);
	return card;
}
/**
 * Moves the top `count` face-up cards from one tableau column to another - legal only onto a
 * card one rank higher of the opposite colour, or onto an empty column with a king.
 *
 * @example
 * ```ts
 * import { dealSolitaire, moveSolitaireTableau } from '@datamoc/mw_games/board';
 *
 * const state = dealSolitaire(1);
 * moveSolitaireTableau(state, 4, 0, 1); // the jack of hearts onto the queen of clubs
 * console.log(state.tableau[0].up.at(-1)); // { suit: 'hearts', rank: 11 }
 * ```
 */
export function moveSolitaireTableau(state: SolitaireState, from: number, to: number, count = 1): void {
	const source = state.tableau[from];
	const target = state.tableau[to];
	const moving = source?.up.slice(-count);
	if (
		!source ||
		!target ||
		!moving?.length ||
		(target.up.length === 0 ? moving[0].rank !== 13 : !alternatingDescending(moving[0], target.up.at(-1)!))
	)
		throw new Error('illegal solitaire tableau move');
	source.up.splice(-count, count);
	target.up.push(...moving);
	if (source.down.length && source.up.length === 0) source.up.push(source.down.pop()!);
}
/**
 * Moves a card to its suit's foundation pile - legal only as the next rank up (an ace
 * starts a pile).
 *
 * @example
 * ```ts
 * import { dealSolitaire, drawSolitaire, moveSolitaireToFoundation } from '@datamoc/mw_games/board';
 *
 * const state = dealSolitaire(1);
 * let card = drawSolitaire(state);
 * while (card && card.rank !== 1) card = drawSolitaire(state); // draw until an ace surfaces
 *
 * moveSolitaireToFoundation(state, 'waste');
 * console.log(state.foundations.some((pile) => pile.length === 1)); // true
 * ```
 */
export function moveSolitaireToFoundation(state: SolitaireState, source: 'waste' | number): void {
	const card = source === 'waste' ? state.waste.at(-1) : state.tableau[source].up.at(-1);
	if (!card) throw new Error('no solitaire card to move');
	const foundation = state.foundations.find((pile) => pile[0]?.suit === card.suit || pile.length === 0);
	if (!foundation || card.rank !== foundation.length + 1) throw new Error('card cannot move to its foundation');
	if (source === 'waste') state.waste.pop();
	else {
		const column = state.tableau[source];
		column.up.pop();
		if (column.down.length && column.up.length === 0) column.up.push(column.down.pop()!);
	}
	foundation.push(card);
}
/**
 * @example
 * ```ts
 * import { dealSolitaire, solitaireWon } from '@datamoc/mw_games/board';
 *
 * console.log(solitaireWon(dealSolitaire(1))); // false - a fresh deal is never already won
 * ```
 */
export function solitaireWon(state: SolitaireState): boolean {
	return state.foundations.every((pile) => pile.length === 13);
}
function alternatingDescending(top: Card, bottom: Card): boolean {
	const topRed = top.suit === 'diamonds' || top.suit === 'hearts';
	const bottomRed = bottom.suit === 'diamonds' || bottom.suit === 'hearts';
	return top.rank === bottom.rank - 1 && topRed !== bottomRed;
}

/**
 * @example
 * ```ts
 * import { rollDice } from '@datamoc/mw_games/board';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * const rolls = Random.withSeed(1, () => rollDice(2, 6));
 * console.log(rolls); // [5, 2] - deterministic for seed 1
 * ```
 */
export function rollDice(count: number, sides: number): number[] {
	if (!Number.isInteger(count) || count < 0 || !Number.isInteger(sides) || sides < 1)
		throw new Error('dice need a non-negative count and positive sides');
	return Array.from({ length: count }, () => Random.range(1, sides));
}
/**
 * Rolls a `"NdS+M"`-style expression (2d6+1: two six-sided dice, plus one).
 *
 * @example
 * ```ts
 * import { rollExpression } from '@datamoc/mw_games/board';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * console.log(Random.withSeed(1, () => rollExpression('2d6+1'))); // 8 - rolls [5, 2], plus 1
 * ```
 */
export function rollExpression(expression: string): number {
	const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(expression.trim());
	if (!match) throw new Error(`bad dice expression: "${expression}"`);
	return rollDice(Number(match[1]), Number(match[2])).reduce((sum, roll) => sum + roll, Number(match[3] ?? 0));
}

/**
 * A cup of dice a player can keep and re-roll - Yahtzee's own mechanic, generalised to any
 * count/sides.
 *
 * @example
 * ```ts
 * import { DiceCup } from '@datamoc/mw_games/board';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * const cup = Random.withSeed(1, () => new DiceCup(5, 6));
 * console.log(cup.values); // [5, 2, 6, 1, 1]
 *
 * cup.keep(2); // keep the 6
 * cup.reRoll(); // every other die rolls again; index 2 stays a 6
 * ```
 */
export class DiceCup {
	readonly values: number[];
	readonly count: number;
	readonly sides: number;
	private kept = new Set<number>();
	constructor(count: number, sides: number) {
		this.count = count;
		this.sides = sides;
		this.values = rollDice(count, sides);
	}
	reRoll(): void {
		for (let i = 0; i < this.values.length; i++)
			if (!this.kept.has(i)) this.values[i] = Random.range(1, this.sides);
	}
	keep(index: number): void {
		if (index < 0 || index >= this.count) throw new Error('die index is outside the cup');
		this.kept.add(index);
	}
	clearKept(): void {
		this.kept.clear();
	}
}

export type DiceCategory =
	| 'ones'
	| 'twos'
	| 'threes'
	| 'fours'
	| 'fives'
	| 'sixes'
	| 'threeKind'
	| 'fourKind'
	| 'fullHouse'
	| 'smallStraight'
	| 'largeStraight'
	| 'yahtzee'
	| 'chance';
/**
 * Scores five d6 values against one Yahtzee category.
 *
 * @example
 * ```ts
 * import { scoreDice } from '@datamoc/mw_games/board';
 *
 * console.log(scoreDice([4, 4, 4, 4, 4], 'yahtzee')); // 50
 * console.log(scoreDice([1, 2, 3, 4, 5], 'chance')); // 15 - the sum of all five dice
 * console.log(scoreDice([4, 4, 4, 4, 4], 'fours')); // 20 - five fours, four points each
 * ```
 */
export function scoreDice(values: readonly number[], category: DiceCategory): number {
	if (values.length !== 5 || values.some((value) => value < 1 || value > 6))
		throw new Error('a score sheet needs five d6 values');
	const counts = new Map<number, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	const total = values.reduce((sum, value) => sum + value, 0);
	if (category === 'chance') return total;
	if (category === 'yahtzee') return counts.size === 1 ? 50 : 0;
	if (category === 'fullHouse') return [...counts.values()].sort().join(',') === '2,3' ? 25 : 0;
	if (category === 'threeKind') return [...counts.values()].some((count) => count >= 3) ? total : 0;
	if (category === 'fourKind') return [...counts.values()].some((count) => count >= 4) ? total : 0;
	if (category === 'smallStraight' || category === 'largeStraight') {
		const runs = ['1234', '2345', '3456'];
		const large = ['12345', '23456'];
		const unique = [...counts.keys()].sort().join('');
		return (category === 'smallStraight' ? runs : large).some((run) => unique.includes(run))
			? category === 'smallStraight'
				? 30
				: 40
			: 0;
	}
	const face = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(category) + 1;
	return face > 0 ? (counts.get(face) ?? 0) * face : 0;
}
