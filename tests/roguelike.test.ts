import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scheduler } from '../src/roguelike/Scheduler.ts';
import { generateDungeon } from '../src/roguelike/generate.ts';
import { Pathfinder } from '../src/roguelike/Pathfinder.ts';
import { Level, rectCenter } from '../src/roguelike/Level.ts';
import { withSeed, reset } from '../src/core/Random.ts';

// ------------------------------------------------------------------ scheduler

interface Creature {
	name: string;
	speed?: number;
}

/** runs `turns` turns, charging each actor one unit of time, and reports the order */
function order(scheduler: Scheduler<Creature>, turns: number): string[] {
	const taken: string[] = [];
	for (let i = 0; i < turns; i++) {
		const actor = scheduler.peek();
		if (!actor) break;
		taken.push(actor.name);
		scheduler.spend(1);
	}
	return taken;
}

test('equal speeds take turns in the order they were added', () => {
	const scheduler = new Scheduler<Creature>();
	scheduler.add({ name: 'a' });
	scheduler.add({ name: 'b' });
	scheduler.add({ name: 'c' });

	assert.deepEqual(order(scheduler, 6), ['a', 'b', 'c', 'a', 'b', 'c']);
});

test('a faster actor acts proportionally more often', () => {
	const scheduler = new Scheduler<Creature>();
	scheduler.add({ name: 'quick', speed: 2 });
	scheduler.add({ name: 'slow', speed: 1 });

	const taken = order(scheduler, 30);
	const quick = taken.filter((n) => n === 'quick').length;
	const slow = taken.filter((n) => n === 'slow').length;

	//twice as many turns, give or take where the sequence was cut
	assert.ok(quick >= slow * 2 - 1 && quick <= slow * 2 + 1, `quick ${quick}, slow ${slow}`);
});

test('a slowed actor loses turns rather than stalling the queue', () => {
	const scheduler = new Scheduler<Creature>();
	scheduler.add({ name: 'normal', speed: 1 });
	scheduler.add({ name: 'slowed', speed: 0.5 });

	const taken = order(scheduler, 30);
	assert.ok(taken.filter((n) => n === 'normal').length > taken.filter((n) => n === 'slowed').length);
	//and the slow one is not starved entirely
	assert.ok(taken.includes('slowed'));
});

test('time never runs backwards', () => {
	const scheduler = new Scheduler<Creature>();
	scheduler.add({ name: 'a' });
	scheduler.add({ name: 'b', speed: 3 });

	let previous = -1;
	for (let i = 0; i < 20; i++) {
		scheduler.peek();
		assert.ok(scheduler.now >= previous, `now went from ${previous} to ${scheduler.now}`);
		previous = scheduler.now;
		scheduler.spend(1);
	}
});

test('a removed actor stops taking turns', () => {
	const scheduler = new Scheduler<Creature>();
	const doomed = { name: 'doomed' };
	scheduler.add({ name: 'survivor' });
	scheduler.add(doomed);

	scheduler.peek();
	scheduler.spend(1);
	scheduler.remove(doomed);

	assert.ok(!order(scheduler, 6).includes('doomed'));
});

test('an empty scheduler is safe to poll', () => {
	const scheduler = new Scheduler<Creature>();
	assert.equal(scheduler.peek(), null);
	assert.doesNotThrow(() => scheduler.spend(1));
});

// ----------------------------------------------------------------- generation

test('the same seed produces the same dungeon', () => {
	const build = () =>
		withSeed(4242, () => generateDungeon({ width: 60, height: 40 })).terrain.join('');

	assert.equal(build(), build());
});

test('different seeds produce different dungeons', () => {
	const a = withSeed(1, () => generateDungeon({ width: 60, height: 40 })).terrain.join('');
	const b = withSeed(2, () => generateDungeon({ width: 60, height: 40 })).terrain.join('');
	assert.notEqual(a, b);
});

test('the border is always solid', () => {
	reset();
	const level = generateDungeon({ width: 50, height: 30 });

	for (let x = 0; x < level.width; x++) {
		assert.ok(!level.passable(x, 0), `top edge open at ${x}`);
		assert.ok(!level.passable(x, level.height - 1), `bottom edge open at ${x}`);
	}
	for (let y = 0; y < level.height; y++) {
		assert.ok(!level.passable(0, y), `left edge open at ${y}`);
		assert.ok(!level.passable(level.width - 1, y), `right edge open at ${y}`);
	}
});

test('every room is reachable from every other', () => {
	//the property that actually matters: a level with an unreachable room is unplayable,
	//and it is exactly the kind of thing that shows up one seed in fifty
	for (let seed = 1; seed <= 25; seed++) {
		const level = withSeed(seed, () => generateDungeon({ width: 70, height: 45 }));
		assert.ok(level.rooms.length >= 2, `seed ${seed} produced ${level.rooms.length} rooms`);

		const pathfinder = new Pathfinder(level);
		const first = rectCenter(level.rooms[0]);
		const distances = pathfinder.distanceMap(first);

		for (const room of level.rooms.slice(1)) {
			const centre = rectCenter(room);
			assert.notEqual(
				distances[level.index(centre.x, centre.y)],
				-1,
				`seed ${seed}: a room centre was unreachable`
			);
		}
	}
});

test('rooms do not touch each other', () => {
	for (let seed = 1; seed <= 10; seed++) {
		const level = withSeed(seed, () => generateDungeon({ width: 70, height: 45 }));

		for (let i = 0; i < level.rooms.length; i++) {
			for (let j = i + 1; j < level.rooms.length; j++) {
				const a = level.rooms[i];
				const b = level.rooms[j];
				const apart =
					a.right + 1 < b.left || b.right + 1 < a.left || a.bottom + 1 < b.top || b.bottom + 1 < a.top;
				assert.ok(apart, `seed ${seed}: rooms ${i} and ${j} are adjacent`);
			}
		}
	}
});

// --------------------------------------------------------------- pathfinding

/** a corridor with a wall across it, open at one end */
function testLevel(): Level {
	const level = new Level(9, 5, [
		{ passable: false, transparent: false },
		{ passable: true, transparent: true },
	]);
	level.fillRect({ left: 1, top: 1, right: 7, bottom: 3 }, 1);
	//a wall down the middle, leaving a gap on the bottom row
	level.set(4, 1, 0);
	level.set(4, 2, 0);
	return level;
}

test('a path goes around an obstacle', () => {
	const level = testLevel();
	const path = new Pathfinder(level).find({ x: 1, y: 1 }, { x: 7, y: 1 }, { topology: 4 });

	assert.ok(path.length > 0, 'no path found');
	assert.deepEqual(path[path.length - 1], { x: 7, y: 1 });
	//it has to dip to the open row, so it cannot be a straight line
	assert.ok(path.some((step) => step.y === 3));
});

test('a blocked route yields no path rather than a wrong one', () => {
	const level = testLevel();
	level.set(4, 3, 0); //close the gap

	const path = new Pathfinder(level).find({ x: 1, y: 1 }, { x: 7, y: 1 }, { topology: 4 });
	assert.deepEqual(path, []);
});

test('creatures block a route, and the distance map agrees with the path', () => {
	const level = testLevel();
	const pathfinder = new Pathfinder(level);
	const blocked = new Set([level.index(4, 3)]);

	assert.deepEqual(pathfinder.find({ x: 1, y: 1 }, { x: 7, y: 1 }, { topology: 4, blocked }), []);

	const distances = pathfinder.distanceMap({ x: 7, y: 1 }, { topology: 4, blocked });
	assert.equal(distances[level.index(1, 1)], -1);
});

test('descending a distance map walks the whole way to the target', () => {
	const level = testLevel();
	const pathfinder = new Pathfinder(level);
	const target = { x: 7, y: 1 };
	const distances = pathfinder.distanceMap(target, { topology: 4 });

	let at = { x: 1, y: 1 };
	for (let step = 0; step < 100; step++) {
		if (at.x === target.x && at.y === target.y) break;
		const next = pathfinder.descend(at, distances, { topology: 4 });
		assert.ok(next, `stuck at ${at.x},${at.y}`);
		at = next;
	}

	assert.deepEqual(at, target);
});
