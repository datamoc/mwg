import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture } from 'pixi.js';

import { installFakeTextMetrics } from './helpers/fakeTextMetrics.ts';
import { setReducedMotion } from '../src/core/Motion.ts';
import {
	TransitionRunner,
	dissolve,
	grow,
	iris,
	openAnimationFrame,
	pop,
	popScale,
	resolveEasing,
	shrink,
	slide,
	tileDelays,
	tileProgress,
	tileShrink,
	type SceneTransition,
} from '../src/two-d/render/SceneTransition.ts';
import { Window } from '../src/two-d/ui/Window.ts';

installFakeTextMetrics();

const size = { width: 800, height: 600 };
const near = (actual: number, expected: number, message?: string) =>
	assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} is not ${expected}`);

test('tileDelays orders tiles from 0 to 1 by diagonal, row, spiral or a fixed shuffle', () => {
	const diagonal = tileDelays(3, 2, 'diagonal');
	assert.equal(diagonal[0], 0);
	assert.equal(diagonal[5], 1);
	near(diagonal[1], diagonal[3], 'tiles on one diagonal start together');

	const rows = tileDelays(3, 2, 'rows');
	assert.deepEqual(rows, [0, 0.2, 0.4, 0.6, 0.8, 1]);

	const spiral = tileDelays(5, 5, 'spiral');
	assert.equal(spiral[0], 0, 'the outside goes first');
	assert.equal(spiral[12], 1, 'the centre last');

	assert.deepEqual(tileDelays(6, 4, 'random', 7), tileDelays(6, 4, 'random', 7));
	assert.notDeepEqual(tileDelays(6, 4, 'random', 7), tileDelays(6, 4, 'random', 8));
	assert.deepEqual(tileDelays(1, 1), [0]);
});

test('tileProgress staggers the tiles so the last finishes with the transition', () => {
	assert.equal(tileProgress(0, 0, 0.5), 0);
	assert.equal(tileProgress(0, 0.5, 0.5), 1, 'the first tile is done when the stagger is');
	assert.equal(tileProgress(1, 0.5, 0.5), 0, 'the last has not started');
	assert.equal(tileProgress(1, 1, 0.5), 1);
	assert.equal(tileProgress(0.5, 1, 0), 1, 'no stagger: all together');
	near(tileProgress(0, 0.25, 0.5), 0.5);
});

test('popScale grows past 1 and settles on it', () => {
	assert.equal(popScale(0), 0);
	near(popScale(0.7), 1.08);
	assert.equal(popScale(1), 1);
	assert.ok(popScale(0.85) > 1 && popScale(0.85) < 1.08);
	near(popScale(0.7, 1.2), 1.2);
});

test('openAnimationFrame runs a window from nothing to whole, and closing never overshoots', () => {
	for (const kind of ['pop', 'grow', 'slide', 'fade'] as const) {
		const start = openAnimationFrame(kind, 0);
		const end = openAnimationFrame(kind, 1);
		assert.equal(end.scale, 1, kind);
		assert.equal(end.alpha, 1, kind);
		assert.equal(end.offset, 0, kind);
		assert.ok(start.alpha < 0.01, `${kind} starts invisible`);
	}
	assert.equal(openAnimationFrame('pop', 0).scale, 0);
	assert.ok(openAnimationFrame('pop', 0.7).scale > 1);
	assert.ok(openAnimationFrame('pop', 0.7, true).scale <= 1);
	assert.ok(openAnimationFrame('slide', 0.5).offset > 0);
});

test('resolveEasing takes a name, a function or nothing', () => {
	assert.equal(resolveEasing('linear')(0.3), 0.3);
	assert.equal(resolveEasing((t) => t * 2)(0.3), 0.6);
	assert.equal(resolveEasing(undefined)(0.5), 0.5, 'easeInOutQuad passes through the middle');
});

function run(transition: SceneTransition, snapshot: Texture | null = Texture.WHITE) {
	const incoming = new Container();
	const runner = new TransitionRunner({ transition, duration: 1, easing: 'linear' }, size, snapshot, incoming);
	return { incoming, runner };
}

test('tileShrink cuts the snapshot into tiles that all end at nothing', () => {
	const { runner } = run(tileShrink({ columns: 4, rows: 3, stagger: 0.5 }));
	const layer = runner.over.children[0] as Container;
	assert.equal(layer.children.length, 12);
	const scales = () => layer.children.map((tile) => tile.scale.x);
	assert.ok(
		scales().every((scale) => scale > 0),
		'whole at the start',
	);

	runner.update(0.5);
	const mid = scales();
	assert.ok(mid[0] <= 0 && mid[11] > 0, 'the first tile is gone, the last still there');
	assert.ok((layer.children[0] as Sprite).visible === false);

	runner.update(0.5);
	assert.equal(runner.done, true);
	assert.equal(runner.over.destroyed, true);
});

test('tileShrink with no snapshot makes no tiles and still finishes', () => {
	const { runner } = run(tileShrink(), null);
	assert.equal((runner.over.children[0] as Container).children.length, 0);
	assert.equal(runner.update(2), true);
});

test('pop grows the new scene from a point with an overshoot and leaves it as it found it', () => {
	const incoming = new Container();
	const runner = new TransitionRunner(
		{ transition: pop({ from: { x: 100, y: 100 } }), duration: 1, easing: 'linear' },
		size,
		Texture.WHITE,
		incoming,
	);
	assert.equal(incoming.scale.x, 0);
	runner.update(0.7);
	near(incoming.scale.x, 1.08);
	near(incoming.x, 100 * (1 - 1.08), 'scaled about the point, not the corner');
	runner.update(0.3);
	assert.equal(incoming.scale.x, 1);
	assert.equal(incoming.x, 0);
	assert.equal(incoming.alpha, 1);
});

test('grow reaches full size without overshoot', () => {
	const incoming = new Container();
	const runner = new TransitionRunner({ transition: grow(), duration: 1, easing: 'linear' }, size, null, incoming);
	runner.update(0.5);
	near(incoming.scale.x, 0.5);
	near(incoming.x, 400 * 0.5, 'about the centre by default');
	runner.update(0.5);
	assert.equal(incoming.scale.x, 1);
});

test('slide moves both pictures and puts the new one back at the origin', () => {
	const incoming = new Container();
	const runner = new TransitionRunner(
		{ transition: slide({ direction: 'left' }), duration: 1, easing: 'linear' },
		size,
		Texture.WHITE,
		incoming,
	);
	near(incoming.x, 800, 'the new scene waits off to the right');
	runner.update(0.5);
	near(incoming.x, 400);
	near(runner.over.children[0].x, -400);
	runner.update(0.5);
	assert.equal(incoming.x, 0);
});

test('iris masks the new scene and removes the mask when done', () => {
	const incoming = new Container();
	const runner = new TransitionRunner({ transition: iris(), duration: 1, easing: 'linear' }, size, null, incoming);
	assert.ok(incoming.mask, 'masked while it runs');
	runner.update(0.5);
	runner.update(0.5);
	assert.ok(!incoming.mask);
});

test('dissolve and shrink fade or shrink the old picture to nothing', () => {
	const dissolving = run(dissolve());
	dissolving.runner.update(0.5);
	near((dissolving.runner.over.children[0] as Container).alpha, 0.5);

	const shrinking = run(shrink({ to: { x: 10, y: 10 } }));
	shrinking.runner.update(0.5);
	near((shrinking.runner.over.children[0] as Container).scale.x, 0.5);
});

test('a runner reports its end once, runs onDone once and can be finished early', () => {
	let done = 0;
	const incoming = new Container();
	const runner = new TransitionRunner(
		{
			transition: dissolve(),
			duration: 1,
			onDone: () => {
				done++;
			},
			pause: true,
		},
		size,
		null,
		incoming,
	);
	assert.equal(runner.pause, true);
	assert.equal(runner.update(0.4), false);
	near(runner.progress, 0.4);
	runner.finish();
	runner.finish();
	assert.equal(runner.update(1), true);
	assert.equal(done, 1);
	assert.equal(runner.progress, 1);
});

test('a window opens by animation and closes by it, and reduced motion skips both', () => {
	const window = new Window({ width: 200, height: 100, title: 'Result' });
	window.position.set(100, 80);
	window.open({ animation: 'pop', duration: 0.2 });
	assert.equal(window.scale.x, 0);
	window.update(0.1);
	assert.ok(window.scale.x > 0.5);
	window.update(0.1);
	assert.equal(window.scale.x, 1);
	assert.equal(window.x, 100);
	assert.equal(window.y, 80);
	assert.equal(window.alpha, 1);

	let closed = 0;
	window.onClose.add(() => {
		closed++;
	});
	window.close({ animation: 'grow', duration: 0.2 });
	assert.equal(window.closed, false, 'still there while it animates out');
	window.update(0.1);
	assert.ok(window.scale.x < 1);
	window.update(0.15);
	assert.equal(window.closed, true);
	assert.equal(closed, 1);

	setReducedMotion(true);
	try {
		const quick = new Window({ width: 200, height: 100 });
		quick.open({ animation: 'pop' });
		assert.equal(quick.scale.x, 1);
		quick.close({ animation: 'pop' });
		assert.equal(quick.closed, true);
	} finally {
		setReducedMotion(null);
	}
});

test('a slide window ends where it was placed', () => {
	const window = new Window({ width: 200, height: 100 });
	window.position.set(30, 40);
	window.open({ animation: 'slide', duration: 0.2 });
	assert.ok(window.y > 40, 'starts below its place');
	window.update(0.2);
	assert.equal(window.y, 40);
	assert.equal(window.x, 30);
});

test('transitionDisposition ignores a second transition by default, queues or interrupts on request', async () => {
	const { transitionDisposition, dissolve } = await import('../src/two-d/render/SceneTransition.ts');
	assert.equal(transitionDisposition({ transition: dissolve() }, false), 'apply');
	assert.equal(transitionDisposition(undefined, false), 'apply');
	assert.equal(transitionDisposition({ transition: dissolve() }, true), 'ignore');
	assert.equal(transitionDisposition({ transition: dissolve(), queue: true }, true), 'queue');
	assert.equal(transitionDisposition({ transition: dissolve(), interrupt: true }, true), 'interrupt');
	assert.equal(
		transitionDisposition({ transition: dissolve(), queue: true, interrupt: true }, true),
		'interrupt',
		'interrupt wins',
	);
	assert.equal(
		transitionDisposition(undefined, true),
		'interrupt',
		'a plain request finishes the running transition',
	);
});
