import { Sprite, Texture } from 'pixi.js';
import { reducedMotion, type MotionIntent } from '../../core/Motion.ts';

/** the default breeze, in field cells per second, behind a bare `time` with no layer drift */
const BREEZE_X = 0.35;
const BREEZE_Y = 0.12;

function lattice(ix: number, iy: number, seed: number): number {
	const hash = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
	return hash - Math.floor(hash);
}

function octave(x: number, y: number, seed: number): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const top = lattice(x0, y0, seed) + (lattice(x0 + 1, y0, seed) - lattice(x0, y0, seed)) * sx;
	const bottom = lattice(x0, y0 + 1, seed) + (lattice(x0 + 1, y0 + 1, seed) - lattice(x0, y0 + 1, seed)) * sx;
	return Math.min(1, Math.max(0, top + (bottom - top) * sy));
}

/**
 * A deterministic wisp field in 0..1: two octaves of value noise over an integer lattice,
 * smoothstep-interpolated so neighbouring samples always blend rather than step. Pure and
 * seed-stable within a run: the same `(x, y, time, seed)` paints the same wisp, which is
 * what makes haze testable as arithmetic instead of eyeballed as weather. Time wanders
 * the lookup along a slow breeze, so a still coordinate still breathes.
 *
 * @example
 * ```ts
 * import { hazeField } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(hazeField(3, 5, 1.5, 7) === hazeField(3, 5, 1.5, 7)); // true - same sky twice
 * console.log(hazeField(3, 5, 1.5, 7) >= 0 && hazeField(3, 5, 1.5, 7) <= 1); // true - always a density
 * ```
 */
export function hazeField(x: number, y: number, time: number, seed: number): number {
	if (![x, y, time, seed].every(Number.isFinite)) {
		throw new RangeError(`a haze sample needs finite x, y, time and seed, saw (${x}, ${y}, ${time}, ${seed})`);
	}
	const driftedX = x + time * BREEZE_X;
	const driftedY = y + time * BREEZE_Y;
	return (
		octave(driftedX / 8, driftedY / 8, seed) * 0.65 + octave(driftedX / 3 + 11, driftedY / 3 + 7, seed + 1) * 0.35
	);
}

export interface HazePaint {
	/** seconds of drift; validated finite */
	time: number;
	/** how much sky the haze covers, 0 (clear) to 1 (pea soup) */
	density: number;
	/** which sky; validated finite */
	seed: number;
	/** the layer's own wind in cells per second, added to the breeze; default `{ x: 0, y: 0 }` */
	drift?: { x: number; y: number };
}

/**
 * Paint a white haze sheet with per-pixel alpha into `pixels` (`width * height` RGBA).
 * The layer tints the sprite itself, so one buffer serves any colour. Pure, like
 * `paintFogPixels`: density 0 paints fully transparent, and raising the density never
 * thins a pixel that was already covered.
 *
 * @example
 * ```ts
 * import { paintHazePixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray(4 * 2 * 4);
 * paintHazePixels(pixels, 4, 2, { time: 0, density: 1, seed: 3 });
 * console.log(pixels.some((v, i) => i % 4 === 3 && v > 0)); // true - full density always shows some haze
 * ```
 */
export function paintHazePixels(
	pixels: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
	paint: HazePaint,
): void {
	if (
		!(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) ||
		pixels.length !== width * height * 4
	) {
		throw new RangeError(`haze needs a pixel buffer of ${width * height * 4} bytes`);
	}
	if (!Number.isFinite(paint.time) || !Number.isFinite(paint.seed)) {
		throw new RangeError(`haze needs a finite time and seed, saw (${paint.time}, ${paint.seed})`);
	}
	if (!Number.isFinite(paint.density) || paint.density < 0 || paint.density > 1) {
		throw new RangeError(`haze needs density between 0 and 1, saw ${paint.density}`);
	}
	const drift = paint.drift ?? { x: 0, y: 0 };
	if (!Number.isFinite(drift.x) || !Number.isFinite(drift.y)) {
		throw new RangeError(`haze needs a finite drift, saw (${drift.x}, ${drift.y})`);
	}
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const alpha = Math.round(
				255 *
					paint.density *
					hazeField(x + drift.x * paint.time, y + drift.y * paint.time, paint.time, paint.seed),
			);
			pixels.set([255, 255, 255, alpha], (y * width + x) * 4);
		}
	}
}

export interface HazeLayerOptions {
	/** sheet size in world units */
	width: number;
	/** sheet size in world units */
	height: number;
	/** canvas pixels across; default 64 (a small canvas scaled up keeps edges soft and cheap) */
	cellsX?: number;
	/** canvas pixels down; default 36 */
	cellsY?: number;
	/** how much sky the haze covers, 0 to 1; default 0.5 */
	density?: number;
	/** haze colour as a hex number; default white */
	tint?: number;
	/** sheet opacity; default 1 */
	opacity?: number;
	/** the sheet's own wind in cells per second, added to the breeze; default a slow sideways breathe */
	drift?: { x: number; y: number };
	/** which sky; default 1 */
	seed?: number;
	/** what the drift is for under reduced motion; default `decorative`, which holds the sky still */
	intent?: MotionIntent;
}

/**
 * An atmospheric haze sheet: translucent weather and mood with soft edges, drift and
 * density, on the GPU path (roadmap 425). Distinct from `FogLayer`, which is fog of war:
 * this never hides gameplay, it only colours the air. The canvas stays small and scales
 * up with linear filtering, so one refresh costs O(cells) and edges stay soft at any
 * size. Stack several planes with different densities, drifts, tints and scales for depth.
 * Needs a DOM canvas; `paintHazePixels` is the same shading without one.
 *
 * @example
 * ```ts
 * import { HazeLayer } from '@datamoc/mw_games/two-d/render';
 *
 * const far = new HazeLayer({ width: 400, height: 225, density: 0.3, tint: 0x9db8d6, drift: { x: 0.1, y: 0 } });
 * const near = new HazeLayer({ width: 400, height: 225, density: 0.5, tint: 0xcfd8e6, drift: { x: 0.4, y: 0.05 } });
 * far.update(1 / 60); // each plane drifts at its own pace, which reads as depth
 * near.update(1 / 60);
 * ```
 */
export class HazeLayer extends Sprite {
	private readonly context: CanvasRenderingContext2D;
	private readonly image: ImageData;
	private readonly cellsX: number;
	private readonly cellsY: number;
	private readonly drift: { x: number; y: number };
	private readonly seed: number;
	private readonly intent: MotionIntent;
	private density: number;
	private time = 0;

	constructor(options: HazeLayerOptions) {
		if (!Number.isFinite(options.width) || options.width <= 0) {
			throw new RangeError(`a haze sheet needs width above 0, saw ${options.width}`);
		}
		if (!Number.isFinite(options.height) || options.height <= 0) {
			throw new RangeError(`a haze sheet needs height above 0, saw ${options.height}`);
		}
		const cellsX = options.cellsX ?? 64;
		const cellsY = options.cellsY ?? 36;
		if (!Number.isInteger(cellsX) || cellsX < 1) {
			throw new RangeError(`a haze sheet needs integer cellsX of at least 1, saw ${cellsX}`);
		}
		if (!Number.isInteger(cellsY) || cellsY < 1) {
			throw new RangeError(`a haze sheet needs integer cellsY of at least 1, saw ${cellsY}`);
		}
		const density = options.density ?? 0.5;
		if (!Number.isFinite(density) || density < 0 || density > 1) {
			throw new RangeError(`a haze sheet needs density between 0 and 1, saw ${density}`);
		}
		const drift = options.drift ?? { x: 0.25, y: 0 };
		if (!Number.isFinite(drift.x) || !Number.isFinite(drift.y)) {
			throw new RangeError(`a haze sheet needs a finite drift, saw (${drift.x}, ${drift.y})`);
		}
		if (options.seed !== undefined && !Number.isFinite(options.seed)) {
			throw new RangeError(`a haze sheet needs a finite seed, saw ${options.seed}`);
		}
		const canvas = document.createElement('canvas');
		canvas.width = cellsX;
		canvas.height = cellsY;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('HazeLayer needs a 2D canvas context');
		super(Texture.from(canvas));
		this.context = context;
		this.image = context.createImageData(cellsX, cellsY);
		this.cellsX = cellsX;
		this.cellsY = cellsY;
		this.density = density;
		this.drift = { ...drift };
		this.seed = options.seed ?? 1;
		this.intent = options.intent ?? 'decorative';
		this.tint = options.tint ?? 0xffffff;
		this.alpha = options.opacity ?? 1;
		this.scale.set(options.width / cellsX, options.height / cellsY);
		this.eventMode = 'none';
		this.refresh();
	}

	/** seconds of drift accumulated so far */
	get elapsed(): number {
		return this.time;
	}

	/** swap the coverage; takes effect on the next `update` */
	setDensity(density: number): void {
		if (!Number.isFinite(density) || density < 0 || density > 1) {
			throw new RangeError(`a haze sheet needs density between 0 and 1, saw ${density}`);
		}
		this.density = density;
	}

	/** advance the drift and repaint; under reduced motion a decorative sheet holds still */
	update(dt: number): void {
		if (!Number.isFinite(dt) || dt < 0) {
			throw new RangeError(`a haze update needs dt of at least 0, saw ${dt}`);
		}
		if (!reducedMotion() || this.intent !== 'decorative') this.time += dt;
		this.refresh();
	}

	private refresh(): void {
		paintHazePixels(this.image.data, this.cellsX, this.cellsY, {
			time: this.time,
			density: this.density,
			seed: this.seed,
			drift: this.drift,
		});
		this.context.putImageData(this.image, 0, 0);
		this.texture.source.update();
	}

	/** the texture is generated for this sheet alone, so it goes with it */
	override destroy(): void {
		super.destroy({ texture: true, textureSource: true });
	}
}
