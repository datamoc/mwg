import type { StatBlock } from './StatBlock.ts';

/**
 * One spendable cost: `amount` of the `stat` pool, the way a spell costs mana.
 *
 * Costs operate on the stat's *base* value - the stored pool - not its modified
 * total: a buff that raises maximum mana changes the ceiling, not what is left
 * to spend. Restoring the pool is just `stats.setBase`; only spending needed a
 * primitive of its own.
 */
export interface ResourceCost {
	stat: string;
	amount: number;
}

function all(cost: ResourceCost | readonly ResourceCost[]): readonly ResourceCost[] {
	const list = Array.isArray(cost) ? cost : [cost];
	for (const c of list) {
		if (!Number.isFinite(c.amount) || c.amount < 0) {
			throw new Error(`a resource cost must be a non-negative number, "${c.stat}" costs ${c.amount}`);
		}
	}
	return list;
}

//several costs on the same stat (two effects both drawing mana, say) must be checked
//against their combined total, not each independently against the same starting pool
function totals(cost: readonly ResourceCost[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const c of cost) out.set(c.stat, (out.get(c.stat) ?? 0) + c.amount);
	return out;
}

/** True when every cost in `cost` is currently affordable, without spending anything. */
export function canAfford(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[]): boolean {
	return [...totals(all(cost))].every(([stat, amount]) => stats.base(stat) >= amount);
}

/**
 * Spends every cost in `cost` at once, the way `craft` resolves a recipe.
 *
 * All or nothing: when any one cost is unaffordable nothing is deducted and
 * this returns false. A zero cost is always affordable and deducts nothing.
 */
export function spend(stats: StatBlock, cost: ResourceCost | readonly ResourceCost[]): boolean {
	const combined = totals(all(cost));
	if (![...combined].every(([stat, amount]) => stats.base(stat) >= amount)) return false;
	for (const [stat, amount] of combined) stats.setBase(stat, stats.base(stat) - amount);
	return true;
}
