import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BattleHooks } from '../src/battle/Hooks.ts';

test('emit runs only handlers registered for that event', () => {
	const hooks = new BattleHooks<string>();
	const seen: string[] = [];

	hooks.on('switchIn', (creature) => seen.push(`in:${creature}`));
	hooks.on('faint', (creature) => seen.push(`faint:${creature}`));

	hooks.emit('switchIn', 'rat');
	assert.deepEqual(seen, ['in:rat']);
});

test('handlers for the same event run in registration order', () => {
	const hooks = new BattleHooks<string>();
	const seen: string[] = [];

	hooks.on('turnStart', () => seen.push('first'));
	hooks.on('turnStart', () => seen.push('second'));
	hooks.emit('turnStart', 'rat');

	assert.deepEqual(seen, ['first', 'second']);
});

test('a shared context lets a handler answer a question, such as "can this creature act"', () => {
	const hooks = new BattleHooks<string>();
	hooks.on('turnStart', (_creature, context) => {
		(context as { skip: boolean }).skip = true; // asleep
	});

	const context = { skip: false };
	hooks.emit('turnStart', 'rat', context);
	assert.equal(context.skip, true);
});

test('offSource removes every hook registered with that source, and nothing else', () => {
	const hooks = new BattleHooks<string>();
	const seen: string[] = [];
	const ability = { name: 'intimidate' };

	hooks.on('switchIn', () => seen.push('ability'), ability);
	hooks.on('switchIn', () => seen.push('item'));

	hooks.offSource(ability);
	hooks.emit('switchIn', 'rat');

	assert.deepEqual(seen, ['item']);
});

test('emitting an event with no registered handlers is a no-op, not an error', () => {
	const hooks = new BattleHooks<string>();
	assert.doesNotThrow(() => hooks.emit('faint', 'rat'));
});
