import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StatBlock } from '../src/actors/StatBlock.ts';
import { applyStatusEffect } from '../src/actors/StatusEffect.ts';
import { TurnClock } from '../src/world/TurnClock.ts';

test('a status effect applies its modifiers immediately', () => {
	const stats = new StatBlock({ base: { attack: 5 } });
	const clock = new TurnClock();

	applyStatusEffect(stats, clock, {
		modifiers: [{ stat: 'attack', op: 'add', value: 3 }],
		duration: 2,
	});

	assert.equal(stats.get('attack'), 8);
});

test('the modifiers are removed automatically once the duration elapses', () => {
	const stats = new StatBlock({ base: { attack: 5 } });
	const clock = new TurnClock();

	applyStatusEffect(stats, clock, {
		modifiers: [{ stat: 'attack', op: 'add', value: 3 }],
		duration: 2,
	});

	clock.advance();
	assert.equal(stats.get('attack'), 8, 'still active with one turn left');

	clock.advance();
	assert.equal(stats.get('attack'), 5, 'expired and removed');
});

test('tick runs once per turn while the effect is active, such as a poison tick', () => {
	const stats = new StatBlock({ base: { hp: 20 } });
	const clock = new TurnClock();
	let totalDamage = 0;

	applyStatusEffect(stats, clock, {
		modifiers: [],
		duration: 3,
		tick: () => (totalDamage += 2),
	});

	clock.advance();
	clock.advance();
	clock.advance();

	assert.equal(totalDamage, 6);
});

test('cancel() removes the modifiers immediately, before the duration would have expired', () => {
	const stats = new StatBlock({ base: { attack: 5 } });
	const clock = new TurnClock();

	const handle = applyStatusEffect(stats, clock, {
		modifiers: [{ stat: 'attack', op: 'add', value: 3 }],
		duration: 10,
	});

	handle.cancel();
	assert.equal(stats.get('attack'), 5);

	//the clock entry is gone too - advancing past where it would have expired ticks nothing
	clock.advance(10);
	assert.equal(stats.get('attack'), 5);
});

test('two independent status effects on the same stat stack, and expire independently', () => {
	const stats = new StatBlock({ base: { attack: 5 } });
	const clock = new TurnClock();

	applyStatusEffect(stats, clock, { modifiers: [{ stat: 'attack', op: 'add', value: 2 }], duration: 1 });
	applyStatusEffect(stats, clock, { modifiers: [{ stat: 'attack', op: 'add', value: 10 }], duration: 5 });

	assert.equal(stats.get('attack'), 17);

	clock.advance();
	assert.equal(stats.get('attack'), 15, 'only the shorter buff expired');
});
