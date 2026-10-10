import { Container } from 'pixi.js';
import {
	advance as advanceMixer,
	resolve,
	type BoneTransform,
	type Mixer,
	type Pose,
	type SkeletonBones,
} from '../../skeleton/index.ts';
import { TintedSprite } from './TintedSprite.ts';
import type { Texture2D } from './Types2D.ts';

/**
 * Bones driving drawn parts (roadmap 400), the drawing half of the `skeleton` module.
 *
 * A `SkeletalSprite` binds sprites or texture regions to bones by name; `update(dt)` advances
 * the mixer (or applies a pose a game resolved itself) and places each part at its bone's
 * world transform, so a character sheet, an SVG puppet split by groups or a mixed rig
 * animate through the same bone tree. Walk, swing and look cycles are clips; the binding is
 * the only rendering decision this side makes.
 *
 * An `ArticulatedChain` is the one articulated shape a keyframe cannot express: a long body
 * (a dragon's neck and tail, a serpent's spine) drawn as a chain of segments that follows
 * its head procedurally. Each segment eases toward its parent's previous position, with
 * per-segment rotation limits so the body bends like a body and not like a rope of beads.
 * This is deliberately not a clip - it is a follower rule, not authored motion - and
 * composes with one: a clip drives the head and limbs, the chain does the rest of the body.
 *
 * @example
 * ```ts
 * import { SkeletalSprite } from '@datamoc/mw_games/two-d/render';
 *
 * const rig = new SkeletalSprite(puppet, idleClip);
 * rig.bind('arm', armTexture).anchor.set(0, 0.5);
 * stage.addChild(rig);
 * rig.update(dt); // each part sits on its bone, every frame
 * ```
 */
export class SkeletalSprite extends Container {
	private readonly skeleton: SkeletonBones;
	private readonly parts = new Map<string, TintedSprite>();
	private readonly mixer: Mixer | undefined;

	constructor(skeleton: SkeletonBones, mixer?: Mixer) {
		super();
		this.skeleton = skeleton;
		this.mixer = mixer;
	}

	/** bind a drawn part to a bone by name; the sprite's own anchor decides how it hangs */
	bind(bone: string, texture: Texture2D): TintedSprite {
		const sprite = new TintedSprite(texture);
		this.parts.set(bone, sprite);
		this.addChild(sprite);
		return sprite;
	}

	/** the sprite bound to a bone, or undefined for an unbound one */
	part(bone: string): TintedSprite | undefined {
		return this.parts.get(bone);
	}

	/** apply a pose directly; `update` does this itself when a mixer was given */
	apply(pose: Pose): void {
		const transforms = new Map(resolve(this.skeleton, pose).map((bone: BoneTransform) => [bone.name, bone]));
		for (const [bone, sprite] of this.parts) {
			const transform = transforms.get(bone);
			if (!transform) throw new Error(`skeletal sprite binds no bone named ${bone}`);
			sprite.position.set(transform.x, transform.y);
			sprite.rotation = (transform.angle * Math.PI) / 180;
		}
	}

	/** advance the mixer and place every part; needs a mixer, refuses without one */
	update(_dt: number): void {
		if (!this.mixer) throw new Error('a skeletal sprite without a mixer needs apply(pose)');
		this.apply(advanceMixer(this.mixer, _dt));
	}
}

export interface ChainOptions {
	/** how many segments the body has */
	segments: number;
	/** how far each segment sits from the one before it */
	length: number;
	/** 0..1, how fast a segment eases toward its parent's previous position; defaults to 1 */
	stiffness?: number;
	/** degrees, the sharpest bend two consecutive segments may make; defaults to 90 */
	bendLimit?: number;
}

/**
 * A serpent's spine as pure positions: the head is pulled by the game, every segment eases
 * toward where its parent just was, and no two segments may bend past `bendLimit`. The
 * positions are the contract; drawing them is a `ChainRig`.
 */
export class ArticulatedChain {
	readonly points: Array<{ x: number; y: number }> = [];
	private readonly previous: Array<{ x: number; y: number }> = [];
	private readonly length: number;
	private readonly stiffness: number;
	private readonly bendLimit: number;

	constructor(options: ChainOptions) {
		if (options.segments < 2) throw new Error('an articulated chain needs at least two segments');
		if (options.length <= 0) throw new Error('an articulated chain needs a positive length');
		this.length = options.length;
		this.stiffness = Math.max(0, Math.min(1, options.stiffness ?? 1));
		this.bendLimit = (options.bendLimit ?? 90) * (Math.PI / 180);
		for (let index = 0; index < options.segments; index++) {
			this.points.push({ x: -index * options.length, y: 0 });
			this.previous.push({ x: -index * options.length, y: 0 });
		}
	}

	/** move the head; the body follows on the next `update` */
	pull(x: number, y: number): void {
		this.points[0].x = x;
		this.points[0].y = y;
	}

	/** one tick of the follower rule: ease toward the parent's previous position, then bend-limit */
	update(_dt: number): void {
		for (let index = 0; index < this.points.length; index++)
			this.previous[index] = { x: this.points[index].x, y: this.points[index].y };
		for (let index = 1; index < this.points.length; index++) {
			const parent = this.previous[index - 1];
			const segment = this.points[index];
			const dx = parent.x - segment.x;
			const dy = parent.y - segment.y;
			const distance = Math.hypot(dx, dy);
			if (distance > this.length) {
				const slack = distance > 0 ? (distance - this.length) / distance : 0;
				segment.x += dx * slack * this.stiffness;
				segment.y += dy * slack * this.stiffness;
			}
		}
		//rotation limits: each segment may bend no further than bendLimit from the
		//direction of the segment before it, so the body bends like a body
		for (let index = 2; index < this.points.length; index++) {
			const before = this.points[index - 2];
			const parent = this.points[index - 1];
			const segment = this.points[index];
			const base = Math.atan2(parent.y - before.y, parent.x - before.x);
			const bend = Math.atan2(segment.y - parent.y, segment.x - parent.x);
			let delta = bend - base;
			while (delta > Math.PI) delta -= 2 * Math.PI;
			while (delta < -Math.PI) delta += 2 * Math.PI;
			if (Math.abs(delta) <= this.bendLimit) continue;
			const clamped = base + Math.sign(delta) * this.bendLimit;
			segment.x = parent.x + Math.cos(clamped) * this.length;
			segment.y = parent.y + Math.sin(clamped) * this.length;
		}
	}
}

/**
 * The drawing half of a chain: one sprite per segment, placed on `update`. The chain is the
 * motion; this only positions what the game handed over.
 */
export class ChainRig extends Container {
	private readonly chain: ArticulatedChain;
	private readonly segments: TintedSprite[];

	constructor(chain: ArticulatedChain, textures: readonly Texture2D[]) {
		super();
		if (textures.length !== chain.points.length) throw new Error('a chain rig needs one texture per segment');
		this.chain = chain;
		this.segments = textures.map((texture) => {
			const sprite = new TintedSprite(texture);
			sprite.anchor.set(0, 0.5);
			this.addChild(sprite);
			return sprite;
		});
	}

	update(dt: number): void {
		this.chain.update(dt);
		for (let index = 0; index < this.segments.length; index++) {
			const point = this.chain.points[index];
			const next = this.chain.points[index + 1] ?? point;
			this.segments[index].position.set(point.x, point.y);
			this.segments[index].rotation = Math.atan2(next.y - point.y, next.x - point.x);
		}
	}
}
