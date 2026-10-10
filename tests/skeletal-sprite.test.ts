import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Texture, TextureSource } from 'pixi.js';

import * as Skeleton from '../src/skeleton/index.ts';
import { ArticulatedChain, ChainRig, SkeletalSprite } from '../src/two-d/render/SkeletalSprite.ts';

const blank = (): Texture => new Texture({ source: new TextureSource({ width: 8, height: 8 }) });

const puppet = Skeleton.create([
	{ name: 'body', length: 10 },
	{ name: 'arm', parent: 'body', length: 12 },
]);
const idle: Skeleton.Clip = {
	id: 'idle',
	duration: 1,
	loop: true,
	frames: [
		{ time: 0, rotations: { arm: 0 } },
		{ time: 1, rotations: { arm: 90 } },
	],
};

test('a skeletal sprite places each part on its bone', () => {
	const mixer = Skeleton.createMixer(puppet, idle);
	const rig = new SkeletalSprite(puppet, mixer);
	const arm = rig.bind('arm', blank());
	assert.equal(rig.part('arm'), arm);
	assert.equal(rig.children.length, 1);
	rig.update(0);
	assert.equal(arm.x, 10); //the arm's base is the body's tip
	assert.equal(arm.rotation, 0);
	rig.update(0.5);
	assert.equal(arm.rotation, Math.PI / 4); //half the swing to 90 degrees
	//a part bound to a bone the skeleton does not have is refused by name at apply time
	const stray = new SkeletalSprite(puppet);
	stray.bind('tail', blank());
	assert.throws(() => stray.apply({}), /binds no bone named tail/);
});

test('a skeletal sprite without a mixer needs apply(pose), and refuses update', () => {
	const rig = new SkeletalSprite(puppet);
	const arm = rig.bind('arm', blank());
	rig.apply({ arm: 90 });
	assert.equal(arm.rotation, Math.PI / 2);
	assert.throws(() => rig.update(1), /needs apply/);
});

test('an articulated chain follows its head with fixed segment lengths', () => {
	const chain = new ArticulatedChain({ segments: 4, length: 10 });
	//hold the head and let the body converge: each segment eases toward its parent's
	//previous position, so the tail catches up over several ticks, not one
	for (let tick = 0; tick < 60; tick++) {
		chain.pull(0, 20);
		chain.update(1);
	}
	for (let index = 1; index < chain.points.length; index++) {
		const before = chain.points[index - 1];
		const segment = chain.points[index];
		assert.ok(Math.abs(Math.hypot(segment.x - before.x, segment.y - before.y) - 10) < 1e-6);
	}
	assert.ok(chain.points[1].y > 0, 'the first segment eased toward the head');
	//a head that never moves leaves the chain at rest after a tick
	chain.update(1);
	chain.update(1);
	for (const point of chain.points) assert.ok(Math.abs(point.y) < 30);
});

test('an articulated chain refuses impossible shapes, and bends no further than its limit', () => {
	assert.throws(() => new ArticulatedChain({ segments: 1, length: 10 }), /at least two/);
	assert.throws(() => new ArticulatedChain({ segments: 4, length: 0 }), /positive length/);
	const stiff = new ArticulatedChain({ segments: 5, length: 10, stiffness: 1, bendLimit: 30 });
	//walk the head in a tight circle: no two consecutive segments may bend past 30 degrees
	for (let step = 0; step < 60; step++) {
		stiff.pull(Math.cos(step / 4) * 60, Math.sin(step / 4) * 60);
		stiff.update(1);
		for (let index = 2; index < stiff.points.length; index++) {
			const before = stiff.points[index - 2];
			const parent = stiff.points[index - 1];
			const segment = stiff.points[index];
			const base = Math.atan2(parent.y - before.y, parent.x - before.x);
			const bend = Math.atan2(segment.y - parent.y, segment.x - parent.x);
			let delta = bend - base;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta < -Math.PI) delta += 2 * Math.PI;
			assert.ok(Math.abs(delta) <= 30 * (Math.PI / 180) + 1e-9, 'bend kept within its limit');
		}
	}
});

test('a chain rig needs one texture per segment and positions them on update', () => {
	const chain = new ArticulatedChain({ segments: 3, length: 8 });
	const rig = new ChainRig(chain, [blank(), blank(), blank()]);
	assert.equal(rig.children.length, 3);
	assert.throws(() => new ChainRig(chain, [blank()]), /one texture per segment/);
	chain.pull(8, 0);
	rig.update(1);
	assert.deepEqual([rig.children[0].x, rig.children[0].y], [8, 0]);
});
