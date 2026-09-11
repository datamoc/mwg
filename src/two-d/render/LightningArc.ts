export interface LightningArcPoint {
	x: number;
	y: number;
}

export interface LightningArcOptions {
	/** seconds this arc lives before `done` becomes true; omit for a bolt with no lifetime of its own */
	duration?: number;

	/** how many jittered points along the line, between the two fixed endpoints; default 6 */
	segments?: number;

	/** perpendicular jitter amplitude in world units, tapering to 0 at both endpoints; default 12 */
	jitter?: number;

	/** seconds between re-rolling the jitter, so a held tether flickers; omit to jitter once and hold */
	flickerInterval?: number;

	/** injectable RNG (0 to 1) for a reproducible bolt shape; defaults to `Math.random` */
	random?: () => number;
}

/**
 * The position data for a jagged line between two points - a lightning bolt, a tether, a chain
 * lightning link - the temporised two-point visual `two-d/render` had no helper for. Owns
 * geometry only, the same division `Projectile` draws for a single moving point: this decides
 * where the line's points are, a caller draws them (through `Shape2D`'s `Graphics`, typically,
 * one `lineTo` per point) and decides colour, width and blend mode.
 *
 * @example
 * ```ts
 * import { LightningArc } from '@datamoc/mw_games/two-d/render';
 *
 * const bolt = new LightningArc({ x: 0, y: 0 }, { x: 100, y: 0 }, { duration: 0.2, segments: 4 });
 * console.log(bolt.points.length); // 6 - both endpoints plus 4 interior points
 *
 * const expired = bolt.update(0.25);
 * console.log(expired); // true - the instant it outlives its duration
 * ```
 */
export class LightningArc {
	private from: LightningArcPoint;
	private to: LightningArcPoint;
	private readonly segments: number;
	private readonly jitter: number;
	private readonly flickerInterval?: number;
	private readonly random: () => number;
	private readonly duration?: number;

	private elapsed = 0;
	private sinceFlicker = 0;
	private expired = false;
	private current: LightningArcPoint[] = [];

	constructor(from: LightningArcPoint, to: LightningArcPoint, options: LightningArcOptions = {}) {
		this.from = { ...from };
		this.to = { ...to };
		this.segments = Math.max(0, Math.floor(options.segments ?? 6));
		this.jitter = options.jitter ?? 12;
		this.flickerInterval = options.flickerInterval;
		this.random = options.random ?? Math.random;
		this.duration = options.duration;
		this.reroll();
	}

	/** the endpoints plus every jittered interior point, in order from `from` to `to` */
	get points(): readonly LightningArcPoint[] {
		return this.current;
	}

	get done(): boolean {
		return this.expired;
	}

	/** moves either endpoint, for a tether following two units that are themselves moving */
	retarget(from?: LightningArcPoint, to?: LightningArcPoint): void {
		if (from) this.from = { ...from };
		if (to) this.to = { ...to };
		if (this.flickerInterval === undefined) this.reroll();
	}

	/** @returns true the instant `duration` elapses, so a caller can remove the arc exactly once */
	update(dt: number): boolean {
		if (this.expired) return false;

		this.elapsed += dt;
		if (this.flickerInterval !== undefined) {
			this.sinceFlicker += dt;
			if (this.sinceFlicker >= this.flickerInterval) {
				this.sinceFlicker = 0;
				this.reroll();
			}
		}

		if (this.duration !== undefined && this.elapsed >= this.duration) {
			this.expired = true;
			return true;
		}
		return false;
	}

	private reroll(): void {
		const dx = this.to.x - this.from.x;
		const dy = this.to.y - this.from.y;
		const length = Math.hypot(dx, dy);
		//a perpendicular unit vector; a zero-length arc (from === to) has none, so jitter is 0
		const nx = length > 0 ? -dy / length : 0;
		const ny = length > 0 ? dx / length : 0;

		const points: LightningArcPoint[] = [{ ...this.from }];
		const steps = this.segments + 1;
		for (let i = 1; i < steps; i += 1) {
			const t = i / steps;
			//tapers to 0 at both ends (t=0 and t=1), so a bolt does not visibly detach from its target
			const taper = Math.sin(Math.PI * t);
			const offset = (this.random() * 2 - 1) * this.jitter * taper;
			points.push({
				x: this.from.x + dx * t + nx * offset,
				y: this.from.y + dy * t + ny * offset,
			});
		}
		points.push({ ...this.to });
		this.current = points;
	}
}
