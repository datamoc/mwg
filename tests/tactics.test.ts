import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startingTactics, addTacticalUnit, tacticalMoves, moveTacticalUnit } from '../src/board/Tactics.ts';

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
	assert.equal(tacticalMoves(state, 'a').find((m) => m.x === 4 && m.y === 0), undefined);
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
