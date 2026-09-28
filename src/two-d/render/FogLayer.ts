import { Sprite, Texture } from 'pixi.js';

/** red, green, blue, alpha, each 0 to 255 */
export type FogColor = readonly [number, number, number, number];

/**
 * What a cell's fog state is: one state number for the whole cell, or `resolution *
 * resolution` of them (row-major) so a cell can be shaded in parts, the half-lit wall edge
 * of a classic roguelike.
 */
export type FogCell = number | ArrayLike<number>;

/**
 * Paints per-cell fog into an RGBA pixel buffer of `width * resolution` by `height *
 * resolution` pixels. Pure: no canvas involved, so the shading rule is checkable anywhere.
 * A state with no palette entry paints transparent.
 *
 * @example
 * ```ts
 * import { paintFogPixels } from '@datamoc/mw_games/two-d/render';
 *
 * const pixels = new Uint8ClampedArray(2 * 1 * 4);
 * paintFogPixels(pixels, 2, 1, 1, (x) => x, [[0, 0, 0, 0], [0, 0, 0, 255]]);
 * console.log(pixels[7]); // 255 - the second cell is fully fogged
 * ```
 */
export function paintFogPixels(
	pixels: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
	resolution: number,
	state: (x: number, y: number) => FogCell,
	palette: readonly FogColor[],
): void {
	const stride = width * resolution;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const cell = state(x, y);
			for (let row = 0; row < resolution; row++) {
				for (let column = 0; column < resolution; column++) {
					const value = typeof cell === 'number' ? cell : (cell[row * resolution + column] ?? 0);
					const color = palette[value] ?? [0, 0, 0, 0];
					pixels.set(color, ((y * resolution + row) * stride + x * resolution + column) * 4);
				}
			}
		}
	}
}

export interface FogLayerOptions {
	/** map size in tiles */
	width: number;
	height: number;
	/** tile size in world units; default 16 */
	tileSize?: number;
	/** fog pixels per tile along each axis; default 2 */
	resolution?: number;
	/** the RGBA colour of each state number */
	palette: readonly FogColor[];
}

/**
 * A smooth fog-of-war overlay: a small canvas with `resolution` pixels per tile, scaled up
 * with linear filtering, so fog edges blur into the next cell instead of stepping by whole
 * tiles. Draw it above terrain and characters, and call `refresh` when visibility changes.
 * Needs a DOM canvas; `paintFogPixels` is the same shading without one.
 *
 * @example
 * ```ts
 * import { FogLayer } from '@datamoc/mw_games/two-d/render';
 *
 * const fog = new FogLayer({
 *   width: 20,
 *   height: 20,
 *   palette: [[0, 0, 0, 0], [0, 0, 0, 150], [0, 0, 0, 255]], // seen, remembered, unknown
 * });
 * fog.refresh((x, y) => (x < 5 ? 0 : 2));
 * ```
 */
export class FogLayer extends Sprite {
	private readonly context: CanvasRenderingContext2D;
	private readonly image: ImageData;
	private readonly columns: number;
	private readonly rows: number;
	private readonly cellResolution: number;
	private palette: readonly FogColor[];

	constructor(options: FogLayerOptions) {
		const resolution = options.resolution ?? 2;
		const canvas = document.createElement('canvas');
		canvas.width = options.width * resolution;
		canvas.height = options.height * resolution;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('FogLayer needs a 2D canvas context');
		super(Texture.from(canvas));
		this.context = context;
		this.image = context.createImageData(canvas.width, canvas.height);
		this.columns = options.width;
		this.rows = options.height;
		this.cellResolution = resolution;
		this.palette = options.palette;
		this.texture.source.scaleMode = 'linear';
		this.scale.set((options.tileSize ?? 16) / resolution);
		this.eventMode = 'none';
	}

	/** swaps the palette, for a brightness setting; call `refresh` afterwards */
	setPalette(palette: readonly FogColor[]): void {
		this.palette = palette;
	}

	refresh(state: (x: number, y: number) => FogCell): void {
		paintFogPixels(this.image.data, this.columns, this.rows, this.cellResolution, state, this.palette);
		this.context.putImageData(this.image, 0, 0);
		this.texture.source.update();
	}

	/** the texture is generated for this layer alone, so it goes with it */
	override destroy(): void {
		super.destroy({ texture: true, textureSource: true });
	}
}
