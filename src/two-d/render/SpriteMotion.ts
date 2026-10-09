import { Easing, Tweener } from '../../core/Tween.ts';
import { reducedMotion, type MotionIntent } from '../../core/Motion.ts';

/** any object with a display transform; a Pixi `Sprite` or `Container`, or a plain double in a test */
export interface MotionTarget {
	x: number;
	y: number;
	rotation: number;
	scale: { x: number; y: number };
	skew: { x: number; y: number };
}

export interface SpriteMotionOptions {
	/** share a `Tweener` with other features, driven by its owner; by default this owns one, driven by `update(dt)` */
	tweener?: Tweener;

	/** what the effects are for under reduced motion; defaults to `decorative`, which collapses them */
	intent?: MotionIntent;
}

/** what a running effect gives back: await `done`, or `cancel()` to restore its share of the transform at once */
export interface MotionHandle {
	readonly done: Promise<void>;
	cancel(): void;
}

//one effect's share of the final transform; multipliers rest at 1, offsets at 0
interface Contribution {
	scaleX: number;
	scaleY: number;
	dy: number;
	rotation: number;
	skewX: number;
}

const NONE: Contribution = { scaleX: 1, scaleY: 1, dy: 0, rotation: 0, skewX: 0 };

const INERT: MotionHandle = { done: Promise.resolve(), cancel() {} };

/**
 * Squash, hop, bob, wobble, spin, shear and flip over a display object's transform, each
 * running through a `Tweener` so reduced motion is honoured once, here, instead of by every
 * game's own `scale`/`Math.sin` write.
 *
 * The object's transform at construction is its rest pose. Every running effect keeps its own
 * contribution and the transform is recomputed from the rest pose and all contributions, so
 * effects compose (a hop with a squash) and never accumulate drift: when one ends, is
 * cancelled, or the whole motion is destroyed, its share simply disappears. Rotation and
 * shear turn about the object's origin, so give a sprite a centred anchor (or pivot) first.
 * Sequence effects behind a game event by awaiting a handle's `done`.
 *
 * Which effect plays on which event, and how much, is the game's business; this only moves.
 *
 * @example
 * ```ts
 * import { SpriteMotion } from '@datamoc/mw_games/two-d/render';
 *
 * const rat = { x: 0, y: 0, rotation: 0, scale: { x: 1, y: 1 }, skew: { x: 0, y: 0 } };
 * const motion = new SpriteMotion(rat);
 *
 * motion.hop({ height: 6, duration: 0.3 }); // up and back down
 * motion.squash({ amount: 0.2, duration: 0.3 }); // composes with the hop
 * motion.flip('x'); // face the other way, composes with both
 * motion.update(1 / 60); // in the game loop
 *
 * motion.destroy(); // back to the rest pose, flip included
 * ```
 */
export class SpriteMotion {
	private readonly target: MotionTarget;
	private readonly tweener: Tweener;
	private readonly ownsTweener: boolean;
	private readonly intent: MotionIntent;
	private readonly rest: { y: number; rotation: number; scaleX: number; scaleY: number; skewX: number };

	private readonly contributions = new Map<number, Contribution>();
	private readonly loops = new Set<(dt: number) => void>();
	private nextId = 0;
	private flipX = false;
	private flipY = false;
	private destroyed = false;

	constructor(target: MotionTarget, options: SpriteMotionOptions = {}) {
		this.target = target;
		this.tweener = options.tweener ?? new Tweener();
		this.ownsTweener = options.tweener === undefined;
		this.intent = options.intent ?? 'decorative';
		this.rest = {
			y: target.y,
			rotation: target.rotation,
			scaleX: target.scale.x,
			scaleY: target.scale.y,
			skewX: target.skew.x,
		};
	}

	/** scale x and y in opposition and back: `amount` 0.2 is 20% wider and 20% shorter at the peak */
	squash(options: { amount: number; duration: number }): MotionHandle {
		const { amount, duration } = options;
		return this.run(duration, (t) => {
			const s = Math.sin(Math.PI * t) * amount;
			return { scaleX: 1 + s, scaleY: 1 - s };
		});
	}

	/** up `height` world units and back down (the rest pose is the ground) */
	hop(options: { height: number; duration: number }): MotionHandle {
		const { height, duration } = options;
		return this.run(duration, (t) => ({ dy: -Math.sin(Math.PI * t) * height }));
	}

	/**
	 * A sinusoidal vertical offset of `amplitude`. With `cycles` it plays that many periods and
	 * ends; without, it loops until cancelled (breathing, a floating item). Under reduced motion
	 * a looping bob holds still.
	 */
	bob(options: { amplitude: number; period: number; cycles?: number }): MotionHandle {
		const { amplitude, period, cycles } = options;
		if (cycles !== undefined) {
			return this.run(period * cycles, (t) => ({ dy: Math.sin(2 * Math.PI * cycles * t) * amplitude }));
		}
		return this.loop((elapsed) => ({ dy: Math.sin((2 * Math.PI * elapsed) / period) * amplitude }));
	}

	/** swings `angle` radians either side and settles, a jiggle that dies away */
	wobble(options: { angle: number; duration: number }): MotionHandle {
		const { angle, duration } = options;
		return this.run(duration, (t) => ({ rotation: Math.sin(4 * Math.PI * t) * (1 - t) * angle }));
	}

	/** `turns` full turns about the origin, eased, ending exactly where it started */
	spin(options: { turns: number; duration: number }): MotionHandle {
		const { turns, duration } = options;
		return this.run(duration, (t) => ({ rotation: Math.PI * 2 * turns * t }), Easing.easeInOutQuad);
	}

	/** leans by `amount` radians of skew and back, a hit-recoil or a lean into a step */
	shear(options: { amount: number; duration: number }): MotionHandle {
		const { amount, duration } = options;
		return this.run(duration, (t) => ({ skewX: Math.sin(Math.PI * t) * amount }));
	}

	/**
	 * Mirrors along `axis` ('x' turns left to right). A state, not an animation: it composes
	 * with whatever is running and is undone by `destroy`. Pass `mirrored` to set it outright
	 * rather than toggle; returns the new state.
	 */
	flip(axis: 'x' | 'y', mirrored?: boolean): boolean {
		if (axis === 'x') this.flipX = mirrored ?? !this.flipX;
		else this.flipY = mirrored ?? !this.flipY;
		this.write();
		return axis === 'x' ? this.flipX : this.flipY;
	}

	/** advances the effects; call from the game loop (the tweener part is skipped for a shared one) */
	update(dt: number): void {
		if (this.ownsTweener) this.tweener.update(dt);
		for (const advance of [...this.loops]) advance(dt);
	}

	/** true while any effect is still running */
	get isBusy(): boolean {
		return this.contributions.size > 0;
	}

	/** cancels every effect and puts the object back in its rest pose, flips included */
	destroy(): void {
		this.destroyed = true;
		this.contributions.clear();
		this.loops.clear();
		this.flipX = this.flipY = false;
		this.write();
	}

	private run(
		duration: number,
		shape: (t: number) => Partial<Contribution>,
		ease: (t: number) => number = Easing.linear,
	): MotionHandle {
		if (this.destroyed) return INERT;
		const id = this.nextId++;
		const finish = () => {
			this.contributions.delete(id);
			this.write();
		};
		this.contributions.set(id, NONE);
		const done = this.tweener
			.tween(
				duration,
				(t) => {
					//a cancelled effect's tween still ticks to its end; it must not write again
					if (!this.contributions.has(id)) return;
					this.contributions.set(id, { ...NONE, ...shape(t) });
					this.write();
				},
				{ ease, intent: this.intent },
			)
			.then(finish);
		return { done, cancel: finish };
	}

	private loop(shape: (elapsed: number) => Partial<Contribution>): MotionHandle {
		if (this.destroyed) return INERT;
		const id = this.nextId++;
		let elapsed = 0;
		let resolve!: () => void;
		const done = new Promise<void>((r) => (resolve = r));
		const advance = (dt: number) => {
			elapsed += dt;
			//a decorative loop has no reason to move once the preference is on
			const held = reducedMotion() && this.intent === 'decorative';
			this.contributions.set(id, held ? NONE : { ...NONE, ...shape(elapsed) });
			this.write();
		};
		this.contributions.set(id, NONE);
		this.loops.add(advance);
		return {
			done,
			cancel: () => {
				this.loops.delete(advance);
				this.contributions.delete(id);
				this.write();
				resolve();
			},
		};
	}

	private write(): void {
		let scaleX = 1;
		let scaleY = 1;
		let dy = 0;
		let rotation = 0;
		let skewX = 0;
		for (const c of this.contributions.values()) {
			scaleX *= c.scaleX;
			scaleY *= c.scaleY;
			dy += c.dy;
			rotation += c.rotation;
			skewX += c.skewX;
		}
		const { rest, target } = this;
		target.y = rest.y + dy;
		target.rotation = rest.rotation + rotation;
		target.scale.x = rest.scaleX * scaleX * (this.flipX ? -1 : 1);
		target.scale.y = rest.scaleY * scaleY * (this.flipY ? -1 : 1);
		target.skew.x = rest.skewX + skewX;
	}
}
