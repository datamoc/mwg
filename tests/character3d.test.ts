import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';

import { Character3D } from '../src/three-d/Character3D.ts';

/**
 * `Character3D`'s base constructor and its animation bookkeeping need no real Babylon
 * `Scene`/`Engine` (only its two static factories, `fromMesh`/`billboard`, do), so this
 * drives it with plain fakes shaped like `TransformNode`/`AnimationGroup` - the same
 * injected-fake pattern `Sound`/`Music` already use for `Playable`.
 */
function fakeNode(): TransformNode {
	return {
		position: new Vector3(0, 0, 0),
		rotation: { y: 0 },
	} as unknown as TransformNode;
}

function fakeClip(name: string): AnimationGroup & { startCalls: number; stopCalls: number; loopArg?: boolean } {
	const clip = {
		name,
		isPlaying: false,
		startCalls: 0,
		stopCalls: 0,
		loopArg: undefined as boolean | undefined,
		start(loop?: boolean) {
			clip.isPlaying = true;
			clip.startCalls++;
			clip.loopArg = loop;
			return clip;
		},
		stop() {
			clip.isPlaying = false;
			clip.stopCalls++;
			return clip;
		},
	};
	return clip as unknown as AnimationGroup & { startCalls: number; stopCalls: number; loopArg?: boolean };
}

test('moveTo/update interpolates position and faces the direction of travel', () => {
	const character = new Character3D(fakeNode());
	character.moveTo(10, 0, 0, 5);

	const stillMoving = character.update(1);
	assert.ok(stillMoving);
	assert.equal(character.node.position.x, 5);

	const arrived = character.update(1);
	assert.equal(arrived, false);
	assert.equal(character.node.position.x, 10);
});

test('moveTo rejects a non-positive speed', () => {
	const character = new Character3D(fakeNode());
	assert.throws(() => character.moveTo(1, 0, 0, 0), /positive/);
});

test('hasAnimation/playAnimation/currentAnimation reflect the imported clip set', () => {
	const walk = fakeClip('walk');
	const idle = fakeClip('idle');
	const character = new Character3D(fakeNode(), [walk, idle]);

	assert.equal(character.hasAnimation('walk'), true);
	assert.equal(character.hasAnimation('run'), false);
	assert.equal(character.currentAnimation, null);

	assert.equal(character.playAnimation('walk'), true);
	assert.equal(character.currentAnimation, 'walk');
	assert.equal(walk.startCalls, 1);
	assert.equal(walk.loopArg, true);
});

test('playAnimation stops the previous clip before starting the next one', () => {
	const walk = fakeClip('walk');
	const idle = fakeClip('idle');
	const character = new Character3D(fakeNode(), [walk, idle]);

	character.playAnimation('walk');
	character.playAnimation('idle');

	assert.equal(walk.stopCalls, 1);
	assert.equal(idle.startCalls, 1);
	assert.equal(character.currentAnimation, 'idle');
});

test('playAnimation for an unknown name is a no-op that returns false', () => {
	const walk = fakeClip('walk');
	const character = new Character3D(fakeNode(), [walk]);

	character.playAnimation('walk');
	const result = character.playAnimation('does-not-exist');

	assert.equal(result, false);
	assert.equal(character.currentAnimation, 'walk');
	assert.equal(walk.stopCalls, 0);
});

test('replaying the same clip that already stopped restarts it instead of no-op-ing', () => {
	const walk = fakeClip('walk');
	const character = new Character3D(fakeNode(), [walk]);

	character.playAnimation('walk');
	walk.stop(); //something outside Character3D's own control stopped it
	character.playAnimation('walk');

	assert.equal(walk.startCalls, 2);
});

test('stopAnimation stops the current clip and clears currentAnimation', () => {
	const walk = fakeClip('walk');
	const character = new Character3D(fakeNode(), [walk]);

	character.playAnimation('walk');
	character.stopAnimation();

	assert.equal(walk.stopCalls, 1);
	assert.equal(character.currentAnimation, null);
});

test('stopAnimation with nothing playing does not throw', () => {
	const character = new Character3D(fakeNode(), []);
	assert.doesNotThrow(() => character.stopAnimation());
});
