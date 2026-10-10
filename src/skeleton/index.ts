/**
 * Skeletal pose math, renderer-free: a bone tree, keyframed clips, and layered blending.
 *
 * The pose half of a skeletal puppet (roadmap 399), as pure data and arithmetic so it loads
 * headless and tests without a renderer - the same split every other module draws. A bone
 * is a name, a parent name, a length and a local rotation; a pose is one rotation per bone;
 * resolving a pose walks the tree so rotating an arm, a leg or a head is one number on one
 * bone and the rest of the body follows. Clips are keyframed poses over time - plain data a
 * game authors in JSON, never code, and never a borrowed game's animation data - with
 * interpolation, looping, a playback rate and a crossfade between clips. Additive layers
 * (aim on top of walk, hurt on top of idle) mix by priority, so a game composes motion
 * instead of authoring every combination as its own clip.
 *
 * @example
 * ```ts
 * import { Skeleton } from '@datamoc/mw_games/skeleton';
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
 * const arm = Skeleton.resolve(puppet, mixer)[1]; // world x, y and angle per bone
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
}

export interface SkeletonBones {
	bones: readonly Bone[];
}

/** one rotation per bone name, degrees; a bone left out keeps its rest rotation */
export type Pose = Readonly<Record<string, number>>;

export interface Keyframe {
	/** seconds into the clip */
	time: number;
	rotations: Pose;
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
	/** the bone's tip in world space, `length` along its angle */
	tipX: number;
	tipY: number;
}

/** names in dependency order: every bone after its parent, so resolution is one pass */
export function boneOrder(skeleton: SkeletonBones): string[] {
	const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
	const order: string[] = [];
	const placed = new Set<string>();
	const visit = (bone: Bone): void => {
		if (placed.has(bone.name)) return;
		if (bone.parent && !byName.has(bone.parent))
			throw new Error(`skeleton bone ${bone.name} names no parent ${bone.parent}`);
		if (bone.parent) visit(byName.get(bone.parent)!);
		if (!placed.has(bone.name)) {
			placed.add(bone.name);
			order.push(bone.name);
		}
	};
	for (const bone of skeleton.bones) visit(bone);
	return order;
}

/** create a skeleton, refusing duplicate names and cycles by name */
export function create(bones: readonly Bone[]): SkeletonBones {
	const names = new Set<string>();
	for (const bone of bones) {
		if (names.has(bone.name)) throw new Error(`duplicate skeleton bone ${bone.name}`);
		names.add(bone.name);
	}
	const order = boneOrder({ bones });
	//boneOrder throws on a missing parent, which is also what a cycle surfaces as here
	for (const bone of bones)
		if (bone.parent && order.indexOf(bone.parent) >= order.indexOf(bone.name))
			throw new Error(`skeleton bone ${bone.name} cannot precede its parent ${bone.parent}`);
	return { bones };
}

/**
 * A pose through the tree: each bone starts at its parent's tip plus its origin, rotated by
 * its rest rotation plus its pose rotation plus every ancestor's world rotation.
 */
export function resolve(skeleton: SkeletonBones, pose: Pose = {}): BoneTransform[] {
	const byName = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
	const world = new Map<string, BoneTransform>();
	for (const name of boneOrder(skeleton)) {
		const bone = byName.get(name)!;
		const parent = bone.parent ? world.get(bone.parent) : undefined;
		const rotation = (bone.rotation ?? 0) + (pose[name] ?? 0);
		const angle = parent ? parent.angle + rotation : rotation;
		const originX = bone.origin?.x ?? 0;
		const originY = bone.origin?.y ?? 0;
		const x = parent ? parent.tipX : 0;
		const y = parent ? parent.tipY : 0;
		const radians = (angle * Math.PI) / 180;
		world.set(name, {
			name,
			x,
			y,
			angle,
			tipX: x + originX + Math.cos(radians) * (bone.length ?? 0),
			tipY: y + originY + Math.sin(radians) * (bone.length ?? 0),
		});
	}
	return [...world.values()];
}

/** the pose a clip shows at `time`: its frames interpolated, looped or held */
export function samplePose(clip: Clip, time: number): Record<string, number> {
	const frames = clip.frames;
	if (frames.length === 0) return {};
	let clock = time;
	if (clip.loop && clip.duration > 0) {
		clock = clock % clip.duration;
		if (clock < 0) clock += clip.duration;
	} else if (clock >= clip.duration) {
		//a one-shot holds its last frame past the end
		return { ...frames[frames.length - 1].rotations };
	} else if (clock < 0) {
		return { ...frames[0].rotations };
	}
	let previous = frames[0];
	for (let index = 1; index < frames.length; index++) {
		if (frames[index].time > clock) {
			const span = frames[index].time - previous.time;
			const t = span > 0 ? (clock - previous.time) / span : 0;
			const pose: Record<string, number> = {};
			const names = new Set([...Object.keys(previous.rotations), ...Object.keys(frames[index].rotations)]);
			for (const name of names) {
				const from = previous.rotations[name] ?? 0;
				const to = frames[index].rotations[name] ?? 0;
				pose[name] = from + (to - from) * t;
			}
			return pose;
		}
		previous = frames[index];
	}
	return { ...previous.rotations };
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
	const mixed: Record<string, number> = { ...base };
	const sorted = [...layers].sort((a, b) => a.priority - b.priority);
	for (const layer of sorted) {
		const weight = Math.max(0, Math.min(1, layer.weight));
		if (weight === 0) continue;
		//a layer displaces only the bones it names: an unnamed bone keeps whatever
		//the layers beneath it decided, so 'aim' never resets the legs to rest
		for (const name of Object.keys(layer.pose)) {
			const from = mixed[name] ?? 0;
			const to = layer.pose[name];
			mixed[name] = from + (to - from) * weight;
		}
	}
	return mixed;
}

/**
 * One tick: advance every playback, sample the base (crossfaded when a fade is running),
 * layer the additive poses over it, and return the pose. Call `resolve` on the result when
 * the world transforms are what the drawing side needs.
 */
export function advance(mixer: Mixer, dt: number): Record<string, number> {
	mixer.base = advancePlayback(mixer.base, dt);
	for (const layer of mixer.layers) layer.playback = advancePlayback(layer.playback, dt);
	let pose = samplePose(mixer.base.clip, mixer.base.time);
	if (mixer.crossfade) {
		const fade = mixer.crossfade;
		fade.from = advancePlayback(fade.from, dt);
		fade.remaining = Math.max(0, fade.remaining - dt);
		const outgoing = samplePose(fade.from.clip, fade.from.time);
		const t = fade.duration > 0 ? 1 - fade.remaining / fade.duration : 1;
		const blended: Record<string, number> = {};
		for (const name of new Set([...Object.keys(outgoing), ...Object.keys(pose)]))
			blended[name] = (outgoing[name] ?? 0) * (1 - t) + (pose[name] ?? 0) * t;
		pose = blended;
		if (fade.remaining === 0) mixer.crossfade = undefined;
	}
	return mixPoses(
		pose,
		mixer.layers.map((layer) => ({
			pose: samplePose(layer.playback.clip, layer.playback.time),
			weight: layer.weight,
			priority: layer.priority,
		})),
	);
}
