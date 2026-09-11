import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { MultiTurnBeam } from '../src/roguelike/MultiTurnBeam.ts';

function openLevel(): Level {
	const level = new Level(10, 4, [
		{ passable: false, transparent: false },
		{ passable: true, transparent: true },
	]);
	level.fillRect({ left: 0, top: 0, right: 9, bottom: 3 }, 1);
	return level;
}

test('multi-turn beam traverses one cell per turn and damages live targets', () => {
	const level = openLevel();
	const target = { id: 'moving', x: 3, y: 1, hp: 10 };
	const hits: string[] = [];
	const beam = new MultiTurnBeam({
		level,
		from: { x: 1, y: 1 },
		target: { x: 5, y: 1 },
		damage: 3,
		targetsAt: (cell) => (cell.x === target.x && cell.y === target.y ? [target] : []),
		applyDamage: (unit, amount) => {
			unit.hp -= amount;
			hits.push(unit.id);
		},
	});

	assert.equal(beam.start(), true);
	assert.deepEqual(beam.advance().cell, { x: 2, y: 1 });
	target.x = 4; // the target moves before its cell is reached
	assert.deepEqual(beam.advance().cell, { x: 3, y: 1 });
	assert.deepEqual(beam.advance().cell, { x: 4, y: 1 });
	assert.equal(target.hp, 7);
	assert.deepEqual(hits, ['moving']);
	assert.equal(beam.advance().status, 'done');
});

test('multi-turn beam stops at terrain and can be restored', () => {
	const level = openLevel();
	level.set(4, 1, 0);
	const beam = new MultiTurnBeam({ level, from: { x: 1, y: 1 }, target: { x: 7, y: 1 }, damage: 1 });
	beam.start();
	assert.equal(beam.advance().status, 'active');
	const restored = MultiTurnBeam.fromJSON({ level, damage: 1 }, beam.toJSON());
	assert.equal(restored.advance().cell?.x, 3);
	assert.equal(restored.advance().status, 'blocked');
});

test('multi-turn beam cancellation is terminal and serialisable', () => {
	const beam = new MultiTurnBeam({ level: openLevel(), from: { x: 1, y: 1 }, target: { x: 4, y: 1 }, damage: 1 });
	beam.start();
	beam.cancel();
	assert.equal(beam.advance().status, 'cancelled');
	assert.equal(
		MultiTurnBeam.fromJSON({ level: openLevel(), damage: 1 }, beam.toJSON()).advance().status,
		'cancelled',
	);
});
