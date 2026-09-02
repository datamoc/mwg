import type { StatBlock } from './StatBlock.ts';
import type { Inventory } from './Inventory.ts';

/**
 * A buy/sell transaction between two `Inventory`s, paid for from a `StatBlock` stat acting as
 * currency - the same role `craft()` fills for a recipe: check everything first, touch
 * nothing until every check passes, and if any later step fails (the buyer's bag has no
 * room), roll back whatever the earlier steps already did rather than losing stock or coin
 * for nothing.
 */
export interface Price {
	/** cost to buy one unit from the shop */
	buy: number;
	/** amount refunded per unit sold to the shop */
	sell: number;
}

export interface ShopOptions {
	/** the `StatBlock` stat name holding the spendable currency */
	currency: string;
	prices: ReadonlyMap<string, Price>;
}

/** @returns false, touching nothing, if the price is unknown, stock is short, or coin is short */
export function buy(
	wallet: StatBlock,
	stock: Inventory,
	bag: Inventory,
	id: string,
	quantity: number,
	options: ShopOptions
): boolean {
	const price = options.prices.get(id);
	if (!price) return false;

	const forSale = stock.find(id);
	if (!forSale || forSale.quantity < quantity) return false;

	const cost = price.buy * quantity;
	if (wallet.base(options.currency) < cost) return false;

	stock.remove(id, quantity);
	if (!bag.add({ ...forSale, quantity })) {
		stock.add({ ...forSale, quantity }); //the buyer's bag had no room - put the stock back
		return false;
	}

	wallet.setBase(options.currency, wallet.base(options.currency) - cost);
	return true;
}

/** @returns false, touching nothing, if the price is unknown or the seller lacks the quantity */
export function sell(
	wallet: StatBlock,
	stock: Inventory,
	bag: Inventory,
	id: string,
	quantity: number,
	options: ShopOptions
): boolean {
	const price = options.prices.get(id);
	if (!price) return false;

	const item = bag.find(id);
	if (!item || item.quantity < quantity) return false;

	bag.remove(id, quantity);
	stock.add({ ...item, quantity });
	wallet.setBase(options.currency, wallet.base(options.currency) + price.sell * quantity);
	return true;
}
