import { Texture } from 'pixi.js';
import { Node2D, Sprite2D } from './Shape2D.ts';
import type { Texture2D } from './Types2D.ts';
import type { TerrainPlacement } from './TerrainGraphics.ts';
import { texture } from '../../assets/loader.ts';

export interface TerrainGraphicsLayerOptions {
	/** the placements `resolveTerrainGraphics` produced, or any list of the same shape */
	readonly placements: readonly TerrainPlacement[];

	/**
	 * Where a placement lands, in pixels: its anchor cell (`x`, `y`) plus the rule image's own
	 * offset (`dx`, `dy`), both in the unit the rules were authored in. A square or isometric grid
	 * projects the sum of the two; a hex grid, whose offsets are axial, projects the cell and the
	 * offset separately - which is why the layer is handed the whole placement rather than only a
	 * cell, and why the projection belongs to the caller.
	 */
	readonly project: (x: number, y: number, dx: number, dy: number) => { x: number; y: number };

	/** how an image path becomes a texture; defaults to the asset resolver with a `Texture.EMPTY` fallback */
	readonly resolveImage?: (path: string) => Texture2D;
}

/**
 * Draws the placements `resolveTerrainGraphics` resolves - the renderer half of `[terrain_graphics]`
 * that the rule pass deliberately leaves to a caller.
 *
 * It is one `Sprite2D` per placement, added in `layer` order (a stable sort, so placements sharing a
 * layer keep the order the rule pass emitted, which is its row-major walk). That is what makes a
 * rule's multi-cell art *one rule's images at their own offsets* rather than something `TileMap`'s
 * one-sprite-per-cell grid would have to hold, and what lets a rotated or probabilistic rule vary
 * how a transition looks without the layer knowing any of that.
 *
 * Z-order between this layer and the rest of a scene is the caller's, as it is for `Halo`: add the
 * layer before a unit to sit terrain under it, or after to overlay.
 *
 * @example
 * ```ts
 * import { TerrainGraphicsLayer, resolveTerrainGraphics } from '@datamoc/mw_games/two-d/render';
 *
 * const placements = resolveTerrainGraphics(2, 1, [], () => new Set(['land']));
 * const layer = new TerrainGraphicsLayer({
 * 	placements,
 * 	project: (x, y, dx, dy) => ({ x: (x + dx) * 32, y: (y + dy) * 32 }),
 * });
 * layer.setPlacements(placements);
 * ```
 */
export class TerrainGraphicsLayer extends Node2D {
	private placements: readonly TerrainPlacement[];
	private readonly project: TerrainGraphicsLayerOptions['project'];
	private readonly resolveImage: (path: string) => Texture2D;

	constructor(options: TerrainGraphicsLayerOptions) {
		super();
		this.placements = options.placements;
		this.project = options.project;
		this.resolveImage = options.resolveImage ?? ((path) => texture(path, Texture.EMPTY));
		this.rebuild();
	}

	/** replaces the resolved placements and redraws them in layer order */
	setPlacements(placements: readonly TerrainPlacement[]): void {
		this.placements = placements;
		this.rebuild();
	}

	private rebuild(): void {
		for (const child of this.removeChildren()) child.destroy();

		for (const placement of [...this.placements].sort((a, b) => a.layer - b.layer)) {
			const at = this.project(placement.x, placement.y, placement.dx, placement.dy);
			const sprite = new Sprite2D(this.resolveImage(placement.image));
			sprite.x = at.x;
			sprite.y = at.y;
			this.addChild(sprite);
		}
	}
}
