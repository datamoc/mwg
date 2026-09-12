import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Board from '../src/board/index.ts';
import { CombatHooks } from '../src/roguelike/index.ts';

test('generic board grid moves and captures pieces', () => {
	const board = new Board.BoardGrid(3, 3);
	const piece = { id: 'pawn', owner: 'a', kind: 'token' };
	board.set(0, 0, piece);
	assert.equal(board.move({ x: 0, y: 0 }, { x: 1, y: 1 }), piece);
	assert.equal(board.get(1, 1), piece);
});

test('checkers starts with legal moves and promotes', () => {
	const state = Board.startingCheckers();
	assert.equal(Board.checkersMoves(state).length, 7);
	const promotion = { board: new Array(64).fill(null), turn: 'red' as const, forcedFrom: null };
	promotion.board[9] = { side: 'red' as const, king: false };
	const move = Board.checkersMoves(promotion).find((candidate) => candidate.to === 0);
	assert.ok(move);
	Board.applyCheckersMove(promotion, move);
	assert.equal(promotion.board[0]?.king, true);
});

test('Go captures surrounded stones and ends after two passes', () => {
	const state = Board.startingGo(3);
	state.board[4] = 'white';
	state.board[3] = 'black';
	state.board[1] = 'black';
	state.board[7] = 'black';
	Board.playGo(state, 2, 1);
	assert.equal(state.board[4], null);
	Board.passGo(state);
	Board.passGo(state);
	assert.equal(Board.goResult(state), 'finished');
});

test('ko forbids recapture at the captured square, not the square just played', () => {
	const state = Board.startingGo(3);
	//a single-stone ko: black plays the corner (0,0), capturing the lone white stone at
	//(1,0) - the black stone that just played ends up with exactly one liberty, the point
	//it just vacated by capturing, which is the ko rule's trigger
	state.board[1] = 'white'; // (1,0), the stone about to be captured
	state.board[2] = 'black'; // (2,0)
	state.board[3] = 'white'; // (0,1), a separate white stone, not captured
	state.board[4] = 'black'; // (1,1)

	Board.playGo(state, 0, 0);

	assert.equal(state.board[1], null, 'the surrounded white stone is captured');
	assert.equal(state.board[3], 'white', 'the unrelated white stone survives');
	//the play square (0,0 -> index 0) is lower than the captured square (index 1); a ko
	//point picked by "first index that differs" rather than "the captured stone" would
	//wrongly point at 0, which is already occupied and so never actually forbids anything
	assert.equal(state.ko, 1);
	assert.throws(() => Board.playGo(state, 1, 0), /occupied or forbidden by ko/);
});

test('backgammon generates a bar entry and hits a blot', () => {
	const state = Board.startingBackgammon();
	state.bar.white = 1;
	state.points[0] = -1;
	const move = Board.backgammonMoves(state, [1]).find((candidate) => candidate.from === 'bar');
	assert.ok(move);
	Board.applyBackgammonMove(state, move);
	assert.equal(state.bar.white, 0);
	assert.equal(state.bar.black, 1);
});

//white checkers live on points 0-23 and bear off past 24, so a layout is just those points
function bearOffState(points: Record<number, number>, side: 'white' | 'black' = 'white') {
	const state = Board.startingBackgammon();
	state.points = new Array(24).fill(0);
	for (const [point, count] of Object.entries(points)) state.points[Number(point)] = count;
	state.turn = side;
	return state;
}
const bearOffFrom = (moves: Board.BackgammonMove[]): number[] =>
	moves
		.filter(
			(move): move is Board.BackgammonMove & { from: number } =>
				move.to === 'off' && typeof move.from === 'number',
		)
		.map((move) => move.from);

test('bearing off needs every checker in the home board', () => {
	//the opening position still has white checkers on 0, 11 and 16, so a 6 may not come off,
	//even though the lone checker on 18 would reach the off edge with it
	const opening = Board.startingBackgammon();
	assert.deepEqual(bearOffFrom(Board.backgammonMoves(opening, [6])), []);
	assert.ok(
		Board.backgammonMoves(opening, [6]).some((move) => move.to === 22),
		'in-board movement is still offered',
	);

	const home = bearOffState({ 18: 1, 20: 1 });
	assert.deepEqual(
		bearOffFrom(Board.backgammonMoves(home, [6])).sort((a, b) => a - b),
		[18, 20],
		'all home, so the 6 takes the 18 exactly and the nearest checker on the 20',
	);
});

test('an exact roll bears off any home checker; an over-roll only the closest one', () => {
	//20 is four pips out, 23 is one: with a 4 the 20 comes off exactly, and the 23 comes off
	//on the over-roll because it is the checker nearest the edge
	const exact = bearOffState({ 20: 1, 23: 1 });
	assert.deepEqual(
		bearOffFrom(Board.backgammonMoves(exact, [4])).sort((a, b) => a - b),
		[20, 23],
	);

	//with a 6 the 22 may not come off: the 23 is nearer the edge, so the 6 must be played on it
	const overRoll = bearOffState({ 22: 1, 23: 1 });
	assert.deepEqual(bearOffFrom(Board.backgammonMoves(overRoll, [6])), [23]);

	//and a checker further out than a die that cannot reach it is a normal in-board move
	const blocked = bearOffState({ 19: 1, 22: 1 });
	assert.deepEqual(bearOffFrom(Board.backgammonMoves(blocked, [4])), [22]);
});

test('a checker on the bar blocks bearing off, and black bears off the other way', () => {
	const barred = bearOffState({ 20: 1 });
	barred.bar.white = 1;
	assert.deepEqual(bearOffFrom(Board.backgammonMoves(barred, [6])), []);

	//black moves toward 0 and bears off past it, so point 0 is nearest the edge
	const black = bearOffState({ 0: -1, 1: -1 }, 'black');
	assert.deepEqual(bearOffFrom(Board.backgammonMoves(black, [6])), [0]);

	const applied = Board.backgammonMoves(bearOffState({ 20: 1 }), [4])[0];
	const state = bearOffState({ 20: 1 });
	Board.applyBackgammonMove(state, applied);
	assert.equal(state.off.white, 1);
	assert.equal(state.points[20], 0);
});

test('cards deal without duplication and solitaire deals seven columns', () => {
	const deck = Board.createDeck();
	const hands = Board.deal(deck, 4, 5);
	assert.equal(deck.length, 32);
	assert.equal(new Set(hands.flat().map((card) => `${card.suit}:${card.rank}`)).size, 20);
	const solitaire = Board.dealSolitaire(4);
	assert.equal(solitaire.tableau.length, 7);
	assert.deepEqual(
		solitaire.tableau.map((column) => column.down.length + column.up.length),
		[7, 6, 5, 4, 3, 2, 1],
	);
	assert.equal(solitaire.stock.length, 52 - 28);
});

test('trickWinner takes the highest trump, or the highest of the lead suit with no trump played', () => {
	const plays: Board.TrickPlay[] = [
		{ owner: 'north', card: { suit: 'hearts', rank: 10 } },
		{ owner: 'east', card: { suit: 'spades', rank: 4 } },
		{ owner: 'south', card: { suit: 'hearts', rank: 1 } },
		{ owner: 'west', card: { suit: 'clubs', rank: 13 } },
	];
	assert.equal(Board.trickWinner(plays), 'south');
	assert.equal(Board.trickWinner(plays, 'spades'), 'east');
	assert.throws(() => Board.trickWinner([]));
});

test('createDeck adds jokers and deal refuses to overdraw', () => {
	assert.equal(Board.createDeck(2).length, 54);
	assert.throws(() => Board.deal(Board.createDeck(), 5, 11));
});

test('solitaire tableau moves only alternate colour and descend by one', () => {
	const state = Board.dealSolitaire(1);
	state.tableau[0].up = [{ suit: 'spades', rank: 13 }];
	state.tableau[0].down = [];
	state.tableau[1].up = [{ suit: 'clubs', rank: 12 }];
	assert.throws(() => Board.moveSolitaireTableau(state, 1, 0));
	state.tableau[1].up = [{ suit: 'hearts', rank: 12 }];
	state.tableau[1].down = [];
	Board.moveSolitaireTableau(state, 1, 0);
	assert.deepEqual(state.tableau[0].up.at(-1), { suit: 'hearts', rank: 12 });
	assert.equal(state.tableau[1].up.length, 0);
});

test('foundation moves require suit sequence from the ace up, and win needs all four full', () => {
	const state = Board.dealSolitaire(1);
	state.waste = [{ suit: 'clubs', rank: 2 }];
	assert.throws(() => Board.moveSolitaireToFoundation(state, 'waste'));
	state.waste = [{ suit: 'clubs', rank: 1 }];
	Board.moveSolitaireToFoundation(state, 'waste');
	assert.equal(
		state.foundations.some((pile) => pile.length === 1),
		true,
	);
	assert.equal(Board.solitaireWon(state), false);
	for (const foundation of state.foundations)
		for (let rank = foundation.length + 1; rank <= 13; rank++)
			foundation.push({ suit: 'clubs', rank: rank as Board.CardRank });
	assert.equal(Board.solitaireWon(state), true);
});

test('drawSolitaire recycles the waste pile once the stock runs out', () => {
	const state = Board.dealSolitaire(1);
	state.stock = [{ suit: 'diamonds', rank: 5 }];
	state.waste = [{ suit: 'hearts', rank: 7 }];
	Board.drawSolitaire(state);
	assert.equal(state.stock.length, 0);
	assert.equal(state.waste.length, 2);
	const recycled = Board.drawSolitaire(state);
	assert.deepEqual(recycled, { suit: 'hearts', rank: 7 });
	assert.equal(state.stock.length, 1);
});

test('DiceCup rerolls only unkept dice', () => {
	const cup = new Board.DiceCup(5, 6);
	cup.keep(0);
	const kept = cup.values[0];
	cup.reRoll();
	assert.equal(cup.values[0], kept);
	assert.throws(() => cup.keep(5));
});

test('scoreDice scores every category, including the misses', () => {
	assert.equal(Board.scoreDice([1, 1, 1, 4, 5], 'threes'), 0);
	assert.equal(Board.scoreDice([3, 3, 3, 4, 5], 'threes'), 9);
	assert.equal(Board.scoreDice([2, 2, 2, 5, 5], 'fullHouse'), 25);
	assert.equal(Board.scoreDice([2, 2, 3, 5, 5], 'fullHouse'), 0);
	assert.equal(Board.scoreDice([1, 2, 3, 4, 6], 'smallStraight'), 30);
	assert.equal(Board.scoreDice([1, 2, 3, 4, 5], 'largeStraight'), 40);
	assert.equal(Board.scoreDice([6, 6, 6, 6, 6], 'yahtzee'), 50);
	assert.equal(Board.scoreDice([6, 6, 6, 6, 2], 'yahtzee'), 0);
	assert.equal(Board.scoreDice([1, 2, 3, 4, 5], 'chance'), 15);
	assert.throws(() => Board.scoreDice([1, 2, 3, 4], 'chance'));
});

test('dice expressions and combat hooks are deterministic and composable', () => {
	const first = Board.rollExpression('2d6+1');
	assert.ok(first >= 3 && first <= 13);
	const hooks = new CombatHooks<string>();
	const source = {};
	hooks.on(
		'beforeDamage',
		(context) => {
			context.amount *= 2;
		},
		source,
	);
	hooks.on('beforeDamage', (context) => {
		context.amount -= 3;
	});
	assert.equal(hooks.modifyDamage('a', 'b', 4).amount, 5);
	hooks.offSource(source);
	assert.equal(hooks.modifyDamage('a', 'b', 4).amount, 1);
});

test('CombatHooks reports prevented damage and fires named lifecycle events', () => {
	const hooks = new CombatHooks<string>();
	hooks.on('beforeDamage', (context) => {
		context.amount = 0;
	});
	const context = hooks.modifyDamage('a', 'b', 10);
	assert.equal(context.prevented, true);
	let killed: string | undefined;
	hooks.on('onKill', (context) => {
		killed = context.defender;
	});
	hooks.emit('onKill', { attacker: 'a', defender: 'b', amount: 0, prevented: false });
	assert.equal(killed, 'b');
});
