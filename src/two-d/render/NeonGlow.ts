import { Sprite, Texture } from 'pixi.js';
import { clamp } from '../../core/Math.ts';
import { reducedMotion, type MotionIntent } from '../../core/Motion.ts';

/** split a hex colour number into 0..255 channels; throws a RangeError outside `0x000000`-`0xffffff` */
function splitColor(color: number): readonly [number, number, number] {
	if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
		throw new RangeError(`a glow needs an integer color between 0x000000 and 0xffffff, saw ${color}`);
	}
	return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

/**
 * How much light a soft glow still carries at `distance` from its centre: 1 at the
 * centre, easing to exactly 0 at `radius`, 0 past it. Pure, so a sign's falloff is
 * checkable as arithmetic: the middle of a tube is always brighter than its rim.
 *
 * @example
 * ```ts
 * import { glowFalloff } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(glowFalloff(0, 24)); // 1 - the centre burns full
 * console.log(glowFalloff(24, 24)); // 0 - the rim carries nothing
 * console.log(glowFalloff(48, 24)); // 0 - past the rim stays dark
 * ```
 */
export function glowFalloff(distance: number, radius: number): number {
	if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
		throw new RangeError(
			`a glow falloff needs a finite distance and a radius above 0, saw (${distance}, ${radius})`,
		);
	}
	if (distance <= 0) return 1;
	if (distance >= radius) return 0;
	const t = 1 - (distance / radius) * (distance / radius);
	return t * t;
}

export interface GlowPaint {
	/** glow colour as a hex number */
	color: number;
	/** light radius in pixels; must be above 0 */
	radius: number;
	/** peak strength, 0 (dark) to 1 (full); validated */
	intensity: number;
}

/**
 * Paint a `size * size` radial glow (the sprite is square, `size` is odd) into `pixels`
 * as RGBA bytes. Centre pixels carry the colour at full intensity, rim pixels fade to
 * transparent, and intensity scales every channel linearly, so doubling it doubles the
 * light. Pure, like `paintFogPixels`.
 *
 * @example
 * ```ts
 * import { paintGlowPixels } from '@datamoc/mw_games/two-d/render';
 *
 * const size = 5;
 * const pixels = new Uint8ClampedArray(size * size * 4);
 * paintGlowPixels(pixels, size, { color: 0xff0000, radius: 2, intensity: 1 });
 * console.log(pixels[0] > pixels[pixels.length - 4]); // true - the centre burns redder than the rim
 * ```
 */
export function paintGlowPixels(pixels: Uint8ClampedArray | Uint8Array, size: number, paint: GlowPaint): void {
	if (!Number.isInteger(size) || size < 1) {
		throw new RangeError(`a glow needs an integer size of at least 1, saw ${size}`);
	}
	if (!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== size * size * 4) {
		throw new RangeError(`a glow needs a pixel buffer of ${size * size * 4} bytes`);
	}
	if (!Number.isFinite(paint.radius) || paint.radius <= 0) {
		throw new RangeError(`a glow needs a radius above 0, saw ${paint.radius}`);
	}
	if (!Number.isFinite(paint.intensity) || paint.intensity < 0 || paint.intensity > 1) {
		throw new RangeError(`a glow needs intensity between 0 and 1, saw ${paint.intensity}`);
	}
	const [r, g, b] = splitColor(paint.color);
	const centre = (size - 1) / 2;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const light = glowFalloff(Math.hypot(x - centre, y - centre), paint.radius) * paint.intensity;
			pixels.set(
				[Math.round(r * light), Math.round(g * light), Math.round(b * light), Math.round(255 * light)],
				(y * size + x) * 4,
			);
		}
	}
}

export interface NeonGlowOptions {
	/** glow colour as a hex number */
	color: number;
	/** light radius in world pixels; must be above 0 */
	radius: number;
	/** peak strength, 0 to 1; default 1 */
	intensity?: number;
	/** slow breathing of the light; default none (a steady sign) */
	flicker?: { amount: number; frequency: number };
	/** what the flicker is for under reduced motion; default `decorative`, which holds the light steady */
	intent?: MotionIntent;
}

/**
 * A soft neon glow from a shape or mask: a radial sprite drawn additively, the overlay
 * `Halo` already provides, with colour, radius, intensity and flicker (roadmap 426). A
 * global bloom stays out on purpose: one sprite per sign is cheaper, composes with
 * z-order like any other sprite, and never washes the whole scene. Mask a glow by
 * parenting it under the shape it lights, or leave it bare for a free halo around a sign.
 * Needs a DOM canvas; `paintGlowPixels` is the same falloff without one.
 *
 * @example
 * ```ts
 * import { NeonGlow } from '@datamoc/mw_games/two-d/render';
 *
 * const sign = new NeonGlow({ color: 0x37e0ff, radius: 48, flicker: { amount: 0.15, frequency: 2 } });
 * sign.position.set(200, 120);
 * sign.update(1 / 60); // the tube breathes; under reduced motion it holds steady instead
 * ```
 */
export class NeonGlow extends Sprite {
	private canvas: HTMLCanvasElement;
	private color: number;
	private radius: number;
	private peak: number;
	private readonly flickerAmount: number;
	private readonly flickerFrequency: number;
	private readonly intent: MotionIntent;
	private clock = 0;

	constructor(options: NeonGlowOptions) {
		if (!Number.isFinite(options.radius) || options.radius <= 0) {
			throw new RangeError(`a glow needs a radius above 0, saw ${options.radius}`);
		}
		const intensity = options.intensity ?? 1;
		if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
			throw new RangeError(`a glow needs intensity between 0 and 1, saw ${intensity}`);
		}
		const flicker = options.flicker ?? { amount: 0, frequency: 1 };
		if (!Number.isFinite(flicker.amount) || flicker.amount < 0 || flicker.amount > 1) {
			throw new RangeError(`a glow needs a flicker amount between 0 and 1, saw ${flicker.amount}`);
		}
		if (!Number.isFinite(flicker.frequency) || flicker.frequency <= 0) {
			throw new RangeError(`a glow needs a flicker frequency above 0, saw ${flicker.frequency}`);
		}
		//paintCanvas validates the colour through paintGlowPixels before super() runs
		const canvas = NeonGlow.paintCanvas(options.color, options.radius);
		super(Texture.from(canvas));
		this.canvas = canvas;
		this.color = options.color;
		this.radius = options.radius;
		this.peak = intensity;
		this.flickerAmount = flicker.amount;
		this.flickerFrequency = flicker.frequency;
		this.intent = options.intent ?? 'decorative';
		//additive like Halo: light adds, never covers
		this.blendMode = 'add';
		this.anchor.set(0.5);
		this.eventMode = 'none';
		this.alpha = this.peak;
	}

	/** seconds of flicker accumulated so far */
	get elapsed(): number {
		return this.clock;
	}

	/** swap the colour; repaints once */
	setColor(color: number): void {
		splitColor(color);
		this.color = color;
		this.repaint();
	}

	/** swap the radius; repaints once */
	setRadius(radius: number): void {
		if (!Number.isFinite(radius) || radius <= 0) {
			throw new RangeError(`a glow needs a radius above 0, saw ${radius}`);
		}
		this.radius = radius;
		this.repaint();
	}

	/** swap the peak strength; applies on the next `update` without a repaint */
	setIntensity(intensity: number): void {
		if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
			throw new RangeError(`a glow needs intensity between 0 and 1, saw ${intensity}`);
		}
		this.peak = intensity;
	}

	/** advance the flicker; under reduced motion a decorative glow holds its peak instead */
	update(dt: number): void {
		if (!Number.isFinite(dt) || dt < 0) {
			throw new RangeError(`a glow update needs dt of at least 0, saw ${dt}`);
		}
		if (!reducedMotion() || this.intent !== 'decorative') this.clock += dt;
		const wave = 1 + this.flickerAmount * Math.sin(2 * Math.PI * this.flickerFrequency * this.clock);
		this.alpha = clamp(this.peak * wave, 0, 1);
	}

	private static paintCanvas(color: number, radius: number): HTMLCanvasElement {
		const size = Math.ceil(radius) * 2 + 1;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('NeonGlow needs a 2D canvas context');
		const image = context.createImageData(size, size);
		paintGlowPixels(image.data, size, { color, radius, intensity: 1 });
		context.putImageData(image, 0, 0);
		return canvas;
	}

	private repaint(): void {
		//a radius change resizes the canvas, so the texture is rebuilt rather than updated
		const old = this.texture;
		this.canvas = NeonGlow.paintCanvas(this.color, this.radius);
		this.texture = Texture.from(this.canvas);
		old.destroy(true);
	}

	/** the texture is generated for this glow alone, so it goes with it */
	override destroy(): void {
		super.destroy({ texture: true, textureSource: true });
	}
}
