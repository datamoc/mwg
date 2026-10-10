import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as Skeleton from '../src/skeleton/index.ts';

const puppet = Skeleton.create([
	{ name: 'body', length: 10 },
	{ name: 'arm', parent: 'body', length: 12, origin: { x: 0, y: 4 } },
	{ name: 'hand', parent: 'arm', length: 4 },
]);

test('a pose resolves through the tree: one number on one bone moves the chain', () => {
	const still = Skeleton.resolve(puppet);
	const body = still.find((bone) => bone.name === 'body')!;
	assert.deepEqual([body.x, body.y], [0, 0]);
	assert.equal(body.angle, 0);
	assert.equal(body.tipX, 10); //angle 0 reaches along +x

	const raised = Skeleton.resolve(puppet, { arm: 90 });
	const arm = raised.find((bone) => bone.name === 'arm')!;
	const hand = raised.find((bone) => bone.name === 'hand')!;
	assert.equal(arm.angle, 90);
	assert.equal(hand.angle, 90); //the hand follows its parent
	assert.ok(Math.abs(hand.tipX - arm.tipX) < 1e-9);
	//the body itself never moved
	assert.equal(raised.find((bone) => bone.name === 'body')!.angle, 0);

	const tilted = Skeleton.resolve(puppet, { body: 45, arm: 45 });
	assert.equal(tilted.find((bone) => bone.name === 'arm')!.angle, 90);
});

test('a skeleton refuses duplicates and cycles by name', () => {
	assert.throws(() => Skeleton.create([{ name: 'a' }, { name: 'a' }]), /duplicate/);
	assert.throws(() => Skeleton.create([{ name: 'a' }, { name: 'b', parent: 'ghost' }]), /names no parent/);
});

test('clips interpolate, loop and hold their ends', () => {
	const swing: Skeleton.Clip = {
		id: 'swing',
		duration: 2,
		frames: [
			{ time: 0, rotations: { arm: 0 } },
			{ time: 1, rotations: { arm: 90 } },
			{ time: 2, rotations: { arm: 0 } },
		],
	};
	assert.equal(Skeleton.samplePose(swing, 0.5).arm, 45);
	assert.equal(Skeleton.samplePose(swing, 1).arm, 90);
	//a bone a frame does not name interpolates from its rest rotation
	const partial: Skeleton.Clip = {
		id: 'partial',
		duration: 1,
		frames: [
			{ time: 0, rotations: {} },
			{ time: 1, rotations: { body: 30 } },
		],
	};
	assert.equal(Skeleton.samplePose(partial, 0.5).body, 15);
	const loop: Skeleton.Clip = { ...swing, loop: true };
	assert.equal(Skeleton.samplePose(loop, 2.5).arm, 45);
	assert.equal(Skeleton.samplePose(loop, -0.5).arm, 45);
	const oneShot = Skeleton.samplePose(swing, 99);
	assert.equal(oneShot.arm, 0);
});

test('layers mix by weight and priority on top of the base', () => {
	const aim = { pose: { arm: 90 }, weight: 1, priority: 2 };
	const hurt = { pose: { body: 30 }, weight: 1, priority: 1 };
	const mixed = Skeleton.mixPoses({ arm: 0, body: 0 }, [aim, hurt]);
	assert.equal(mixed.arm, 90);
	assert.equal(mixed.body, 30);
	const half = Skeleton.mixPoses({ arm: 0 }, [{ pose: { arm: 90 }, weight: 0.5, priority: 0 }]);
	assert.equal(half.arm, 45);
	//a higher-priority layer displaces a lower one on the same bone
	const overriding = Skeleton.mixPoses({ arm: 0 }, [
		{ pose: { arm: 90 }, weight: 1, priority: 1 },
		{ pose: { arm: 180 }, weight: 1, priority: 2 },
	]);
	assert.equal(overriding.arm, 180);
});

test('a mixer advances, layers additively, and crossfades blend', () => {
	const idle: Skeleton.Clip = {
		id: 'idle',
		duration: 2,
		loop: true,
		frames: [
			{ time: 0, rotations: { arm: 0 } },
			{ time: 2, rotations: { arm: 10 } },
		],
	};
	const walk: Skeleton.Clip = {
		id: 'walk',
		duration: 1,
		loop: true,
		frames: [
			{ time: 0, rotations: { arm: -20 } },
			{ time: 0.5, rotations: { arm: 20 } },
			{ time: 1, rotations: { arm: -20 } },
		],
	};
	const mixer = Skeleton.createMixer(puppet, idle);
	assert.equal(Skeleton.advance(mixer, 1).arm, 5); //halfway through the idle swing

	mixer.layers.push({
		playback: { clip: walk, time: 0, rate: 1 },
		weight: 0.5,
		priority: 5,
	});
	const layered = Skeleton.advance(mixer, 1);
	//base idle at t=2 wraps to 0 (arm 0), walk at t=1 wraps to 0 (arm -20), half weight
	assert.ok(Math.abs(layered.arm - -10) < 1e-9);

	Skeleton.crossfadeTo(mixer, walk, 2);
	const faded = Skeleton.advance(mixer, 1);
	//half through the fade: idle (wrapped to t=1, arm 5) blends 50/50 with walk (wrapped
	assert.ok(Math.abs(faded.arm - -13.75) < 1e-9, 'arm blended to ' + faded.arm);
	//to t=0, arm -20) for -7.5, and the walk layer displaces that by half weight to -13.75
	//the fade finishes, and the base is the new clip
	Skeleton.advance(mixer, 1);
	assert.equal(mixer.crossfade, undefined);
	assert.equal(mixer.base.clip.id, 'walk');
	//a negative rate plays backwards, and playback is data: nothing mutated but the clock
	const back = Skeleton.advancePlayback({ clip: walk, time: 0.75, rate: -1 }, 0.5);
	assert.equal(back.time, 0.25);
});
