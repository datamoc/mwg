import { Container, Graphics, TilingSprite } from 'pixi.js';

import type { Texture2D } from './Types2D.ts';

export interface BeamPoint {
	x: number;
	y: number;
}

export interface BeamOptions {
	/** plain-line colour; ignored with `texture`. Default white */
	colour?: number;
	/** repeating strip drawn instead of a plain line */
	texture?: Texture2D;
	/** seconds till `done`; default 0.2 */
	duration?: number;
	/** line width, or strip height with a texture; default 2 */
	width?: number;
	/** additive blend; default true, set false for a solid beam */
	additive?: boolean;
}

/**
 * A one-shot beam between two screen points: a fading line by default, a fading
 * repeating texture strip with `texture`. The sub-second ray flash - a zap, a laser,
 * a life-link - where `LightningArc` is the persistent jittered geometry and
 * `MultiTurnBeam` the multi-turn case.
 *
 * Fades from full to gone across `duration` and reports `done` exactly once, so a
 * group can remove it without a second clock. `retarget` moves either endpoint for
 * a beam tracking two moving points; z-order and parenting stay the caller's.
 *
 * @example
 * ```ts
 * import { Beam } from '@datamoc/mw_games/two-d/render';
 *
 * const zap = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, { colour: 0x88ccff, duration: 0.2 });
 * const expired = zap.update(0.25);
 * console.log(expired); // true - the instant it outlives its duration
 * zap.destroy();
 * ```
 */
export class Beam extends Container {
	private from: BeamPoint;
	private to: BeamPoint;
	private readonly colour: number;
	private readonly texture?: Texture2D;
	private readonly thickness: number;
	private readonly duration: number;
	private readonly body: Graphics | TilingSprite;

	private elapsed = 0;
	private expired = false;

	constructor(from: BeamPoint, to: BeamPoint, options: BeamOptions = {}) {
		super();
		this.from = { ...from };
		this.to = { ...to };
		this.colour = options.colour ?? 0xffffff;
		this.texture = options.texture;
		this.thickness = options.width ?? 2;
		this.duration = Math.max(1e-6, options.duration ?? 0.2);

		if (this.texture) {
			this.body = new TilingSprite({ texture: this.texture, width: 1, height: this.thickness });
		} else {
			this.body = new Graphics();
		}
		if (options.additive ?? true) this.body.blendMode = 'add';
		this.addChild(this.body);
		this.redraw();
	}

	/** 0 at launch, 1 at duration end */
	get progress(): number {
		return Math.min(1, this.elapsed / this.duration);
	}

	get done(): boolean {
		return this.expired;
	}

	/** moves either endpoint, for a beam tracking two points that are themselves moving */
	retarget(from?: BeamPoint, to?: BeamPoint): void {
		if (from) this.from = { ...from };
		if (to) this.to = { ...to };
		this.redraw();
	}

	/** @returns true the instant `duration` elapses, so a caller can remove the beam exactly once */
	update(dt: number): boolean {
		if (this.expired) return false;

		this.elapsed += dt;
		this.alpha = 1 - this.progress;
		if (this.elapsed >= this.duration) {
			this.expired = true;
			return true;
		}
		return false;
	}

	override destroy(): void {
		this.removeChild(this.body);
		this.body.destroy();
		super.destroy();
	}

	private redraw(): void {
		const dx = this.to.x - this.from.x;
		const dy = this.to.y - this.from.y;
		const length = Math.hypot(dx, dy);
		this.position.set(this.from.x, this.from.y);
		this.rotation = length > 0 ? Math.atan2(dy, dx) : 0;

		if (this.body instanceof TilingSprite) {
			this.body.width = length;
			this.body.height = this.thickness;
		} else {
			const line = this.body as Graphics;
			line.clear();
			line.moveTo(0, 0);
			line.lineTo(length, 0);
			line.stroke({ width: this.thickness, color: this.colour });
		}
	}
}

/**
 * Owns the beams a game has flashing: one `add` per ray, one `update(dt)` fading
 * them all and forgetting the finished ones, and no bookkeeping left to the caller.
 * Beams are parented here and destroyed with their beam; z-order stays the caller's.
 *
 * @example
 * ```ts
 * import { Beams } from '@datamoc/mw_games/two-d/render';
 * import type { Container2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const layer: Container2D;
 *
 * const beams = new Beams();
 * layer.addChild(beams);
 *
 * beams.add({ x: 0, y: 0 }, { x: 100, y: 0 }, { colour: 0x88ccff });
 * beams.update(1 / 60);
 * console.log(beams.count); // 1 - still fading
 * beams.clear();
 * ```
 */
export class Beams extends Container {
	private readonly live: Beam[] = [];

	/** flashes a beam between two points; it fades on `update` and removes itself at duration end */
	add(from: BeamPoint, to: BeamPoint, options?: BeamOptions): Beam {
		const beam = new Beam(from, to, options);
		this.addChild(beam);
		this.live.push(beam);
		return beam;
	}

	/** fades every live beam, then forgets and destroys the finished ones */
	update(dt: number): void {
		for (let i = this.live.length - 1; i >= 0; i--) {
			if (this.live[i].update(dt)) {
				const [beam] = this.live.splice(i, 1);
				this.removeChild(beam);
				beam.destroy();
			}
		}
	}

	/** how many beams are still fading */
	get count(): number {
		return this.live.length;
	}

	/** drops every live beam at once - a scene change, say */
	clear(): void {
		for (const beam of this.live.splice(0)) {
			this.removeChild(beam);
			beam.destroy();
		}
	}

	override destroy(): void {
		this.clear();
		super.destroy();
	}
}
