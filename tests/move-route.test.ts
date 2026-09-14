import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GridMover } from '../src/rpg/GridMover.ts';
import { MoveRouteRunner, type MoveRoute } from '../src/rpg/MoveRoute.ts';
import { AnimatedSprite } from '../src/two-d/render/AnimatedSprite.ts';

function mover(x = 0, y = 0, speed = 100) {
	return new GridMover(new AnimatedSprite(), x, y, { tileWidth: 16, tileHeight: 16, speed });
}

test('a plain route runs its directional steps in order', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ dir: 'right' }, { dir: 'right' }, { dir: 'down' }] };
	const runner = new MoveRouteRunner(m, route);

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [1, 0]);

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [2, 0]);

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [2, 1]);
	assert.equal(runner.done, true);
});

test('repeat loops the route back to its first step instead of stopping', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ dir: 'right' }], repeat: true };
	const runner = new MoveRouteRunner(m, route);

	for (let i = 0; i < 3; i++) {
		runner.update(1);
		m.update(1);
	}
	assert.equal(m.x, 3);
	assert.equal(runner.done, false, 'a repeating route is never done');
});

test('wait pauses the route without moving the mover', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ wait: 2 }, { dir: 'right' }] };
	const runner = new MoveRouteRunner(m, route);

	runner.update(1);
	assert.equal(m.x, 0, 'still waiting');
	runner.update(1);
	assert.equal(m.x, 0, 'wait just finished, the move step has not run yet');

	runner.update(1);
	m.update(1);
	assert.equal(m.x, 1);
});

test('turn faces a direction without moving, then the route advances', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ turn: 'left' }, { dir: 'right' }] };
	const runner = new MoveRouteRunner(m, route);

	runner.update(1);
	assert.equal(m.facing, 'left');
	assert.equal(m.x, 0);

	runner.update(1);
	m.update(1);
	assert.equal(m.facing, 'right');
	assert.equal(m.x, 1);
});

test('jump repositions the mover instantly as one route step', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ jump: { dx: 2, dy: 1 } }, { dir: 'up' }] };
	const runner = new MoveRouteRunner(m, route);

	runner.update(1);
	assert.deepEqual([m.x, m.y], [2, 1]);

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [2, 0]);
});

test('toward steps close the larger axis first, and stop resolving once the target is reached', () => {
	const m = mover();
	const route: MoveRoute = {
		steps: [
			{ dir: 'toward', x: 3, y: 1 },
			{ dir: 'toward', x: 3, y: 1 },
			{ dir: 'toward', x: 3, y: 1 },
			{ dir: 'toward', x: 3, y: 1 },
		],
	};
	const runner = new MoveRouteRunner(m, route);

	for (let i = 0; i < 4; i++) {
		runner.update(1);
		m.update(1);
	}
	assert.deepEqual([m.x, m.y], [3, 1]);
});

test('away steps move off from the target along the larger axis', () => {
	const m = mover(3, 3);
	const route: MoveRoute = { steps: [{ dir: 'away', x: 0, y: 0 }] };
	const runner = new MoveRouteRunner(m, route);

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [4, 3]);
});

test('random picks one of the four directions using the injected source', () => {
	const m = mover();
	const route: MoveRoute = { steps: [{ dir: 'random' }] };
	//the pool is ['up','down','left','right']; 0.9 selects the last, 'right'
	const runner = new MoveRouteRunner(m, route, { random: () => 0.9 });

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [1, 0]);
});

test('a blocked step waits and retries by default, rather than skipping', () => {
	const m = mover();
	let allow = false;
	const route: MoveRoute = { steps: [{ dir: 'right' }, { dir: 'down' }] };
	const runner = new MoveRouteRunner(m, route, { canMove: () => allow });

	runner.update(1);
	assert.equal(m.x, 0, 'blocked, so nothing moved');

	allow = true;
	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [1, 0], 'retried the same step once it opened up');
});

test('skippable moves past a blocked step instead of waiting on it', () => {
	const m = mover();
	const route: MoveRoute = {
		steps: [{ dir: 'right' }, { dir: 'down' }],
		skippable: true,
	};
	//refuse every rightward step, allow downward
	const runner = new MoveRouteRunner(m, route, { canMove: (dx) => dx === 0 });

	runner.update(1); // the blocked right step is skipped, not retried
	m.update(1);
	assert.deepEqual([m.x, m.y], [0, 0], 'nothing moved on the skipped step itself');

	runner.update(1);
	m.update(1);
	assert.deepEqual([m.x, m.y], [0, 1], 'the down step ran next');
	assert.equal(runner.done, true);
});
