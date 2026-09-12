import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	startingTactics,
	addTacticalUnit,
	tacticalMoves,
	moveTacticalUnit,
	setTacticalOverwatch,
	triggerTacticalOverwatch,
	tacticalAttack,
	endTacticalTurn,
} from '../src/board/Tactics.ts';
import type { TacticalState } from '../src/board/Tactics.ts';

//a wall across the middle of row 0 forces a detour: (0,0) to (4,0) is 4 apart in a
//straight line, but the only real path goes down, across, and back up - 6 steps
function detourMap() {
	const state = startingTactics(5, 3, 'square');
	for (const x of [1, 2, 3]) state.cells[0 * state.width + x].passable = false;
	addTacticalUnit(state, { id: 'a', owner: 'red', x: 0, y: 0, hp: 10, maxHp: 10, actions: 0 });
	return state;
}

test('a move that requires a detour is priced at the real path length, not straight-line distance', () => {
	const state = detourMap();
	getUnit(state).actions = 6;
	const move = tacticalMoves(state, 'a').find((m) => m.x === 4 && m.y === 0);
	assert.ok(move, 'the detour target should be reachable with enough actions');
	assert.equal(move.cost, 6, 'cost must reflect the actual 6-step detour, not the straight-line distance of 4');
});

test('a move whose real path exceeds the action budget is not offered at all', () => {
	const state = detourMap();
	//enough for the straight-line distance (4) but not the real 6-step detour
	getUnit(state).actions = 4;
	const move = tacticalMoves(state, 'a').find((m) => m.x === 4 && m.y === 0);
	assert.equal(move, undefined, 'the old bug listed this as legal at the cheap straight-line cost');

	getUnit(state).actions = 5;
	assert.equal(
		tacticalMoves(state, 'a').find((m) => m.x === 4 && m.y === 0),
		undefined,
	);
});

test('moving spends exactly the real path cost', () => {
	const state = detourMap();
	getUnit(state).actions = 6;
	const move = tacticalMoves(state, 'a').find((m) => m.x === 4 && m.y === 0)!;
	moveTacticalUnit(state, move);
	assert.equal(getUnit(state).actions, 0);
	assert.equal(getUnit(state).x, 4);
	assert.equal(getUnit(state).y, 0);
});

function getUnit(state: ReturnType<typeof detourMap>) {
	return state.units.find((u) => u.id === 'a')!;
}

test('zone of control blocks passing through a cell threatened by an unengaged enemy', () => {
	//3x2 square map; C at (1,1) threatens (0,1), (2,1) and (1,0) - both routes from
	//(0,0) to (2,0) cross one of those cells, and neither unit starts adjacent to the other
	const state = startingTactics(3, 2, 'square');
	addTacticalUnit(state, { id: 'a', owner: 'red', x: 0, y: 0, hp: 10, maxHp: 10, actions: 10 });
	addTacticalUnit(state, { id: 'c', owner: 'blue', x: 1, y: 1, hp: 10, maxHp: 10, actions: 0 });

	const move = tacticalMoves(state, 'a').find((m) => m.x === 2 && m.y === 0);
	assert.equal(move, undefined, 'both routes are cut off at the first threatened cell');
});

test('zone of control does not block a unit from moving onto a threatened cell as its final stop', () => {
	const state = startingTactics(3, 2, 'square');
	addTacticalUnit(state, { id: 'a', owner: 'red', x: 0, y: 0, hp: 10, maxHp: 10, actions: 10 });
	addTacticalUnit(state, { id: 'c', owner: 'blue', x: 1, y: 1, hp: 10, maxHp: 10, actions: 0 });

	//(1,0) is one of C's threatened cells, but stopping there (rather than passing through
	//it) is the standard zone-of-control exception
	const move = tacticalMoves(state, 'a').find((m) => m.x === 1 && m.y === 0);
	assert.ok(move, 'a threatened cell can still be the final stop of a move');
	assert.equal(move.cost, 1);
});

test("a unit already adjacent to an enemy ignores that enemy's zone of control", () => {
	//B starts adjacent to A, so A is already engaged with it; B's zone (which would
	//otherwise cut the only route through row 1) should not apply to A's move at all
	const state = startingTactics(3, 2, 'square');
	addTacticalUnit(state, { id: 'a', owner: 'red', x: 0, y: 0, hp: 10, maxHp: 10, actions: 10 });
	addTacticalUnit(state, { id: 'b', owner: 'blue', x: 1, y: 0, hp: 10, maxHp: 10, actions: 0 });

	const move = tacticalMoves(state, 'a').find((m) => m.x === 2 && m.y === 0);
	assert.ok(move, 'already being engaged with the only threatening enemy lifts its zone');
	assert.equal(move.cost, 4, 'the real route still has to go around the occupied cell (1,0)');
});

function unitOf(state: TacticalState, id: string) {
	const unit = state.units.find((candidate) => candidate.id === id);
	assert.ok(unit, `expected unit "${id}"`);
	return unit;
}

test('overwatch spends the rest of the turn and fires once at a moving enemy in range', () => {
	const state = startingTactics(6, 1, 'square');
	addTacticalUnit(state, { id: 'watch', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'mover', owner: 'red', x: 3, y: 0, hp: 10, maxHp: 10, actions: 2 });
	setTacticalOverwatch(state, 'watch');
	assert.equal(unitOf(state, 'watch').overwatch, true);
	assert.equal(unitOf(state, 'watch').actions, 0, 'entering overwatch spends what is left');

	state.cells[3].cover = 1; // the cell the mover is standing on
	const reactions = triggerTacticalOverwatch(state, 'mover', 4);
	assert.deepEqual(reactions, [{ attacker: 'watch', defender: 'mover', damage: 3, cover: 1, killed: false }]);
	assert.equal(unitOf(state, 'mover').hp, 7);
	assert.equal(unitOf(state, 'watch').overwatch, false, 'reacting spends the overwatch');
});

test('overwatch is silent out of range, and only an active unit may enter it', () => {
	const state = startingTactics(6, 1, 'square');
	addTacticalUnit(state, { id: 'watch', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'far', owner: 'red', x: 4, y: 0, hp: 10, maxHp: 10, actions: 2 });
	setTacticalOverwatch(state, 'watch');
	assert.deepEqual(triggerTacticalOverwatch(state, 'far', 5), [], 'four cells away is out of reach');

	assert.throws(() => setTacticalOverwatch(state, 'far'), /only an active unit/);
	const spent = unitOf(state, 'watch');
	spent.overwatch = false;
	spent.actions = 0;
	assert.throws(() => setTacticalOverwatch(state, 'watch'), /only an active unit/);
});

test('a reaction that kills stops the rest of the overwatchers from firing', () => {
	const state = startingTactics(6, 1, 'square');
	addTacticalUnit(state, { id: 'w1', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'w2', owner: 'blue', x: 1, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'mover', owner: 'red', x: 2, y: 0, hp: 2, maxHp: 10, actions: 2 });
	setTacticalOverwatch(state, 'w1');
	setTacticalOverwatch(state, 'w2');

	const reactions = triggerTacticalOverwatch(state, 'mover', 5);
	assert.equal(reactions.length, 1);
	assert.equal(reactions[0].killed, true);
	assert.equal(
		state.units.some((unit) => unit.id === 'mover'),
		false,
		'a killed mover leaves the board',
	);
	assert.equal(unitOf(state, 'w2').overwatch, true, 'the second watcher never had to fire');
});

test('an attack needs the active side, a target in range, and is reduced by cover', () => {
	const state = startingTactics(6, 1, 'square');
	addTacticalUnit(state, { id: 'att', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'def', owner: 'red', x: 2, y: 0, hp: 3, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'far', owner: 'red', x: 5, y: 0, hp: 10, maxHp: 10, actions: 2 });
	addTacticalUnit(state, { id: 'ally', owner: 'blue', x: 1, y: 0, hp: 10, maxHp: 10, actions: 2 });
	state.cells[2].cover = 1;

	assert.deepEqual(tacticalAttack(state, 'att', 'def', 5), {
		attacker: 'att',
		defender: 'def',
		damage: 4,
		cover: 1,
		killed: true,
	});
	assert.equal(
		state.units.some((unit) => unit.id === 'def'),
		false,
	);
	assert.throws(() => tacticalAttack(state, 'att', 'ally', 3), /invalid tactical attack/, 'no friendly fire');
	assert.throws(() => tacticalAttack(state, 'far', 'att', 3), /invalid tactical attack/, "not red's turn");
	assert.throws(() => tacticalAttack(state, 'att', 'far', 3), /out of range/);
});

test('ending a turn refreshes each side to its own action budget, not a fixed two', () => {
	const state = startingTactics(6, 1, 'square');
	addTacticalUnit(state, { id: 'a', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, actions: 3 });
	addTacticalUnit(state, { id: 'b', owner: 'red', x: 1, y: 0, hp: 10, maxHp: 10, actions: 1 });
	unitOf(state, 'a').actions = 0;

	endTacticalTurn(state);
	assert.equal(state.turn, 'red');
	assert.equal(unitOf(state, 'b').actions, 1, "red refreshes to red's own one, not two");

	endTacticalTurn(state);
	assert.equal(state.turn, 'blue');
	assert.equal(state.round, 2, 'wrapping back to the first owner is a new round');
	assert.equal(unitOf(state, 'a').actions, 3, "blue refreshes to blue's own three");
});

test('ending a turn with no units is a no-op', () => {
	assert.doesNotThrow(() => endTacticalTurn(startingTactics(3, 3, 'square')));
});
