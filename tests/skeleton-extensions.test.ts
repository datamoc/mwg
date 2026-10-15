import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Skeleton from '../src/skeleton/index.ts';

function near(actual: number, expected: number): void {
	assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

const chain = Skeleton.create([
	{ name: 'mount', rotation: 30, origin: { x: 4, y: -3 } },
	{ name: 'thigh', parent: 'mount', length: 12, rotation: 10 },
	{ name: 'shin', parent: 'thigh', length: 9, rotation: 20 },
]);

test('two-bone IK reaches targets with both bend directions, rest angles and a rotated parent', () => {
	for (const bend of [-1, 1] as const) {
		for (const target of [
			{ x: 12, y: 7 },
			{ x: -8, y: -4 },
			{ x: 25, y: -3 },
			{ x: 7, y: -3 },
		]) {
			const pose = Skeleton.solveTwoBoneIK(chain, 'thigh', 'shin', target, bend);
			const tip = Skeleton.resolve(chain, pose).find((b) => b.name === 'shin')!;
			near(tip.tipX, target.x);
			near(tip.tipY, target.y);
			assert.ok((pose.shin + 20) * bend >= -1e-8);
			assert.deepEqual(pose, Skeleton.solveTwoBoneIK(chain, 'thigh', 'shin', target, bend));
		}
	}
});

test('IK refuses unreachable targets, disconnected chains and invalid inputs by name', () => {
	for (const target of [
		{ x: 100, y: 0 },
		{ x: 4, y: -3 },
	])
		assert.throws(() => Skeleton.solveTwoBoneIK(chain, 'thigh', 'shin', target), /unreachable.*thigh\/shin/);
	assert.throws(() => Skeleton.solveTwoBoneIK(chain, 'mount', 'shin', { x: 0, y: 0 }), /connected/);
	assert.throws(() => Skeleton.solveTwoBoneIK(chain, 'thigh', 'shin', { x: NaN, y: 0 }), /invalid IK/);
	assert.throws(
		() =>
			Skeleton.create([
				{ name: 'a', parent: 'b' },
				{ name: 'b', parent: 'a' },
			]),
		/cycle.*a/,
	);
});

test('joint limits catch the wrong knee bend at sample time including rest rotation', () => {
	const rig = Skeleton.create([{ name: 'knee', rotation: 20, limits: { min: 0, max: 140 } }]);
	const clip: Skeleton.Clip = { id: 'wrong-knee', duration: 1, frames: [{ time: 0, rotations: { knee: -45 } }] };
	assert.throws(() => Skeleton.samplePose(clip, 0, rig), /joint limit.*knee.*-25/);
	assert.throws(() => Skeleton.advance(Skeleton.createMixer(rig, clip), 0), /joint limit.*knee/);
	Skeleton.validatePose(rig, { knee: -20 });
	Skeleton.validatePose(rig, { knee: 120 });
	assert.throws(() => Skeleton.validatePose(rig, { knee: 120.01 }), /joint limit.*knee/);
	assert.throws(() => Skeleton.create([{ name: 'bad', limits: { min: 5, max: 0 } }]), /invalid joint limits.*bad/);
});

const bob: Skeleton.Clip = {
	id: 'bob',
	duration: 2,
	frames: [
		{ time: 0, rotations: {} },
		{ time: 2, rotations: { body: 40 }, translations: { body: { x: 4, y: -8 } }, scales: { body: { x: 3, y: 2 } } },
	],
};

test('clip translation and scale interpolate, loop, reverse and hold with rotations', () => {
	const halfway = Skeleton.sampleTransformPose(bob, 1);
	assert.deepEqual(halfway, {
		rotations: { body: 20 },
		translations: { body: { x: 2, y: -4 } },
		scales: { body: { x: 2, y: 1.5 } },
	});
	assert.deepEqual(Skeleton.sampleTransformPose({ ...bob, loop: true }, -1), halfway);
	assert.deepEqual(Skeleton.sampleTransformPose(bob, 99), Skeleton.sampleTransformPose(bob, 2));
	assert.deepEqual(Skeleton.sampleTransformPose(bob, -1), { rotations: {} });
	const delayed = { ...bob, frames: bob.frames.map((f) => ({ ...f, time: f.time + 1 })), duration: 3 };
	assert.deepEqual(Skeleton.samplePose(delayed, 0), {});
});

test('all channels crossfade to identity and layers only displace named bones', () => {
	const rig = Skeleton.create([{ name: 'body' }]);
	const mixer = Skeleton.createMixer(rig, { ...bob, frames: [bob.frames[1]] });
	Skeleton.crossfadeTo(mixer, { id: 'rest', duration: 5, frames: [{ time: 0, rotations: {} }] }, 2);
	const pose = Skeleton.advancePose(mixer, 1);
	assert.deepEqual(pose.translations, { body: { x: 2, y: -4 } });
	assert.deepEqual(pose.scales, { body: { x: 2, y: 1.5 } });
	mixer.layers.push({
		playback: { clip: { ...bob, frames: [bob.frames[1]] }, time: 0, rate: 0 },
		weight: 0.5,
		priority: 0,
	});
	const layered = Skeleton.advancePose(mixer, 1);
	assert.deepEqual(layered.translations, pose.translations);
	assert.deepEqual(layered.scales, pose.scales);
});

test('resolved translations follow parent axes and scale propagates to tips and sprite dimensions', () => {
	const rig = Skeleton.create([
		{ name: 'root', rotation: 90, length: 10 },
		{ name: 'child', parent: 'root', origin: { x: 2, y: 3 }, length: 5 },
	]);
	const child = Skeleton.resolve(rig, {
		rotations: {},
		translations: { child: { x: 1, y: 1 } },
		scales: { root: { x: 2, y: 3 }, child: { x: 0.5, y: 2 } },
	})[1];
	near(child.x, -12);
	near(child.y, 26);
	near(child.tipX, -12);
	near(child.tipY, 31);
	assert.equal(child.scaleX, 1);
	assert.equal(child.scaleY, 6);
});

test('nonuniform scale followed by child rotation preserves the affine chain and reflection', () => {
	const rig = Skeleton.create([
		{ name: 'root' },
		{ name: 'child', parent: 'root', rotation: 90, length: 10 },
		{ name: 'tip', parent: 'child', origin: { x: 1, y: 2 } },
	]);
	const transforms = Skeleton.resolve(rig, { rotations: {}, scales: { root: { x: 2, y: 3 } } });
	near(transforms[1].tipX, 0);
	near(transforms[1].tipY, 20);
	near(transforms[2].x, -6);
	near(transforms[2].y, 22);
	const reflected = Skeleton.resolve(rig, { rotations: {}, scales: { root: { x: -2, y: 3 } } });
	near(reflected[1].tipX, 0);
	near(reflected[1].tipY, -20);
	near(reflected[2].x, -6);
	near(reflected[2].y, -22);
	assert.throws(
		() => Skeleton.resolve(rig, { rotations: {}, scales: { root: { x: Infinity, y: 1 } } }),
		/invalid transform.*root/,
	);
});

test('empty clips still validate the resting joint angle', () => {
	const rig = Skeleton.create([{ name: 'knee', rotation: -10, limits: { min: 0, max: 140 } }]);
	assert.throws(
		() => Skeleton.sampleTransformPose({ id: 'empty', duration: 1, frames: [] }, 0, rig),
		/joint limit.*knee/,
	);
});
