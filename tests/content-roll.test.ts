import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Random from '../src/core/Random.ts';
import { rollRoster } from '../src/roguelike/ContentRoll.ts';

test('with no rare entries and no shuffle, the roster is exactly the regular values in order', () => {
	Random.push(1);
	try {
		const { roster, trace } = rollRoster([{ value: 'rat' }, { value: 'slime' }], [], false);
		assert.deepEqual(roster, ['rat', 'slime']);
		assert.deepEqual(trace, []);
	} finally {
		Random.pop();
	}
});

test('a rare entry at chance 1 always adds, and is traced as added', () => {
	Random.push(1);
	try {
		const { roster, trace } = rollRoster([{ value: 'rat' }], [{ value: 'boss', chance: 1 }], false);
		assert.deepEqual(roster, ['rat', 'boss']);
		assert.deepEqual(trace, [{ step: 'rare', index: 0, outcome: 'added' }]);
	} finally {
		Random.pop();
	}
});

test('a rare entry at chance 0 never adds, and is traced as skipped, not deferred', () => {
	Random.push(1);
	try {
		const { roster, trace } = rollRoster([{ value: 'rat' }], [{ value: 'boss', chance: 0 }], false);
		assert.deepEqual(roster, ['rat']);
		assert.deepEqual(trace, [{ step: 'rare', index: 0, outcome: 'skipped' }]);
	} finally {
		Random.pop();
	}
});

test('a disabled rare entry is deferred without consuming a roll', () => {
	Random.push(1);
	try {
		const before = Random.float();
		Random.pop();
		Random.push(1);
		const { trace } = rollRoster([{ value: 'rat' }], [{ value: 'boss', chance: 1, enabled: false }], false);
		assert.deepEqual(trace, [{ step: 'rare', index: 0, outcome: 'deferred' }]);
		//the very next roll is identical to a fresh seed's first roll: nothing was consumed
		const after = Random.float();
		assert.equal(after, before);
	} finally {
		Random.pop();
	}
});

test('an alternative at chance 1 always swaps, and is traced as swapped', () => {
	Random.push(1);
	try {
		const { roster, trace } = rollRoster(
			[{ value: 'rat', alternative: { value: 'albino rat', chance: 1 } }],
			[],
			false,
		);
		assert.deepEqual(roster, ['albino rat']);
		assert.deepEqual(trace, [{ step: 'alternative', index: 0, outcome: 'swapped' }]);
	} finally {
		Random.pop();
	}
});

test('an alternative at chance 0 keeps the regular value, traced as kept', () => {
	Random.push(1);
	try {
		const { roster, trace } = rollRoster(
			[{ value: 'rat', alternative: { value: 'albino rat', chance: 0 } }],
			[],
			false,
		);
		assert.deepEqual(roster, ['rat']);
		assert.deepEqual(trace, [{ step: 'alternative', index: 0, outcome: 'kept' }]);
	} finally {
		Random.pop();
	}
});

test('rare additions have no alternative swap of their own - only the regular roster is checked', () => {
	Random.push(1);
	try {
		const { trace } = rollRoster([{ value: 'rat' }], [{ value: 'boss', chance: 1 }], false);
		assert.deepEqual(trace, [{ step: 'rare', index: 0, outcome: 'added' }]);
	} finally {
		Random.pop();
	}
});

test('shuffle runs last and is traced, unless explicitly disabled', () => {
	Random.push(1);
	try {
		const { trace } = rollRoster([{ value: 'a' }, { value: 'b' }]);
		assert.deepEqual(trace, [{ step: 'shuffle', index: -1, outcome: 'shuffled' }]);
	} finally {
		Random.pop();
	}
});

test('the same seed produces the same roster and trace, roll for roll', () => {
	const regular = [{ value: 'rat', alternative: { value: 'albino rat', chance: 0.5 } }, { value: 'slime' }];
	const rare = [{ value: 'boss', chance: 0.5 }];
	const run = () => {
		Random.push(99);
		try {
			return rollRoster(regular, rare);
		} finally {
			Random.pop();
		}
	};
	assert.deepEqual(run(), run());
});
