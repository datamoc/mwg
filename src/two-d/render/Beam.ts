import { Container, Graphics, Sprite, TilingSprite, Texture } from 'pixi.js';

import type { Texture2D } from './Types2D.ts';

export interface BeamPoint {
	x: number;
	y: number;
}

export interface BeamTextureOptions {
	/** the strip's texture */
	source: Texture2D;
	/**
	 * Stretch the texture once along the whole span instead of tiling it - a ray
	 * whose art IS the beam, `scale.x = length / texture.width` - for art that
	 * repeats badly. Default false: the strip tiles, as the bare-texture form
	 * always has.
	 */
	stretch?: boolean;
	/**
	 * Where the strip sits across the beam's thickness: 0 keeps its top edge on
	 * the line, 0.5 centres it (the default here), 1 hangs it below. The
	 * bare-texture form keeps its own old top-edge placement.
	 */
	anchor?: number;
}

export interface BeamOptions {
	/** plain-line colour; ignored with `texture`. Default white */
	colour?: number;
	/**
	 * Repeating strip drawn instead of a plain line. The object form adds
	 * {@link BeamTextureOptions.stretch} and {@link BeamTextureOptions.anchor};
	 * a bare texture tiles exactly as it always has.
	 */
	texture?: Texture2D | BeamTextureOptions;
	/** seconds till `done`; default 0.2 */
	duration?: number;
	/** line width, or strip height with a texture; default 2 */
	width?: number;
	/**
	 * The beam narrows with its own remaining life - `thickness * (1 - progress)`
	 * - the way its alpha fades, so it thins to nothing instead of keeping its
	 * full width through the whole fade. Default false: only the alpha decays.
	 */
	thin?: boolean;
	/** additive blend; default true, set false for a solid beam */
	additive?: boolean;
}

/**
 * A one-shot beam between two screen points: a fading line by default, a fading
 * texture strip with `texture` - tiled, or stretched once along the span in the
 * object form, with `thin` narrowing the body as it fades (see `BeamOptions`).
 * The sub-second ray flash - a zap, a laser, a life-link - where `LightningArc`
 * is the persistent jittered geometry and `MultiTurnBeam` the multi-turn case.
 *
 * Fades from full to gone across `duration` and reports `done` exactly once, so a
 * group can remove it without a second clock. `retarget` moves either endpoint for
 * a beam tracking two moving points; z-order and parenting stay the caller's.
 *
 * @example
 * ```ts
 * import { Beam } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const rayTexture: Texture2D;
 *
 * const zap = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, { colour: 0x88ccff, duration: 0.2, thin: true });
 * const ray = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, {
 * 	texture: { source: rayTexture, stretch: true },
 * 	width: 8,
 * 	thin: true,
 * 	duration: 0.3,
 * });
 * const expired = zap.update(0.25);
 * console.log(expired); // true - the instant it outlives its duration
 * zap.destroy();
 * ray.destroy();
 * ```
 */
export class Beam extends Container {
	private from: BeamPoint;
	private to: BeamPoint;
	private readonly colour: number;
	private readonly texture?: Texture2D;
	private readonly stretch: boolean;
	private readonly textureAnchor: number;
	private readonly thickness: number;
	private readonly thin: boolean;
	private readonly duration: number;
	private readonly body: Graphics | TilingSprite | Sprite;

	private elapsed = 0;
	private expired = false;

	/** 1 at launch, `1 - progress` once fading; the thickness multiplier `thin` applies */
	private lifeFraction = 1;

	constructor(from: BeamPoint, to: BeamPoint, options: BeamOptions = {}) {
		super();
		this.from = { ...from };
		this.to = { ...to };
		this.colour = options.colour ?? 0xffffff;
		this.thin = options.thin ?? false;

		const shape = options.texture;
		if (shape === undefined) {
			this.texture = undefined;
			this.stretch = false;
			this.textureAnchor = 0;
		} else if (shape instanceof Texture) {
			this.texture = shape;
			this.stretch = false;
			this.textureAnchor = 0;
		} else {
			this.texture = shape.source;
			this.stretch = shape.stretch ?? false;
			this.textureAnchor = shape.anchor ?? 0.5;
		}

		this.thickness = options.width ?? 2;
		this.duration = Math.max(1e-6, options.duration ?? 0.2);

		if (this.texture && this.stretch) {
			this.body = new Sprite(this.texture);
			(this.body as Sprite).anchor.set(0, this.textureAnchor);
		} else if (this.texture) {
			const strip = new TilingSprite({ texture: this.texture, width: 1, height: this.thickness });
			strip.anchor.set(0, this.textureAnchor);
			this.body = strip;
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
		//thinning shares the fade's own clock: the beam narrows as it goes, which
		//means re-deriving the body every update, the same repaint a hand-rolled
		//fading line was paying anyway
		this.lifeFraction = this.thin ? 1 - this.progress : 1;
		if (this.thin) this.redraw();
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
			this.body.height = this.thickness * this.lifeFraction;
		} else if (this.body instanceof Sprite) {
			//stretched: the one art asset spans the whole beam, so its own pixel size
			//is the scale to undo, and the anchor option is what keeps it centred
			const texWidth = this.texture?.width || 1;
			const texHeight = this.texture?.height || 1;
			this.body.scale.x = length / texWidth;
			this.body.scale.y = (this.thickness / texHeight) * this.lifeFraction;
		} else {
			const line = this.body as Graphics;
			line.clear();
			line.moveTo(0, 0);
			line.lineTo(length, 0);
			line.stroke({ width: this.thickness * this.lifeFraction, color: this.colour });
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
