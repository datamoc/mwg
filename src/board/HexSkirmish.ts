import { hexNeighbors, hexDistance } from '../core/Hex.ts';
import * as Random from '../core/Random.ts';

/**
 * A Wesnoth-style hex army-game rules layer: terrain that costs different movement points and
 * grants a defence bonus per terrain kind, adjacent attacks that always let a surviving
 * defender strike back, capturable villages that grant income and heal whoever stands on one,
 * and per-side turn income built on both. Distinct from `board.Tactics` (an X-COM-style
 * action-point/cover/overwatch layer, ranged attacks, no retaliation) - this is the other
 * shape a hex army game needs, adjacency-only combat with a hit chance and no zone of control.
 *
 * `mwg` supplies the mechanism only: `SkirmishTerrain`'s move cost and defence numbers, unit
 * attack/hit-chance/hp values, and income rates are entirely the game's own data, the same
 * policy `board.Army`'s `armyIncome` already follows.
 *
 * @example
 * ```ts
 * import { startingSkirmish, setSkirmishTerrain, addSkirmishUnit, skirmishMoves, moveSkirmishUnit, skirmishAttack, endSkirmishTurn, skirmishIncome } from '@datamoc/mw_games/board';
 *
 * const terrain = { plain: { moveCost: 1, defense: 0 }, forest: { moveCost: 2, defense: 0.3 } };
 * const state = startingSkirmish(6, 6, terrain);
 * setSkirmishTerrain(state, 2, 2, 'forest');
 * setSkirmishTerrain(state, 0, 0, 'plain', true); // a village at the corner
 *
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 0.7 });
 * addSkirmishUnit(state, { id: 'raider', owner: 'red', x: 1, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 3, hitChance: 0.6 });
 *
 * const moves = skirmishMoves(state, 'axeman'); // reachable cells, weighted by terrain cost
 * const exchange = skirmishAttack(state, 'axeman', 'raider'); // both strike if raider survives
 *
 * endSkirmishTurn(state); // hands the turn to red, refills moves, heals units on owned villages
 * const income = skirmishIncome(state, 'blue', 2, 1); // base 2, +1 per village blue owns
 * ```
 */
export interface SkirmishTerrain {
	/** movement points spent entering this terrain kind; `Infinity` makes it impassable */
	moveCost: number;

	/** 0-1 defence bonus for whoever is standing here while defending - what it multiplies is `skirmishAttack`'s own formula, not this terrain's own business */
	defense: number;
}

export interface SkirmishCell {
	terrain: string;

	/** a capturable village - `moveSkirmishUnit` sets `owner` to whoever last stood here */
	village?: boolean;
	owner?: string;
}

export interface SkirmishUnit {
	id: string;
	owner: string;
	x: number;
	y: number;
	hp: number;
	maxHp: number;

	/** movement points available this turn; refilled to `moves` by `endSkirmishTurn` */
	moves: number;
	remainingMoves?: number;

	attack: number;

	/** 0-1 base chance to land a hit, before the defender's terrain defence reduces it */
	hitChance: number;
}

export interface SkirmishState {
	width: number;
	height: number;
	terrainTable: Record<string, SkirmishTerrain>;
	cells: SkirmishCell[];
	units: SkirmishUnit[];
	turn: string;
	round: number;
}

export interface SkirmishMove {
	unit: string;
	x: number;
	y: number;
	cost: number;
}
export interface SkirmishStrike {
	attacker: string;
	defender: string;
	hit: boolean;
	damage: number;
	killed: boolean;
}
export interface SkirmishExchange {
	strikes: SkirmishStrike[];
}

/**
 * @example
 * ```ts
 * import { startingSkirmish } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * console.log(state.width, state.round); // 6 1
 * ```
 */
export function startingSkirmish(
	width: number,
	height: number,
	terrainTable: Record<string, SkirmishTerrain>,
	defaultTerrain?: string,
): SkirmishState {
	if (width < 1 || height < 1) throw new Error('a skirmish map needs positive dimensions');
	const terrain = defaultTerrain ?? Object.keys(terrainTable)[0];
	if (!terrain || !terrainTable[terrain]) throw new Error('a skirmish map needs at least one terrain kind');
	return {
		width,
		height,
		terrainTable,
		cells: Array.from({ length: width * height }, () => ({ terrain })),
		units: [],
		turn: '',
		round: 1,
	};
}

/**
 * @example
 * ```ts
 * import { startingSkirmish, setSkirmishTerrain } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 }, forest: { moveCost: 2, defense: 0.3 } });
 * setSkirmishTerrain(state, 2, 2, 'forest', true);
 * console.log(state.cells[2 * 6 + 2]); // { terrain: 'forest', village: true }
 * ```
 */
export function setSkirmishTerrain(state: SkirmishState, x: number, y: number, terrain: string, village = false): void {
	if (!inside(state, x, y)) throw new Error('cell is outside the skirmish map');
	if (!state.terrainTable[terrain]) throw new Error(`unknown skirmish terrain "${terrain}"`);
	state.cells[y * state.width + x] = village ? { terrain, village: true } : { terrain };
}

/**
 * whether a unit could be placed at (x, y) right now - on the map, passable, and unoccupied
 *
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit, canPlaceSkirmishUnit } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 0.7 });
 *
 * console.log(canPlaceSkirmishUnit(state, 1, 0)); // true
 * console.log(canPlaceSkirmishUnit(state, 0, 0)); // false - axeman is already there
 * ```
 */
export function canPlaceSkirmishUnit(state: SkirmishState, x: number, y: number): boolean {
	return inside(state, x, y) && moveCostOf(state, x, y) < Infinity && !occupied(state, x, y);
}

/**
 * Places a unit at full remaining movement; the first unit added decides whose turn it is.
 *
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 0.7 });
 * console.log(state.turn); // 'blue'
 * ```
 */
export function addSkirmishUnit(state: SkirmishState, unit: SkirmishUnit): void {
	if (!canPlaceSkirmishUnit(state, unit.x, unit.y)) throw new Error('skirmish unit cannot be placed there');
	state.units.push({ ...unit, remainingMoves: unit.moves });
	if (!state.turn) state.turn = unit.owner;
}

/**
 * Every cell a unit can reach with its remaining movement points this turn, weighted by each
 * terrain kind's own `moveCost` - no zone of control, unlike `board.Tactics`.
 *
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit, skirmishMoves } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 2, attack: 4, hitChance: 0.7 });
 *
 * console.log(skirmishMoves(state, 'axeman').length); // 6 - every hex within 2 plain steps
 * ```
 */
export function skirmishMoves(state: SkirmishState, unitId: string): SkirmishMove[] {
	const unit = getUnit(state, unitId);
	const budget = unit.remainingMoves ?? unit.moves;
	if (unit.owner !== state.turn || budget <= 0) return [];

	const out: SkirmishMove[] = [];
	for (let y = 0; y < state.height; y++)
		for (let x = 0; x < state.width; x++) {
			if ((x === unit.x && y === unit.y) || moveCostOf(state, x, y) === Infinity || occupied(state, x, y))
				continue;
			const cost = pathCost(state, unit, x, y, budget);
			if (cost !== null) out.push({ unit: unitId, x, y, cost });
		}
	return out;
}

/**
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit, skirmishMoves, moveSkirmishUnit } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 2, attack: 4, hitChance: 0.7 });
 *
 * moveSkirmishUnit(state, skirmishMoves(state, 'axeman')[0]);
 * console.log(state.units[0].remainingMoves); // 1 - one plain hex spent
 * ```
 */
export function moveSkirmishUnit(state: SkirmishState, move: SkirmishMove): void {
	const legal = skirmishMoves(state, move.unit).find((candidate) => candidate.x === move.x && candidate.y === move.y);
	if (!legal) throw new Error('illegal skirmish move');
	const unit = getUnit(state, move.unit);
	unit.x = move.x;
	unit.y = move.y;
	unit.remainingMoves = (unit.remainingMoves ?? unit.moves) - legal.cost;

	const cell = state.cells[move.y * state.width + move.x];
	if (cell.village) cell.owner = unit.owner;
}

/**
 * An attacker's strike against an adjacent enemy, followed by the defender's own retaliation
 * if it survives - both use the same formula: `hitChance` reduced by the defender's terrain
 * defence, `Random.chance` deciding whether it lands, `attack` as the flat damage on a hit.
 *
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit, skirmishAttack } from '@datamoc/mw_games/board';
 * import { Random } from '@datamoc/mw_games/core';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 1 });
 * addSkirmishUnit(state, { id: 'raider', owner: 'red', x: 1, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 3, hitChance: 1 });
 *
 * const exchange = Random.withSeed(1, () => skirmishAttack(state, 'axeman', 'raider'));
 * console.log(exchange.strikes.map((strike: { attacker: string }) => strike.attacker)); // ['axeman', 'raider'] - raider survived to retaliate
 * ```
 */
export function skirmishAttack(state: SkirmishState, attackerId: string, defenderId: string): SkirmishExchange {
	const attacker = getUnit(state, attackerId);
	const defender = getUnit(state, defenderId);
	if (attacker.owner !== state.turn || attacker.owner === defender.owner) throw new Error('invalid skirmish attack');
	if (hexDistance(attacker, defender) !== 1) throw new Error('skirmish combat is adjacency-only');

	const strikes: SkirmishStrike[] = [strike(state, attacker, defender)];
	if (defender.hp > 0) strikes.push(strike(state, defender, attacker));

	state.units = state.units.filter((unit) => unit.hp > 0);
	return { strikes };
}

function strike(state: SkirmishState, attacker: SkirmishUnit, defender: SkirmishUnit): SkirmishStrike {
	const defense = terrainOf(state, defender.x, defender.y).defense;
	const hit = Random.chance(Math.max(0, Math.min(1, attacker.hitChance * (1 - defense))));
	const damage = hit ? Math.min(attacker.attack, defender.hp) : 0;
	defender.hp -= damage;
	return { attacker: attacker.id, defender: defender.id, hit, damage, killed: defender.hp <= 0 };
}

/**
 * Net income for one side, from a flat base plus every village it currently owns - purely a
 * function of the map's own village ownership, no formula beyond that belongs here, the same
 * policy `board.Army`'s `armyIncome` already follows.
 *
 * @example
 * ```ts
 * import { startingSkirmish, setSkirmishTerrain, skirmishIncome } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(4, 1, { plain: { moveCost: 1, defense: 0 } });
 * setSkirmishTerrain(state, 0, 0, 'plain', true);
 * state.cells[0].owner = 'blue';
 *
 * console.log(skirmishIncome(state, 'blue', 2, 1)); // 3 - base 2, plus 1 for the one village
 * ```
 */
export function skirmishIncome(state: SkirmishState, owner: string, baseIncome: number, perVillage: number): number {
	const villages = state.cells.filter((cell) => cell.village && cell.owner === owner).length;
	return baseIncome + villages * perVillage;
}

/**
 * Hands the turn to the next owner with units on the board, refilling their movement and
 * healing every one of their units standing on a village they own.
 *
 * @example
 * ```ts
 * import { startingSkirmish, addSkirmishUnit, endSkirmishTurn } from '@datamoc/mw_games/board';
 *
 * const state = startingSkirmish(6, 6, { plain: { moveCost: 1, defense: 0 } });
 * addSkirmishUnit(state, { id: 'axeman', owner: 'blue', x: 0, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 4, hitChance: 0.7 });
 * addSkirmishUnit(state, { id: 'raider', owner: 'red', x: 3, y: 0, hp: 10, maxHp: 10, moves: 4, attack: 3, hitChance: 0.6 });
 *
 * endSkirmishTurn(state, 2);
 * console.log(state.turn, state.round); // 'red' 1
 * ```
 */
export function endSkirmishTurn(state: SkirmishState, healPerVillage = 0): void {
	const owners = [...new Set(state.units.map((unit) => unit.owner))];
	if (owners.length === 0) return;
	const next = owners.indexOf(state.turn) + 1;
	if (next >= owners.length) state.round++;
	state.turn = owners[next % owners.length];

	for (const unit of state.units) {
		if (unit.owner !== state.turn) continue;
		unit.remainingMoves = unit.moves;
		const cell = state.cells[unit.y * state.width + unit.x];
		if (cell.village && cell.owner === unit.owner && healPerVillage > 0) {
			unit.hp = Math.min(unit.maxHp, unit.hp + healPerVillage);
		}
	}
}

function getUnit(state: SkirmishState, id: string): SkirmishUnit {
	const unit = state.units.find((candidate) => candidate.id === id);
	if (!unit) throw new Error(`unknown skirmish unit "${id}"`);
	return unit;
}
function inside(state: SkirmishState, x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < state.width && y < state.height;
}
function occupied(state: SkirmishState, x: number, y: number): boolean {
	return state.units.some((unit) => unit.x === x && unit.y === y);
}
function terrainOf(state: SkirmishState, x: number, y: number): SkirmishTerrain {
	return state.terrainTable[state.cells[y * state.width + x].terrain];
}
function moveCostOf(state: SkirmishState, x: number, y: number): number {
	return terrainOf(state, x, y).moveCost;
}

//the real weighted walking cost to (targetX, targetY), never exceeding `budget`, or null if it
//cannot be reached within that budget - Dijkstra over a small grid rather than BFS, since
//terrain move cost varies per cell unlike board.Tactics' uniform one-step cost
function pathCost(
	state: SkirmishState,
	unit: SkirmishUnit,
	targetX: number,
	targetY: number,
	budget: number,
): number | null {
	const best = new Map<string, number>([[`${unit.x},${unit.y}`, 0]]);
	const todo = [{ x: unit.x, y: unit.y, cost: 0 }];
	while (todo.length > 0) {
		todo.sort((a, b) => a.cost - b.cost);
		const current = todo.shift()!;
		const key = `${current.x},${current.y}`;
		if (current.cost > (best.get(key) ?? Infinity)) continue;
		if (current.x === targetX && current.y === targetY) return current.cost;

		for (const next of hexNeighbors(current.x, current.y)) {
			if (!inside(state, next.x, next.y)) continue;
			const stepCost = moveCostOf(state, next.x, next.y);
			if (stepCost === Infinity) continue;
			if (occupied(state, next.x, next.y) && !(next.x === targetX && next.y === targetY)) continue;

			const total = current.cost + stepCost;
			if (total > budget) continue;
			const nextKey = `${next.x},${next.y}`;
			if (total < (best.get(nextKey) ?? Infinity)) {
				best.set(nextKey, total);
				todo.push({ x: next.x, y: next.y, cost: total });
			}
		}
	}
	return null;
}
