import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ReactionTable } from '../src/core/Reactions.ts';

interface Hp {
	hp: number;
	maxHp: number;
}

function table(): { calls: string[]; reactions: ReactionTable<Hp> } {
	const calls: string[] = [];
	const reactions = new ReactionTable<Hp>([
		{ id: 'critical', when: (s) => s.hp / s.maxHp <= 0.25, action: () => calls.push('critical') },
		{ id: 'shattered', when: (s) => s.hp <= 0, action: () => calls.push('shattered'), once: true },
	]);
	return { calls, reactions };
}

test('a rule fires the moment its condition turns true', () => {
	const { calls, reactions } = table();
	assert.deepEqual(reactions.check({ hp: 100, maxHp: 100 }), []);
	assert.deepEqual(reactions.check({ hp: 20, maxHp: 100 }), ['critical']);
	assert.deepEqual(calls, ['critical']);
});

test('a still-true condition never re-fires', () => {
	const { reactions } = table();
	reactions.check({ hp: 20, maxHp: 100 });
	assert.deepEqual(reactions.check({ hp: 18, maxHp: 100 }), []);
	assert.equal(reactions.isActive('critical'), true);
});

test('leaving and re-entering the condition fires it again, by default', () => {
	const { reactions } = table();
	reactions.check({ hp: 20, maxHp: 100 });
	reactions.check({ hp: 90, maxHp: 100 });
	assert.equal(reactions.isActive('critical'), false);
	assert.deepEqual(reactions.check({ hp: 20, maxHp: 100 }), ['critical']);
});

test('a once rule fires a single time ever, even after leaving and returning', () => {
	const { calls, reactions } = table();
	assert.deepEqual(reactions.check({ hp: 0, maxHp: 100 }), ['critical', 'shattered']);
	assert.deepEqual(reactions.check({ hp: 100, maxHp: 100 }), []);
	assert.deepEqual(reactions.check({ hp: 0, maxHp: 100 }), ['critical']);
	assert.deepEqual(calls, ['critical', 'shattered', 'critical']);
});

test('the same table works for a non-actor object, such as an item', () => {
	const calls: string[] = [];
	const durability = new ReactionTable<{ integrity: number }>([
		{ id: 'broken', when: (s) => s.integrity <= 0, action: () => calls.push('broken'), once: true },
	]);
	durability.check({ integrity: 5 });
	assert.deepEqual(durability.check({ integrity: 0 }), ['broken']);
	assert.deepEqual(calls, ['broken']);
});

test('remove drops a rule and forgets it was active', () => {
	const { reactions } = table();
	reactions.check({ hp: 20, maxHp: 100 });
	reactions.remove('critical');
	assert.equal(reactions.isActive('critical'), false);
	assert.deepEqual(reactions.check({ hp: 0, maxHp: 100 }), ['shattered']);
});

test('reset clears active and spent state, as if check had never run', () => {
	const { reactions } = table();
	reactions.check({ hp: 0, maxHp: 100 });
	reactions.reset();
	assert.deepEqual(reactions.check({ hp: 0, maxHp: 100 }), ['critical', 'shattered']);
});

test('round-trips active and spent state through JSON', () => {
	const { reactions } = table();
	reactions.check({ hp: 0, maxHp: 100 });
	const saved = reactions.toJSON();

	const restored = ReactionTable.fromJSON<Hp>(
		[
			{ id: 'critical', when: (s) => s.hp / s.maxHp <= 0.25, action: () => {} },
			{ id: 'shattered', when: (s) => s.hp <= 0, action: () => {}, once: true },
		],
		saved,
	);
	assert.equal(restored.isActive('critical'), true);
	// the once rule was already spent before the save, so it stays retired after restore
	assert.deepEqual(restored.check({ hp: 0, maxHp: 100 }), []);
});
