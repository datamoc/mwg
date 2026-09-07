import type { TacticalState, TacticalUnit } from './Tactics.ts';
import { addTacticalUnit, canPlaceTacticalUnit } from './Tactics.ts';

//a unit definition kept in the recall pool between maps/sessions - everything `addTacticalUnit`
//needs except a position, which is only chosen at recall time
export type UnitTemplate = Omit<TacticalUnit, 'x' | 'y'>;

export interface ArmyState {
	currency: number;
	pool: UnitTemplate[];
}

/**
 * Recruit/income economy layered on top of `Tactics`'s board: a currency total plus a pool of
 * banked unit templates waiting to be recalled onto the map. See `recruit`/`bankUnit`/
 * `recall`/`armyIncome`/`applyUpkeep` for the rest of the economy this state drives.
 *
 * @example
 * ```ts
 * import { startingArmy } from '@datamoc/mw_games/board';
 *
 * console.log(startingArmy(100)); // { currency: 100, pool: [] }
 * ```
 */
export function startingArmy(currency: number): ArmyState {
	return { currency, pool: [] };
}

//deducts cost and places a fresh unit, all-or-nothing like actors.Shop's buy/sell: touches
//neither currency nor the board unless every check already passed - canPlaceTacticalUnit is
//checked up front rather than letting addTacticalUnit's own throw escape a boolean contract
/**
 * @example
 * ```ts
 * import { startingArmy, recruit, startingTactics } from '@datamoc/mw_games/board';
 *
 * const board = startingTactics(6, 6, 'square');
 * const army = startingArmy(100);
 *
 * recruit(army, board, { id: 'scout', owner: 'blue', x: 0, y: 0, hp: 6, maxHp: 6, actions: 2 }, 30);
 * console.log(army.currency); // 70 - 100 minus the 30 cost
 * ```
 */
export function recruit(army: ArmyState, board: TacticalState, unit: TacticalUnit, cost: number): boolean {
	if (army.currency < cost || !canPlaceTacticalUnit(board, unit.x, unit.y)) return false;
	addTacticalUnit(board, unit);
	army.currency -= cost;
	return true;
}

//pulls a previously-fielded unit back onto the map instead of minting a fresh one - the
//template stays in the pool until recalled, then leaves it the way stock leaves a shop's shelf
/**
 * @example
 * ```ts
 * import { startingArmy, recruit, bankUnit, recall, startingTactics } from '@datamoc/mw_games/board';
 *
 * const board = startingTactics(6, 6, 'square');
 * const army = startingArmy(100);
 * recruit(army, board, { id: 'scout', owner: 'blue', x: 0, y: 0, hp: 6, maxHp: 6, actions: 2 }, 30);
 * bankUnit(army, board, 'scout');
 *
 * recall(army, board, 'scout', 1, 1);
 * console.log(board.units.some((unit) => unit.id === 'scout')); // true - fielded again, at its new position
 * ```
 */
export function recall(army: ArmyState, board: TacticalState, unitId: string, x: number, y: number): boolean {
	const index = army.pool.findIndex((template) => template.id === unitId);
	if (index === -1 || !canPlaceTacticalUnit(board, x, y)) return false;
	addTacticalUnit(board, { ...army.pool[index], x, y });
	army.pool.splice(index, 1);
	return true;
}

//moves a fielded unit into the recall pool instead of discarding it outright - the inverse of
//recall, for retreating a unit off the map between engagements rather than losing it for good
/**
 * @example
 * ```ts
 * import { startingArmy, recruit, bankUnit, startingTactics } from '@datamoc/mw_games/board';
 *
 * const board = startingTactics(6, 6, 'square');
 * const army = startingArmy(100);
 * recruit(army, board, { id: 'scout', owner: 'blue', x: 0, y: 0, hp: 6, maxHp: 6, actions: 2 }, 30);
 *
 * bankUnit(army, board, 'scout');
 * console.log(board.units.length, army.pool.length); // 0 1 - pulled off the map, into the pool
 * ```
 */
export function bankUnit(army: ArmyState, board: TacticalState, unitId: string): boolean {
	const index = board.units.findIndex((unit) => unit.id === unitId);
	if (index === -1) return false;
	const { x: _x, y: _y, ...template } = board.units[index];
	army.pool.push(template);
	board.units.splice(index, 1);
	return true;
}

export interface UpkeepRates { incomePerUnit: number; upkeepPerUnit: number; }

//net currency delta for one turn's income minus upkeep, purely a function of how many units
//an owner controls on the board - no formula beyond that belongs here, per this project's
//policy against borrowing any specific game's numbers
/**
 * @example
 * ```ts
 * import { startingTactics, addTacticalUnit, armyIncome } from '@datamoc/mw_games/board';
 *
 * const board = startingTactics(6, 6, 'square');
 * addTacticalUnit(board, { id: 'scout', owner: 'blue', x: 0, y: 0, hp: 6, maxHp: 6, actions: 2 });
 *
 * console.log(armyIncome(board, 'blue', { incomePerUnit: 5, upkeepPerUnit: 2 })); // 3 - one unit, net of upkeep
 * ```
 */
export function armyIncome(board: TacticalState, owner: string, rates: UpkeepRates): number {
	const controlled = board.units.filter((unit) => unit.owner === owner).length;
	return controlled * (rates.incomePerUnit - rates.upkeepPerUnit);
}

//applies one turn's income/upkeep tick to an army's currency and returns the new total
/**
 * @example
 * ```ts
 * import { startingArmy, startingTactics, addTacticalUnit, applyUpkeep } from '@datamoc/mw_games/board';
 *
 * const board = startingTactics(6, 6, 'square');
 * addTacticalUnit(board, { id: 'scout', owner: 'blue', x: 0, y: 0, hp: 6, maxHp: 6, actions: 2 });
 * const army = startingArmy(100);
 *
 * applyUpkeep(army, board, 'blue', { incomePerUnit: 5, upkeepPerUnit: 2 });
 * console.log(army.currency); // 103 - this turn's net income applied
 * ```
 */
export function applyUpkeep(army: ArmyState, board: TacticalState, owner: string, rates: UpkeepRates): number {
	army.currency += armyIncome(board, owner, rates);
	return army.currency;
}
