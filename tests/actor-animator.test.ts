import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'pixi.js';

import { AnimatedSprite } from '../src/render/AnimatedSprite.ts';
import { ActorAnimator } from '../src/render/ActorAnimator.ts';

function name(state: string, variant: string): string {
	return variant ? `${state}-${variant}` : state;
}

/** a sprite with idle/move/action registered for one or more directions, action non-looping */
function sprite(directions: string[] = ['down']): AnimatedSprite {
	const s = new AnimatedSprite();
	for (const dir of directions) {
		s.add(`idle-${dir}`, [Texture.WHITE]);
		s.add(`move-${dir}`, [Texture.WHITE, Texture.EMPTY]);
		s.add(`action-${dir}`, [Texture.WHITE, Texture.EMPTY], { loop: false, fps: 10 });
	}
	return s;
}

test('starts idle, in the given variant', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	assert.equal(animator.state, 'idle');
	assert.equal(animator.variantName, 'down');
	assert.equal(s.playing, 'idle-down');
});

test('setMoving toggles between idle and move freely', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.setMoving(true);
	assert.equal(animator.state, 'move');
	assert.equal(s.playing, 'move-down');

	animator.setMoving(false);
	assert.equal(animator.state, 'idle');
	assert.equal(s.playing, 'idle-down');
});

test('setMoving can change the variant at the same time', () => {
	const s = sprite(['down', 'left']);
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.setMoving(true, 'left');
	assert.equal(animator.variantName, 'left');
	assert.equal(s.playing, 'move-left');
});

test('playAction interrupts idle immediately', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction();
	assert.equal(animator.state, 'action');
	assert.equal(s.playing, 'action-down');
});

test('playAction interrupts a move in progress', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.setMoving(true);
	animator.playAction();
	assert.equal(animator.state, 'action');
	assert.equal(s.playing, 'action-down');
});

test('setMoving is ignored while an action is playing, but remembered', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction();
	animator.setMoving(true);
	assert.equal(animator.state, 'action'); //still the action, not overridden
	assert.equal(s.playing, 'action-down');

	//finishing the action - one update past its total duration - picks up the move that was
	//requested while it was playing, not whatever was true when the action started
	s.update(1);
	assert.equal(animator.state, 'move');
	assert.equal(s.playing, 'move-down');
});

test('finishing an action resumes idle when nothing was requested meanwhile', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction();
	s.update(1);
	assert.equal(animator.state, 'idle');
	assert.equal(s.playing, 'idle-down');
});

test('a second playAction while one is running is ignored without restart', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction();
	s.update(0.05); // partway through the first frame of the action
	const before = s.playing;

	animator.playAction();
	assert.equal(animator.state, 'action');
	assert.equal(s.playing, before);
});

test('playAction with restart replays even while one is already running', () => {
	const s = sprite();
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction();
	s.update(0.15); // advance into the second frame
	animator.playAction(undefined, true);

	//restarted from the first frame - the running animation's own progress does not carry over
	assert.equal(animator.state, 'action');
});

test('playAction can switch variant at the same time', () => {
	const s = sprite(['down', 'right']);
	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });

	animator.playAction('right');
	assert.equal(animator.variantName, 'right');
	assert.equal(s.playing, 'action-right');
});

test('a state with nothing registered for the current variant is silently skipped', () => {
	const s = sprite(['down']); // no "up" animations registered at all
	const animator = new ActorAnimator(s, { animationName: name, variant: 'up' });

	//construction itself must not throw even though idle-up does not exist
	assert.equal(s.playing, null);

	animator.setMoving(true);
	assert.equal(s.playing, null); // move-up also does not exist

	animator.playAction();
	assert.equal(animator.state, 'action'); // the state still updates...
	assert.equal(s.playing, null); // ...even though nothing is actually playing
});

test('an action registered looping by mistake never resumes idle/move on its own', () => {
	const s = new AnimatedSprite();
	s.add('idle-down', [Texture.WHITE]);
	s.add('action-down', [Texture.WHITE, Texture.EMPTY], { loop: true, fps: 10 }); // should be loop: false

	const animator = new ActorAnimator(s, { animationName: name, variant: 'down' });
	animator.playAction();
	s.update(10); // many loops of a looping animation never fire onFinish

	assert.equal(animator.state, 'action');
});
