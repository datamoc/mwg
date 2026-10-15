import { reducedMotion, type MotionIntent } from '../../core/Motion.ts';

/**
 * A damped chase spring for secondary motion: one bob pulled toward a moving anchor,
 * the spring-damper complement to `SpriteMotion` (roadmap 424). Hair, hems, accessories
 * and interface panels follow their anchor with lag, overshoot on a stop and settle;
 * the anchor teleports (a head bone, a pointer, a panel edge) and the dynamics supply
 * the lag, so reacting to an acceleration, a stop or an impact is one `setAnchor` call.
 *
 * Renderer-free arithmetic: semi-implicit Euler, no randomness, no engine, deterministic
 * for a fixed `update(dt)` sequence. One update is O(1), about a dozen flops, which is
 * the frame budget stated rather than hoped for.
 *
 * @example
 * ```ts
 * import { Spring } from '@datamoc/mw_games/physics';
 *
 * const hair = new Spring({ stiffness: 120, damping: 8 });
 * hair.setAnchor(10, 0); // the head moved; the bob is still behind
 * hair.update(1 / 60);
 * console.log(hair.offset().x > 0); // true - the bob lags behind the anchor
 * for (let i = 0; i < 240; i++) hair.update(1 / 60);
 * console.log(hair.settled(0.01)); // true - a damped spring comes to rest at its anchor
 * ```
 */
export interface SpringOptions {
	/** pull per unit of displacement, per second squared; must be finite and above 0 */
	stiffness: number;
	/** velocity lost per unit of velocity, per second; must be finite and at least 0 */
	damping: number;
	/** where the anchor starts; default `{ x: 0, y: 0 }` */
	anchor?: { x: number; y: number };
	/** where the bob starts; default at the anchor, at rest */
	position?: { x: number; y: number };
	/** what the lag is for under reduced motion; default `decorative`, which snaps to the anchor */
	intent?: MotionIntent;
}

function assertPoint(value: { x: number; y: number }, name: string): { x: number; y: number } {
	if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
		throw new RangeError(`a spring ${name} needs finite coordinates, saw (${value.x}, ${value.y})`);
	}
	return { x: value.x, y: value.y };
}

export class Spring {
	readonly stiffness: number;
	readonly damping: number;
	private readonly intent: MotionIntent;
	private readonly anchor: { x: number; y: number };
	private readonly bob: { x: number; y: number };
	private readonly velocity: { x: number; y: number };

	constructor(options: SpringOptions) {
		if (!Number.isFinite(options.stiffness) || options.stiffness <= 0) {
			throw new RangeError(`a spring needs stiffness above 0, saw ${options.stiffness}`);
		}
		if (!Number.isFinite(options.damping) || options.damping < 0) {
			throw new RangeError(`a spring needs damping of at least 0, saw ${options.damping}`);
		}
		this.stiffness = options.stiffness;
		this.damping = options.damping;
		this.intent = options.intent ?? 'decorative';
		const anchor = options.anchor ? assertPoint(options.anchor, 'anchor') : { x: 0, y: 0 };
		const start = options.position ? assertPoint(options.position, 'position') : { ...anchor };
		this.anchor = anchor;
		this.bob = start;
		this.velocity = { x: 0, y: 0 };
	}

	/** where the anchor currently stands */
	get anchorPosition(): { x: number; y: number } {
		return { ...this.anchor };
	}

	/** where the bob currently stands */
	get position(): { x: number; y: number } {
		return { ...this.bob };
	}

	/** move the anchor; the bob follows through the dynamics, which is the whole effect */
	setAnchor(x: number, y: number): void {
		const pair = assertPoint({ x, y }, 'anchor');
		this.anchor.x = pair.x;
		this.anchor.y = pair.y;
	}

	/** shove the bob by a delta without touching its velocity: an impact, a pluck, a shove */
	displace(dx: number, dy: number): void {
		const pair = assertPoint({ x: dx, y: dy }, 'displacement');
		this.bob.x += pair.x;
		this.bob.y += pair.y;
	}

	/** put the bob at the anchor with no velocity */
	snap(): void {
		this.bob.x = this.anchor.x;
		this.bob.y = this.anchor.y;
		this.velocity.x = 0;
		this.velocity.y = 0;
	}

	/** the bob minus the anchor: the lag a follower draws */
	offset(): { x: number; y: number } {
		return { x: this.bob.x - this.anchor.x, y: this.bob.y - this.anchor.y };
	}

	/** how far the bob currently lags behind the anchor */
	length(): number {
		return Math.hypot(this.bob.x - this.anchor.x, this.bob.y - this.anchor.y);
	}

	/** true once the lag and the velocity both fit inside `tolerance` */
	settled(tolerance: number): boolean {
		if (!Number.isFinite(tolerance) || tolerance < 0) {
			throw new RangeError(`a spring settle check needs tolerance of at least 0, saw ${tolerance}`);
		}
		return this.length() <= tolerance && Math.hypot(this.velocity.x, this.velocity.y) <= tolerance;
	}

	/** put a display object where the bob stands; a `SpriteMotion` target qualifies */
	place(target: { x: number; y: number }): void {
		target.x = this.bob.x;
		target.y = this.bob.y;
	}

	/**
	 * Advance the bob by `dt` seconds. Under reduced motion a decorative spring snaps to
	 * its anchor instead of swinging, the same collapse `SpriteMotion` applies. Keep `dt`
	 * small (a `FixedStepper` at 60 Hz): past roughly two radians of natural frequency per
	 * step, semi-implicit Euler blows up instead of settling. A zero `dt` holds still; a
	 * negative or non-finite one throws a RangeError.
	 */
	update(dt: number): void {
		if (!Number.isFinite(dt) || dt < 0) {
			throw new RangeError(`a spring update needs dt of at least 0, saw ${dt}`);
		}
		if (reducedMotion() && this.intent === 'decorative') {
			this.snap();
			return;
		}
		if (dt === 0) return;
		const ax = this.stiffness * (this.anchor.x - this.bob.x) - this.damping * this.velocity.x;
		const ay = this.stiffness * (this.anchor.y - this.bob.y) - this.damping * this.velocity.y;
		this.velocity.x += ax * dt;
		this.velocity.y += ay * dt;
		this.bob.x += this.velocity.x * dt;
		this.bob.y += this.velocity.y * dt;
	}
}
