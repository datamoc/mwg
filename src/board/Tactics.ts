import { hexDistance, hexNeighbors } from '../core/Hex.ts';

export type TacticalShape = 'square' | 'hex';
export interface TacticalCell { passable: boolean; cover?: number; }
export interface TacticalUnit { id: string; owner: string; x: number; y: number; hp: number; maxHp: number; actions: number; overwatch?: boolean; }
export interface TacticalState { width: number; height: number; shape: TacticalShape; cells: TacticalCell[]; units: TacticalUnit[]; turn: string; round: number; }
export interface TacticalMove { unit: string; x: number; y: number; cost: number; }
export interface TacticalAttack { attacker: string; defender: string; damage: number; cover: number; killed: boolean; }

export function startingTactics(width: number, height: number, shape: TacticalShape = 'hex'): TacticalState {
	if (width < 1 || height < 1) throw new Error('a tactical map needs positive dimensions');
	return { width, height, shape, cells: Array.from({ length: width * height }, () => ({ passable: true, cover: 0 })), units: [], turn: '', round: 1 };
}

export function addTacticalUnit(state: TacticalState, unit: TacticalUnit): void {
	if (!tacticalInside(state, unit.x, unit.y) || state.units.some((other) => other.x === unit.x && other.y === unit.y)) throw new Error('tactical unit cannot be placed there');
	state.units.push({ ...unit });
	if (!state.turn) state.turn = unit.owner;
}

export function tacticalMoves(state: TacticalState, unitId: string): TacticalMove[] {
	const unit = getUnit(state, unitId);
	if (unit.owner !== state.turn || unit.actions <= 0) return [];
	const out: TacticalMove[] = [];
	for (let y = 0; y < state.height; y++) for (let x = 0; x < state.width; x++) {
		if ((x === unit.x && y === unit.y) || !state.cells[y * state.width + x].passable || occupied(state, x, y)) continue;
		const cost = tacticalPathCost(state, unit, x, y, unit.actions);
		if (cost !== null) out.push({ unit: unitId, x, y, cost });
	}
	return out;
}

export function moveTacticalUnit(state: TacticalState, move: TacticalMove): void {
	const legal = tacticalMoves(state, move.unit).find((candidate) => candidate.x === move.x && candidate.y === move.y);
	if (!legal) throw new Error('illegal tactical move');
	const unit = getUnit(state, move.unit);
	unit.x = move.x;
	unit.y = move.y;
	unit.actions -= legal.cost;
}

export function setTacticalOverwatch(state: TacticalState, unitId: string): void {
	const unit = getUnit(state, unitId);
	if (unit.owner !== state.turn || unit.actions <= 0) throw new Error('only an active unit can enter overwatch');
	unit.actions = 0;
	unit.overwatch = true;
}

export function triggerTacticalOverwatch(state: TacticalState, movingUnitId: string, damage: number): TacticalAttack[] {
	const moving = getUnit(state, movingUnitId);
	const reactions: TacticalAttack[] = [];
	for (const watcher of [...state.units]) {
		if (!watcher.overwatch || watcher.owner === moving.owner || tacticalDistance(state, watcher, moving) > 3) continue;
		const cover = state.cells[moving.y * state.width + moving.x].cover ?? 0;
		const dealt = Math.max(0, damage - cover);
		moving.hp = Math.max(0, moving.hp - dealt);
		watcher.overwatch = false;
		reactions.push({ attacker: watcher.id, defender: moving.id, damage: dealt, cover, killed: moving.hp === 0 });
		if (moving.hp === 0) { state.units = state.units.filter((unit) => unit !== moving); break; }
	}
	return reactions;
}

export function tacticalAttack(state: TacticalState, attackerId: string, defenderId: string, damage: number): TacticalAttack {
	const attacker = getUnit(state, attackerId);
	const defender = getUnit(state, defenderId);
	if (attacker.owner !== state.turn || attacker.owner === defender.owner) throw new Error('invalid tactical attack');
	if (tacticalDistance(state, attacker, defender) > 3) throw new Error('tactical target is out of range');
	const cover = state.cells[defender.y * state.width + defender.x].cover ?? 0;
	const dealt = Math.max(0, damage - cover);
	defender.hp = Math.max(0, defender.hp - dealt);
	const killed = defender.hp === 0;
	if (killed) state.units = state.units.filter((unit) => unit !== defender);
	return { attacker: attackerId, defender: defenderId, damage: dealt, cover, killed };
}

export function endTacticalTurn(state: TacticalState): void {
	const owners = [...new Set(state.units.map((unit) => unit.owner))];
	if (owners.length === 0) return;
	const next = owners.indexOf(state.turn) + 1;
	if (next >= owners.length) state.round++;
	state.turn = owners[next % owners.length];
	for (const unit of state.units) if (unit.owner === state.turn) { unit.actions = 2; unit.overwatch = false; }
}

function getUnit(state: TacticalState, id: string): TacticalUnit { const unit = state.units.find((candidate) => candidate.id === id); if (!unit) throw new Error(`unknown tactical unit "${id}"`); return unit; }
function occupied(state: TacticalState, x: number, y: number): boolean { return state.units.some((unit) => unit.x === x && unit.y === y); }
function tacticalInside(state: TacticalState, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < state.width && y < state.height; }
function tacticalNeighbours(state: TacticalState, x: number, y: number): { x: number; y: number }[] { return state.shape === 'hex' ? hexNeighbors(x, y) : [{ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 }]; }
function tacticalDistance(state: TacticalState, a: { x: number; y: number }, b: { x: number; y: number }): number { return state.shape === 'hex' ? hexDistance(a, b) : Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
//the real walking distance to (targetX, targetY), never exceeding `budget` steps, or null
//if it cannot be reached within that budget - a move's true cost, not straight-line distance
function tacticalPathCost(state: TacticalState, unit: TacticalUnit, targetX: number, targetY: number, budget: number): number | null { const todo = [{ x: unit.x, y: unit.y, distance: 0 }]; const seen = new Set([`${unit.x},${unit.y}`]); while (todo.length) { const current = todo.shift()!; if (current.x === targetX && current.y === targetY) return current.distance; if (current.distance >= budget) continue; for (const next of tacticalNeighbours(state, current.x, current.y)) { const key = `${next.x},${next.y}`; if (!tacticalInside(state, next.x, next.y) || seen.has(key) || !state.cells[next.y * state.width + next.x].passable || occupied(state, next.x, next.y) && !(next.x === targetX && next.y === targetY)) continue; seen.add(key); todo.push({ x: next.x, y: next.y, distance: current.distance + 1 }); } } return null; }
