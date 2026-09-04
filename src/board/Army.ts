import type { TacticalState, TacticalUnit } from './Tactics.ts';
import { addTacticalUnit } from './Tactics.ts';

//a unit definition kept in the recall pool between maps/sessions - everything `addTacticalUnit`
//needs except a position, which is only chosen at recall time
export type UnitTemplate = Omit<TacticalUnit, 'x' | 'y'>;

export interface ArmyState {
	currency: number;
	pool: UnitTemplate[];
}

export function startingArmy(currency: number): ArmyState {
	return { currency, pool: [] };
}

//deducts cost and places a fresh unit, all-or-nothing like actors.Shop's buy/sell: touches
//neither currency nor the board unless every check already passed
export function recruit(army: ArmyState, board: TacticalState, unit: TacticalUnit, cost: number): boolean {
	if (army.currency < cost) return false;
	addTacticalUnit(board, unit);
	army.currency -= cost;
	return true;
}

//pulls a previously-fielded unit back onto the map instead of minting a fresh one - the
//template stays in the pool until recalled, then leaves it the way stock leaves a shop's shelf
export function recall(army: ArmyState, board: TacticalState, unitId: string, x: number, y: number): boolean {
	const index = army.pool.findIndex((template) => template.id === unitId);
	if (index === -1) return false;
	addTacticalUnit(board, { ...army.pool[index], x, y });
	army.pool.splice(index, 1);
	return true;
}

//moves a fielded unit into the recall pool instead of discarding it outright - the inverse of
//recall, for retreating a unit off the map between engagements rather than losing it for good
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
export function armyIncome(board: TacticalState, owner: string, rates: UpkeepRates): number {
	const controlled = board.units.filter((unit) => unit.owner === owner).length;
	return controlled * (rates.incomePerUnit - rates.upkeepPerUnit);
}

//applies one turn's income/upkeep tick to an army's currency and returns the new total
export function applyUpkeep(army: ArmyState, board: TacticalState, owner: string, rates: UpkeepRates): number {
	army.currency += armyIncome(board, owner, rates);
	return army.currency;
}
