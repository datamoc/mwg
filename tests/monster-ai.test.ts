import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Level } from '../src/roguelike/Level.ts';
import { Pathfinder } from '../src/roguelike/Pathfinder.ts';
import { decideMonsterAI } from '../src/roguelike/MonsterAI.ts';
import { reset } from '../src/core/Random.ts';

const KINDS = [
	{ passable: false, transparent: false },
	{ passable: true, transparent: true },
];

function openRoom(width = 11, height = 5): Level {
	const level = new Level(width, height, KINDS);
	level.fillRect({ left: 1, top: 1, right: width - 2, bottom: height - 2 }, 1);
	return level;
}

test('wanders when the target is out of its own sight', () => {
	reset();
	const level = openRoom(21, 5);
	const pathfinder = new Pathfinder(level);

	//far enough that a small sight radius will not reach it, even in an open room
	const decision = decideMonsterAI(level, pathfinder, { x: 2, y: 2 }, 1, { x: 18, y: 2 }, {
		sightRadius: 3,
		topology: 4,
	});

	assert.equal(decision.state, 'wander');
});

test('hunts when the target is visible and healthy', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const self = { x: 2, y: 2 };
	const target = { x: 8, y: 2 };
	const decision = decideMonsterAI(level, pathfinder, self, 1, target, { sightRadius: 10, topology: 4 });

	assert.equal(decision.state, 'hunt');
	assert.deepEqual(decision.step, pathfinder.step(self, target, { topology: 4 }));
});

test('flees away from a visible target once HP drops to the threshold', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const decision = decideMonsterAI(level, pathfinder, { x: 5, y: 2 }, 0.2, { x: 8, y: 2 }, {
		sightRadius: 10,
		fleeBelow: 0.25,
		topology: 4,
	});

	assert.equal(decision.state, 'flee');
	assert.ok(decision.step, 'should have somewhere to flee to');
	assert.ok(decision.step!.x < 5, 'should move away from the target, not towards it');
});

test('a monster with no flee threshold never flees, however low its HP', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const decision = decideMonsterAI(level, pathfinder, { x: 2, y: 2 }, 0.01, { x: 8, y: 2 }, {
		sightRadius: 10,
		topology: 4,
	});

	assert.equal(decision.state, 'hunt');
});

test('creatures already standing on top of each other still resolve without throwing', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);
	const same = { x: 4, y: 2 };

	assert.doesNotThrow(() => decideMonsterAI(level, pathfinder, same, 1, same, { sightRadius: 10 }));
});

test('wandering with every neighbour blocked returns no step', () => {
	reset();
	const level = new Level(3, 3, KINDS);
	level.set(1, 1, 1); //a single passable cell, walled in on every side

	const pathfinder = new Pathfinder(level);
	const decision = decideMonsterAI(level, pathfinder, { x: 1, y: 1 }, 1, { x: 50, y: 50 }, {
		sightRadius: 3,
		topology: 8,
	});

	assert.equal(decision.state, 'wander');
	assert.equal(decision.step, null);
});

test('fleeing with every neighbour blocked returns no step', () => {
	reset();
	const level = new Level(3, 3, KINDS);
	level.set(1, 1, 1);

	const pathfinder = new Pathfinder(level);
	const decision = decideMonsterAI(level, pathfinder, { x: 1, y: 1 }, 0.1, { x: 1, y: 1 }, {
		sightRadius: 3,
		fleeBelow: 0.5,
		topology: 8,
	});

	assert.equal(decision.state, 'flee');
	assert.equal(decision.step, null);
});

test('a peaceful monster wanders even with the target in plain sight', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const decision = decideMonsterAI(level, pathfinder, { x: 2, y: 2 }, 1, { x: 8, y: 2 }, {
		sightRadius: 10,
		topology: 4,
		disposition: 'peaceful',
	});

	assert.equal(decision.state, 'wander');
});

test('a neutral monster wanders too, same as peaceful, until provoked', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const decision = decideMonsterAI(level, pathfinder, { x: 2, y: 2 }, 1, { x: 8, y: 2 }, {
		sightRadius: 10,
		topology: 4,
		disposition: 'neutral',
	});

	assert.equal(decision.state, 'wander');
});

test('provoked overrides a peaceful/neutral disposition back to hunting', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);
	const self = { x: 2, y: 2 };
	const target = { x: 8, y: 2 };

	const decision = decideMonsterAI(level, pathfinder, self, 1, target, {
		sightRadius: 10,
		topology: 4,
		disposition: 'peaceful',
		provoked: true,
	});

	assert.equal(decision.state, 'hunt');
	assert.deepEqual(decision.step, pathfinder.step(self, target, { topology: 4 }));
});

test('omitting disposition defaults to hostile, unchanged from before this option existed', () => {
	reset();
	const level = openRoom();
	const pathfinder = new Pathfinder(level);

	const decision = decideMonsterAI(level, pathfinder, { x: 2, y: 2 }, 1, { x: 8, y: 2 }, {
		sightRadius: 10,
		topology: 4,
	});

	assert.equal(decision.state, 'hunt');
});
