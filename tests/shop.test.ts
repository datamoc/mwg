import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { Inventory } from '../src/actors/Inventory.ts';
import { buy, sell, type ShopOptions } from '../src/actors/Shop.ts';

function fixture() {
	const wallet = new StatBlock({ base: { gold: 100 } });
	const stock = new Inventory();
	stock.add({ id: 'potion', quantity: 5, stackable: true, weight: 1 });
	const bag = new Inventory();
	const options: ShopOptions = { currency: 'gold', prices: new Map([['potion', { buy: 20, sell: 5 }]]) };
	return { wallet, stock, bag, options };
}

test('buy moves stock into the bag and deducts the cost', () => {
	const { wallet, stock, bag, options } = fixture();

	assert.equal(buy(wallet, stock, bag, 'potion', 2, options), true);
	assert.equal(bag.find('potion')?.quantity, 2);
	assert.equal(stock.find('potion')?.quantity, 3);
	assert.equal(wallet.get('gold'), 60);
});

test('buy refuses and touches nothing when the price is unknown', () => {
	const { wallet, stock, bag, options } = fixture();
	assert.equal(buy(wallet, stock, bag, 'sword', 1, options), false);
	assert.equal(wallet.get('gold'), 100);
});

test('buy refuses and touches nothing when the shop is short on stock', () => {
	const { wallet, stock, bag, options } = fixture();
	assert.equal(buy(wallet, stock, bag, 'potion', 10, options), false);
	assert.equal(stock.find('potion')?.quantity, 5);
	assert.equal(wallet.get('gold'), 100);
});

test('buy refuses and touches nothing when the buyer cannot afford it', () => {
	const { wallet, stock, bag, options } = fixture();
	wallet.setBase('gold', 5);
	assert.equal(buy(wallet, stock, bag, 'potion', 1, options), false);
	assert.equal(stock.find('potion')?.quantity, 5);
	assert.equal(wallet.get('gold'), 5);
});

test('buy rolls the stock back if the bag has no room, without charging the buyer', () => {
	const { wallet, stock, options } = fixture();
	const fullBag = new Inventory({ capacity: 1 });
	fullBag.add({ id: 'rock', quantity: 1, stackable: true, weight: 1 }); // fills the only capacity

	assert.equal(buy(wallet, stock, fullBag, 'potion', 1, options), false);
	assert.equal(stock.find('potion')?.quantity, 5, 'stock restored exactly');
	assert.equal(wallet.get('gold'), 100, 'never charged');
	assert.equal(fullBag.find('potion'), undefined);
});

test('sell moves an item from the bag into stock and pays the seller', () => {
	const { wallet, stock, bag, options } = fixture();
	bag.add({ id: 'trinket', quantity: 3, stackable: true });
	const withTrinket: ShopOptions = {
		currency: 'gold',
		prices: new Map([...options.prices, ['trinket', { buy: 50, sell: 10 }]]),
	};

	assert.equal(sell(wallet, stock, bag, 'trinket', 2, withTrinket), true);
	assert.equal(bag.find('trinket')?.quantity, 1);
	assert.equal(stock.find('trinket')?.quantity, 2);
	assert.equal(wallet.get('gold'), 120);
});

test('sell refuses and touches nothing when the seller lacks the quantity', () => {
	const { wallet, stock, bag, options } = fixture();
	assert.equal(sell(wallet, stock, bag, 'potion', 1, options), false, 'the bag has none to begin with');
	assert.equal(wallet.get('gold'), 100);
});

test('sell refuses and touches nothing when the price is unknown', () => {
	const { wallet, stock, bag, options } = fixture();
	bag.add({ id: 'mystery', quantity: 1, stackable: true });
	assert.equal(sell(wallet, stock, bag, 'mystery', 1, options), false);
	assert.equal(bag.find('mystery')?.quantity, 1);
});
