/**
 * Skeletal pose math, renderer-free: a bone tree, keyframed clips, and layered blending.
 *
 * The pose half of a skeletal puppet (roadmap 399), as pure data and arithmetic so it loads
 * headless and tests without a renderer - the same split every other module draws. A bone
 * is a name, a parent name, a length and a local rotation; a pose is one rotation per bone,
 * with optional per-bone translations and scales riding the same timeline; resolving a pose
 * walks the tree so rotating an arm, a leg or a head is one number on one bone and the rest
 * of the body follows. Clips are keyframed poses over time - plain data a game authors in
 * JSON, never code, and never a borrowed game's animation data - with interpolation,
 * looping, a playback rate and a crossfade between clips. Additive layers (aim on top of
 * walk, hurt on top of idle) mix by priority, so a game composes motion instead of
 * authoring every combination as its own clip.
 *
 * @example
 * ```ts
 * import * as Skeleton from '@datamoc/mwg/skeleton';
 *
 * const puppet = Skeleton.create([
 *   { name: 'body' },
 *   { name: 'arm', parent: 'body', length: 12 },
 * ]);
 * const mixer = Skeleton.createMixer(puppet, { id: 'idle', duration: 2, loop: true, frames: [
 *   { time: 0, rotations: {} },
 *   { time: 1, rotations: { arm: 90 } },
 * ] });
 * Skeleton.advance(mixer, 1); // the arm swings up over one second
 * const pose = Skeleton.advance(mixer, 1); // the arm swings up over one second
 * const arm = Skeleton.resolve(puppet, pose)[1]; // world x, y and angle per bone
 * ```
 */

export interface Bone {
	/** unique within one skeleton */
	name: string;
	/** the parent bone's name; the roots have none */
	parent?: string;
	/** how far the bone reaches from its base, world units */
	length?: number;
	/** the bone's own offset from its parent's tip, before any pose */
	origin?: { x: number; y: number };
	/** the bone's rest rotation, degrees */
	rotation?: number;
	/** absolute local-angle bounds, degrees; out-of-range poses fail at sample time */
	limits?: { min: number; max: number };
}

export interface SkeletonBones {
	bones: readonly Bone[];
}

/** one rotation per bone name, degrees; a bone left out keeps its rest rotation */
export type Pose = Readonly<Record<string, number>>;

/** a full pose: rotations plus optional per-bone translations and scales */
export interface TransformPose {
	rotations: Pose;
	translations?: Record<string, { x: number; y: number }>;
	scales?: Record<string, { x: number; y: number }>;
}

/** a 2D affine matrix, row-major */
export interface AffineMatrix {
	a: number;
	b: number;
	c: number;
	d: number;
}

export interface Keyframe {
	/** seconds into the clip */
	time: number;
	rotations: Pose;
	translations?: Record<string, { x: number; y: number }>;
	scales?: Record<string, { x: number; y: number }>;
}

export interface Clip {
	id: string;
	/** seconds; a looping clip wraps at it, a one-shot holds its last frame */
	duration: number;
	loop?: boolean;
	/** ascending by time; the first needs no time 0 entry, the last needs no duration entry */
	frames: readonly Keyframe[];
}

/** a clip in motion: its playhead and rate */
export interface Playback {
	clip: Clip;
	time: number;
	/** multiplied per advance; negative plays backwards, 0 freezes */
	rate: number;
}

export interface Layer {
	playback: Playback;
	/** 0..1, how far this layer's pose displaces the pose beneath it */
	weight: number;
	/** layers apply in ascending priority; same-priority layers keep their given order */
	priority: number;
}

export interface Mixer {
	skeleton: SkeletonBones;
	/** the base motion, always present */
	base: Playback;
	/** additive layers over the base */
	layers: Layer[];
	/** while set, the previous base fades out as the new one fades in */
	crossfade?: { from: Playback; remaining: number; duration: number };
}

export interface BoneTransform {
	name: string;
	/** the bone's base in world space */
	x: number;
	y: number;
	/** the bone's angle in world space, degrees */
	angle: number;
	/** the bone's world scale, composed down the chain */
	scaleX: number;
	scaleY: number;
	/** the bone's world matrix: its rotation times its scale */
	matrix: AffineMatrix;
	/** the bone's tip in world space, `length` along its angle */
	tipX: number;
	tipY: number;
}

/** names in dependency order: every bone after its parent, so resolution is one pass */
export function boneOrder(skeleton: SkeletonBones): string[] {
	const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
	const order: string[] = [];
	const placed = new Set<string>();
	const placing = new Set<string>();
	const visit = (bone: Bone): void => {
		if (placed.has(bone.name)) return;
		if (placing.has(bone.name)) throw new Error(`skeleton cycle involving ${bone.name}`);
		if (bone.parent && !byName.has(bone.parent))
			throw new Error(`skeleton bone ${bone.name} names no parent ${bone.parent}`);
		if (bone.parent) {
			placing.add(bone.name);
			const parent = byName.get(bone.parent);
			if (parent) visit(parent);
			placing.delete(bone.name);
		}
		if (!placed.has(bone.name)) {
			placed.add(bone.name);
			order.push(bone.name);
		}
	};
	for (const bone of skeleton.bones) visit(bone);
	return order;
}

/** create a skeleton, refusing duplicate names, cycles and invalid joint limits by name */
export function create(bones: readonly Bone[]): SkeletonBones {
	const names = new Set<string>();
	for (const bone of bones) {
		if (names.has(bone.name)) throw new Error(`duplicate skeleton bone ${bone.name}`);
		names.add(bone.name);
		if (bone.limits && !(bone.limits.min <= bone.limits.max))
			throw new Error(`invalid joint limits for bone ${bone.name}`);
	}
	const order = boneOrder({ bones });
	//boneOrder throws on a missing parent, which is also what a cycle surfaces as here
	for (const bone of bones)
		if (bone.parent && order.indexOf(bone.parent) >= order.indexOf(bone.name))
			throw new Error(`skeleton bone ${bone.name} cannot precede its parent ${bone.parent}`);
	return { bones };
}

/**
 * A pose through the tree: each bone starts at its parent's tip plus its origin and
 * translation, transformed by the parent's rotation and scale, and reaches along its
 * own rotation and composed scale. Translations ride in the bone's rest frame; scales
 * multiply down the chain, so a scaled parent carries its children with it.
 */
export function resolve(skeleton: SkeletonBones, pose: Pose | TransformPose = {}): BoneTransform[] {
	const rotations: Pose =
		typeof (pose as TransformPose).rotations === 'object' ? (pose as TransformPose).rotations : (pose as Pose);
	const translations = (pose as TransformPose).translations ?? {};
	const scales = (pose as TransformPose).scales ?? {};
	const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
	const world = new Map<string, BoneTransform>();
	for (const name of boneOrder(skeleton)) {
		const bone = byName.get(name);
		if (!bone) throw new Error(`skeleton bone ${name} went missing`);
		const parent = bone.parent ? world.get(bone.parent) : undefined;
		const rotation = (bone.rotation ?? 0) + (rotations[name] ?? 0);
		const angle = (parent ? parent.angle : 0) + rotation;
		const scale = scales[name] ?? { x: 1, y: 1 };
		const scaleX = (parent ? parent.scaleX : 1) * scale.x;
		const scaleY = (parent ? parent.scaleY : 1) * scale.y;
		const radians = (angle * Math.PI) / 180;
		const matrix: AffineMatrix = {
			a: Math.cos(radians) * scaleX,
			b: Math.sin(radians) * scaleX,
			c: -Math.sin(radians) * scaleY,
			d: Math.cos(radians) * scaleY,
		};
		const parentMatrix: AffineMatrix = parent
			? { a: parent.matrix.a, b: parent.matrix.b, c: parent.matrix.c, d: parent.matrix.d }
			: { a: 1, b: 0, c: 0, d: 1 };
		const originX = bone.origin?.x ?? 0;
		const originY = bone.origin?.y ?? 0;
		const localX = originX + (translations[name]?.x ?? 0);
		const localY = originY + (translations[name]?.y ?? 0);
		const x = (parent ? parent.tipX : 0) + parentMatrix.a * localX + parentMatrix.c * localY;
		const y = (parent ? parent.tipY : 0) + parentMatrix.b * localX + parentMatrix.d * localY;
		for (const value of [matrix.a, matrix.b, matrix.c, matrix.d])
			if (!Number.isFinite(value)) throw new Error(`invalid transform for bone ${name}`);
		world.set(name, {
			name,
			x,
			y,
			angle,
			scaleX,
			scaleY,
			matrix,
			tipX: x + matrix.a * (bone.length ?? 0),
			tipY: y + matrix.b * (bone.length ?? 0),
		});
	}
	return [...world.values()];
}

/** the rotations a clip shows at `time`, interpolated, looped or held, validated */
export function samplePose(clip: Clip, time: number, skeleton?: SkeletonBones): Record<string, number> {
	const result = { ...sampleTransformPose(clip, time, skeleton).rotations };
	return result;
}

/** Sample every channel with the same timeline as rotations: holds the first frame
 * before it, the last past the end of a one-shot, and wraps a looping clip.
 * @example
 * ```ts
 * import { sampleTransformPose } from '@datamoc/mwg/skeleton';
 * const pose = sampleTransformPose({ id: 'idle', duration: 1, frames: [{ time: 0, rotations: {} }] }, 0.5);
 * ```
 */
export function sampleTransformPose(clip: Clip, time: number, skeleton?: SkeletonBones): TransformPose {
	const frames = clip.frames;
	if (!frames.length) {
		if (skeleton) validatePose(skeleton, {});
		return { rotations: {} };
	}
	const clock = clip.loop && clip.duration > 0 ? ((time % clip.duration) + clip.duration) % clip.duration : time;
	let pose: TransformPose = frames[0];
	if (!clip.loop && clock >= clip.duration) pose = frames[frames.length - 1];
	else if (clock >= frames[0].time) {
		pose = frames[frames.length - 1];
		for (let i = 1; i < frames.length; i++) {
			if (clock < frames[i].time) {
				const span = frames[i].time - frames[i - 1].time;
				pose = blendTransforms(
					frames[i - 1],
					frames[i],
					span > 0 ? (clock - frames[i - 1].time) / span : 0,
					true,
				);
				break;
			}
		}
	}
	const result = blendTransforms(pose, pose, 0, true);
	if (skeleton) validatePose(skeleton, result.rotations);
	return result;
}

/** move a playback's playhead, wrapping a looping clip and clamping a one-shot */
export function advancePlayback(playback: Playback, dt: number): Playback {
	const clip = playback.clip;
	let time = playback.time + dt * playback.rate;
	if (clip.loop && clip.duration > 0) {
		time = time % clip.duration;
		if (time < 0) time += clip.duration;
	} else {
		time = Math.max(0, Math.min(clip.duration, time));
	}
	return { clip, time, rate: playback.rate };
}

/** a mixer over a skeleton: one base clip, any number of weighted layers */
export function createMixer(skeleton: SkeletonBones, base: Clip, rate = 1): Mixer {
	return { skeleton, base: { clip: base, time: 0, rate }, layers: [] };
}

/** crossfade: the current base fades out over `duration` seconds as the new one fades in */
export function crossfadeTo(mixer: Mixer, clip: Clip, duration = 0.25, rate = mixer.base.rate): void {
	if (duration <= 0) {
		mixer.base = { clip, time: 0, rate };
		mixer.crossfade = undefined;
		return;
	}
	mixer.crossfade = { from: mixer.base, remaining: duration, duration };
	mixer.base = { clip, time: 0, rate };
}

/** mix poses by layer priority: each layer displaces what is beneath it by its weight */
export function mixPoses(
	base: Pose,
	layers: ReadonlyArray<{ pose: Pose; weight: number; priority: number }>,
): Record<string, number> {
	let mixed: TransformPose = { rotations: base };
	for (const layer of [...layers].sort((a, b) => a.priority - b.priority)) {
		const weight = Math.max(0, Math.min(1, layer.weight));
		if (weight) mixed = blendTransforms(mixed, { rotations: layer.pose }, weight, false);
	}
	return { ...mixed.rotations };
}

/**
 * One tick: advance every playback, sample the base (crossfaded when a fade is running),
 * layer the additive poses over it, and return the pose. Call `resolve` on the result when
 * the world transforms are what the drawing side needs.
 */
export function advance(mixer: Mixer, dt: number): Record<string, number> {
	return { ...advancePose(mixer, dt).rotations };
}

/** Advance all clip channels together, including crossfades and priority layers.
 * @example
 * ```ts
 * import { create, createMixer, advancePose } from '@datamoc/mwg/skeleton';
 * const mixer = createMixer(create([{ name: 'body' }]), { id: 'bob', duration: 1,
 * frames: [{ time: 0, rotations: {}, translations: { body: { x: 0, y: 4 } } }] });
 * const pose = advancePose(mixer, 0.1);
 * ```
 */
export function advancePose(mixer: Mixer, dt: number): TransformPose {
	mixer.base = advancePlayback(mixer.base, dt);
	for (const layer of mixer.layers) layer.playback = advancePlayback(layer.playback, dt);
	let pose = sampleTransformPose(mixer.base.clip, mixer.base.time, mixer.skeleton);
	if (mixer.crossfade) {
		const fade = mixer.crossfade;
		fade.from = advancePlayback(fade.from, dt);
		fade.remaining = Math.max(0, fade.remaining - dt);
		const outgoing = sampleTransformPose(fade.from.clip, fade.from.time, mixer.skeleton);
		const t = fade.duration > 0 ? 1 - fade.remaining / fade.duration : 1;
		pose = blendTransforms(outgoing, pose, t, true);
		if (fade.remaining === 0) mixer.crossfade = undefined;
	}
	for (const layer of [...mixer.layers].sort((a, b) => a.priority - b.priority))
		pose = blendTransforms(
			pose,
			sampleTransformPose(layer.playback.clip, layer.playback.time, mixer.skeleton),
			Math.max(0, Math.min(1, layer.weight)),
			false,
		);
	return pose;
}

function blendTransforms(from: TransformPose, to: TransformPose, weight: number, union: boolean): TransformPose {
	const rotations = { ...from.rotations };
	for (const name of new Set([...Object.keys(to.rotations), ...(union ? Object.keys(from.rotations) : [])]))
		rotations[name] = (from.rotations[name] ?? 0) * (1 - weight) + (to.rotations[name] ?? 0) * weight;
	const result: TransformPose = { rotations };
	for (const channel of ['translations', 'scales'] as const) {
		const a = from[channel] ?? {};
		const b = to[channel] ?? {};
		const fallback = channel === 'scales' ? 1 : 0;
		const values = { ...a };
		for (const name of new Set([...Object.keys(b), ...(union ? Object.keys(a) : [])])) {
			values[name] = {
				x: (a[name]?.x ?? fallback) * (1 - weight) + (b[name]?.x ?? fallback) * weight,
				y: (a[name]?.y ?? fallback) * (1 - weight) + (b[name]?.y ?? fallback) * weight,
			};
		}
		if (Object.keys(values).length) result[channel] = values;
	}
	return result;
}

/** Refuse non-finite rotations and absolute local angles outside a joint's bounds.
 * @example
 * ```ts
 * import { create, validatePose } from '@datamoc/mwg/skeleton';
 * validatePose(create([{ name: 'knee', limits: { min: -120, max: 0 } }]), { knee: -30 });
 * ```
 */
export function validatePose(skeleton: SkeletonBones, pose: Pose): void {
	for (const bone of skeleton.bones) {
		const angle = (bone.rotation ?? 0) + (pose[bone.name] ?? 0);
		if (!Number.isFinite(angle)) throw new Error(`invalid rotation for bone ${bone.name}`);
		if (bone.limits && (angle < bone.limits.min || angle > bone.limits.max))
			throw new Error(
				`joint limit for bone ${bone.name}: ${angle} outside [${bone.limits.min}, ${bone.limits.max}]`,
			);
	}
}

/** Solve a connected two-bone chain toward a world target without stretching.
 * Positive bend rotates the second bone clockwise in screen coordinates. Origins on the
 * second bone must be zero; the solver accepts rotation-only poses.
 * @example
 * ```ts
 * import { create, solveTwoBoneIK } from '@datamoc/mwg/skeleton';
 * const rig = create([{ name: 'upper', length: 10 }, { name: 'lower', parent: 'upper', length: 10 }]);
 * const pose = solveTwoBoneIK(rig, 'upper', 'lower', { x: 10, y: 10 });
 * ```
 */
export function solveTwoBoneIK(
	skeleton: SkeletonBones,
	first: string,
	second: string,
	target: { x: number; y: number },
	bend: 1 | -1 = 1,
	pose: Pose = {},
): Record<string, number> {
	const upper = skeleton.bones.find((b) => b.name === first);
	const lower = skeleton.bones.find((b) => b.name === second);
	if (!upper || !lower || lower.parent !== first) throw new Error(`IK chain ${first}/${second} must be connected`);
	if ((lower.origin?.x ?? 0) !== 0 || (lower.origin?.y ?? 0) !== 0)
		throw new Error(`IK bone ${second} needs a zero origin`);
	const a = upper.length ?? 0,
		b = lower.length ?? 0;
	if (!(a > 0 && b > 0) || !Number.isFinite(a + b))
		throw new Error(`IK chain ${first}/${second} needs positive finite lengths`);
	if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || (bend !== 1 && bend !== -1))
		throw new Error(`invalid IK target or bend for ${first}/${second}`);
	const transforms = resolve(skeleton, pose);
	const base = transforms.find((bone) => bone.name === first);
	if (!base) throw new Error(`IK chain ${first}/${second} resolves no base`);
	const dx = target.x - base.x,
		dy = target.y - base.y;
	const distance = Math.hypot(dx, dy);
	if (distance > a + b + 1e-9 || distance < Math.abs(a - b) - 1e-9)
		throw new Error(`unreachable IK target for ${first}/${second}`);
	const elbow = bend * Math.acos(Math.max(-1, Math.min(1, (distance * distance - a * a - b * b) / (2 * a * b))));
	const shoulder = Math.atan2(dy, dx) - Math.atan2(b * Math.sin(elbow), a + b * Math.cos(elbow));
	const upperParent = upper.parent ? transforms.find((bone) => bone.name === upper.parent) : undefined;
	const parentAngle = upperParent ? upperParent.angle : 0;
	const result = {
		...pose,
		[first]: (shoulder * 180) / Math.PI - parentAngle - (upper.rotation ?? 0),
		[second]: (elbow * 180) / Math.PI - (lower.rotation ?? 0),
	};
	validatePose(skeleton, result);
	return result;
}
