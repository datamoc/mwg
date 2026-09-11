import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalScoreView, scoreWith, sideScoreView, type ScoreSubject } from '../src/ai/score.ts';

/**
 * The score views are arithmetic over what a mind can see, so they are checked here as arithmetic:
 * `sees` is handed in, which is the whole reason a unit's view and a side's view can share one
 * implementation. What the numbers are *worth* is the game's business and never enters this file.
 */

type Unit = string;

const hero: ScoreSubject<Unit> = { id: 'hero', side: 'blue', x: 2, y: 2 };
const allyNear: ScoreSubject<Unit> = { id: 'allyNear', side: 'blue', x: 3, y: 2 };
const allyFar: ScoreSubject<Unit> = { id: 'allyFar', side: 'blue', x: 8, y: 8 };
const enemyNear: ScoreSubject<Unit> = { id: 'enemyNear', side: 'red', x: 4, y: 2 };
const enemyFar: ScoreSubject<Unit> = { id: 'enemyFar', side: 'red', x: 8, y: 9 };

const world: ScoreSubject<Unit>[] = [hero, allyNear, allyFar, enemyNear, enemyFar];

const worth: Record<Unit, number> = { hero: 10, allyNear: 4, allyFar: 7, enemyNear: -2, enemyFar: -40 };
const scoreOf = (id: Unit) => worth[id] ?? 0;

/** the classic board reach: everything within `radius` steps of the subject, Manhattan distance */
const reachOf = (radius: number) => (x: number, y: number) => Math.abs(x - 2) + Math.abs(y - 2) <= radius;

test('a subject reads its own score, and the scores only of what it can see', () => {
	const view = personalScoreView(hero, world, scoreOf, reachOf(2));

	assert.deepEqual(view, {
		own: 10,
		allies: 4,
		enemies: -2,
		seen: 3,
	});
});

test('what is out of reach is out of the sums, however close to the edge it stands', () => {
	// the ally at (3, 2) is one step away and counted; the enemy at (4, 2) is two, and counted too:
	// the boundary is inclusive, which is the caller's rule and has to be visible in the reading
	const atTwo = personalScoreView(hero, world, scoreOf, reachOf(2));
	const atOne = personalScoreView(hero, world, scoreOf, reachOf(1));

	assert.equal(atOne.allies, 4, 'the neighbour one step away is still in sight');
	assert.equal(atOne.enemies, 0, 'the enemy two steps away is not, at this reach');
	assert.notEqual(atTwo.enemies, atOne.enemies, 'a one-step difference in reach changes the view');
});

test('a subject counts itself, and is asked about nobody else s square but its own', () => {
	const asked: string[] = [];
	const seeNobody = (x: number, y: number) => {
		asked.push(`${x},${y}`);
		return false;
	};

	const view = personalScoreView(hero, world, scoreOf, seeNobody);

	assert.equal(view.seen, 1, 'it knows its own score whether or not it can see the ground it stands on');
	assert.equal(view.own, 10);
	assert.equal(view.allies, 0);
	assert.equal(view.enemies, 0);
	assert.ok(!asked.includes('2,2'), 'it never asks the fog about its own cell');
	assert.equal(asked.length, world.length - 1, 'and asks about every other subject exactly once');
});

test('a side reads its own units as allies, and has no score of its own', () => {
	const view = sideScoreView('blue', world, scoreOf, reachOf(2));

	assert.deepEqual(view, {
		own: 0,
		allies: 14,
		enemies: -2,
		seen: 3,
	});
});

test('the same code reads for a character and for the player, and the visibility set is the difference', () => {
	// a side sees the union of its units: the ally at (8, 8) brings the enemy beside it into view,
	// where the hero alone cannot. Nothing else about the two calls differs, which is the point.
	const heroAlone = personalScoreView(hero, world, scoreOf, reachOf(2));
	const sideUnion = sideScoreView(
		'blue',
		world,
		scoreOf,
		(x, y) => reachOf(2)(x, y) || Math.abs(x - 8) + Math.abs(y - 8) <= 1,
	);

	assert.equal(heroAlone.seen, 3, 'the hero sees three subjects');
	assert.equal(sideUnion.seen, 5, 'the side sees every one of them, through its far unit as well');
	assert.equal(heroAlone.enemies, -2, 'and the hero s view stops at the enemy next door');
	assert.equal(sideUnion.enemies, -42, 'where the side counts the one it can now see too');
});

test('a personality reads the same view differently, without the view changing', () => {
	const view = personalScoreView(hero, world, scoreOf, reachOf(2));
	const before = { ...view };

	const selfish = scoreWith(view, { own: 1, allies: 0, enemies: 0 });
	const loyal = scoreWith(view, { own: 0, allies: 1, enemies: 0 });
	const avenger = scoreWith(view, { own: 1, allies: 1, enemies: -1 });

	assert.equal(selfish, 10, 'out for itself: the allies contribute nothing to its number');
	assert.equal(loyal, 4, 'holding for the line: its own score contributes nothing');
	assert.equal(avenger, 16, 'and an enemy is worth the opposite of its score, so a negative one helps');
	assert.deepEqual(view, before, 'a personality is a reading, never a mutation');
});

test('an enemy weight pointing the other way is a different mind, not a rounding difference', () => {
	const view = personalScoreView(hero, world, scoreOf, reachOf(2));

	assert.equal(scoreWith(view, { own: 1, allies: 0, enemies: 1 }), 8);
	assert.equal(scoreWith(view, { own: 1, allies: 0, enemies: -1 }), 12);
});

test('reading a view changes nothing it was given', () => {
	const snapshot = world.map((unit) => ({ ...unit }));

	personalScoreView(hero, world, scoreOf, reachOf(2));
	sideScoreView('blue', world, scoreOf, reachOf(2));

	assert.deepEqual(world, snapshot, 'the world is read, never rewritten');
	assert.deepEqual(
		personalScoreView(hero, world, scoreOf, reachOf(2)),
		personalScoreView(hero, world, scoreOf, reachOf(2)),
	);
});
