import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Tweener, Easing } from '../src/core/Tween.ts';

test('a tween runs apply from 0 to 1 over its duration and resolves', async () => {
	const tweener = new Tweener();
	const values: number[] = [];
	const done = tweener.tween(1, (t) => values.push(t));

	tweener.update(0.4);
	tweener.update(0.4);
	assert.equal(values.length, 2);
	assert.ok(values[1] < 1);

	tweener.update(0.5);
	await done;
	assert.equal(values.at(-1), 1);
});

test('isBusy reports whether any tween is still running', () => {
	const tweener = new Tweener();
	assert.equal(tweener.isBusy, false);
	void tweener.tween(1, () => {});
	assert.equal(tweener.isBusy, true);
	tweener.update(2);
	assert.equal(tweener.isBusy, false);
});

test('a non-positive duration applies the end state immediately without waiting a frame', async () => {
	const tweener = new Tweener();
	let applied = -1;
	await tweener.tween(0, (t) => { applied = t; });
	assert.equal(applied, 1);
	assert.equal(tweener.isBusy, false);
});

test('several tweens run independently, each resolving at its own duration', async () => {
	const tweener = new Tweener();
	const order: string[] = [];
	const a = tweener.tween(1, () => {}).then(() => order.push('a'));
	const b = tweener.tween(2, () => {}).then(() => order.push('b'));

	tweener.update(1);
	await a;
	assert.deepEqual(order, ['a']);

	tweener.update(1);
	await b;
	assert.deepEqual(order, ['a', 'b']);
});

test('a tween resolving mid-update can start another without it being double-advanced', async () => {
	const tweener = new Tweener();
	const seen: number[] = [];
	const chained = tweener.tween(1, () => {}).then(() => {
		tweener.tween(1, (t) => seen.push(t));
	});
	tweener.update(1);
	await chained;
	assert.deepEqual(seen, []);
	tweener.update(0.5);
	assert.deepEqual(seen, [0.5]);
});

test('clear drops every running tween without applying its end state or resolving it', () => {
	const tweener = new Tweener();
	let applied = -1;
	let resolved = false;
	void tweener.tween(1, (t) => { applied = t; }).then(() => { resolved = true; });
	tweener.update(0.3);
	assert.equal(applied, 0.3);

	tweener.clear();
	assert.equal(tweener.isBusy, false);
	tweener.update(1);
	assert.equal(applied, 0.3);
	assert.equal(resolved, false);
});

test('easing curves map 0 to 0 and 1 to 1, and stay within range', () => {
	for (const ease of Object.values(Easing)) {
		assert.equal(ease(0), 0);
		assert.ok(Math.abs(ease(1) - 1) < 1e-9);
		for (let t = 0; t <= 1; t += 0.1) {
			const value = ease(t);
			assert.ok(value >= -0.001 && value <= 1.001, `${value} out of range for t=${t}`);
		}
	}
});

test('a non-linear ease actually reshapes progress, not just relabels it', () => {
	const tweener = new Tweener();
	const values: number[] = [];
	void tweener.tween(1, (t) => values.push(t), Easing.easeInQuad);
	tweener.update(0.5);
	assert.equal(values[0], 0.25);
});
