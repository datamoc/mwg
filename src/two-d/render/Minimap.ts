import { Container, Graphics, RenderTexture, Sprite } from 'pixi.js';
import { Game } from '../Game.ts';
import { hexToPixel } from '../../core/Hex.ts';

/** the cell indices in `explored` not yet baked into a minimap's texture - pure, so it can
 * be tested without a renderer
 *
 * @example
 * ```ts
 * import { newlyRevealed } from '@datamoc/mw_games/two-d/render';
 *
 * const explored = new Set([4, 9, 12]);
 * const alreadyDrawn = new Set([4]);
 *
 * console.log(newlyRevealed(explored, alreadyDrawn)); // [9, 12]
 * ```
 */
export function newlyRevealed(explored: ReadonlySet<number>, alreadyDrawn: ReadonlySet<number>): number[] {
	const result: number[] = [];
	for (const index of explored) {
		if (!alreadyDrawn.has(index)) result.push(index);
	}
	return result;
}

export interface MinimapOptions {
	/** the level's own width, in cells - needed to turn a cell index back into x/y */
	widthInCells: number;
	heightInCells: number;

	/** screen pixels per cell; defaults to 2, small enough for an always-on-screen corner HUD */
	cellSize?: number;
	/** cell topology; hex uses the same flat-top odd-q projection as `TileMap` */
	shape?: 'square' | 'hex';
}

/**
 * The minimap centre for a cell, useful for overlays that must share its topology.
 *
 * @example
 * ```ts
 * import { minimapCellCenter } from '@datamoc/mw_games/two-d/render';
 * const centre = minimapCellCenter(3, 2, 4, 'hex');
 * ```
 */
export function minimapCellCenter(
	x: number,
	y: number,
	cellSize: number,
	shape: 'square' | 'hex' = 'square',
): { x: number; y: number } {
	return shape === 'hex'
		? hexToPixel(x, y, cellSize, cellSize)
		: { x: (x + 0.5) * cellSize, y: (y + 0.5) * cellSize };
}

/**
 * A downscaled picture of a level, built from exactly the data `roguelike.FieldOfView`
 * already tracks - `explored`, distinct from `visible` - plus a per-cell colour a game
 * supplies, since `mwg` has no opinion on what a wall or a floor should look like.
 *
 * The same widget serves both sizes a map screen comes in: a small corner HUD element at a
 * coarse `cellSize`, or a full, `Window`-sized pause-and-look screen at a larger one -
 * nothing here is specific to either. Quest markers or a tracked-quest location (see
 * `rpg.QuestLog.markerFor`/`trackedLocation`) are a game's own overlay on top of `world`,
 * same as they would be over any other rendered view.
 *
 * Revealed cells are painted once into a persistent `RenderTexture` and never revisited -
 * `sync` only rasterises what `newlyRevealed` reports as new, rather than redrawing the
 * whole map from scratch on every call, which is the one open engineering question this
 * item named: how an explored-cell set becomes a small texture without becoming a
 * per-frame cost that grows with how much of the level has been seen.
 *
 * @example
 * ```ts
 * import { Minimap } from '@datamoc/mw_games/two-d/render';
 *
 * const minimap = new Minimap({ widthInCells: 40, heightInCells: 24, cellSize: 2 });
 *
 * const explored = new Set([0, 1, 40]);
 * minimap.sync(explored, (x, y) => ((x + y) % 2 === 0 ? 0x3a3a2a : 0x2f5a2f));
 * minimap.setMarker(0, 0, Math.PI / 2); // the hero, facing down
 *
 * console.log(minimap.exploredCount); // 3
 * ```
 */
export class Minimap extends Container {
	private readonly widthInCells: number;
	private readonly cellSize: number;
	private readonly shape: 'square' | 'hex';

	private renderTexture: RenderTexture;
	private sprite: Sprite;
	private drawn = new Set<number>();

	private marker = new Graphics();

	constructor(options: MinimapOptions) {
		super();

		this.widthInCells = options.widthInCells;
		this.cellSize = options.cellSize ?? 2;
		this.shape = options.shape ?? 'square';

		this.renderTexture = RenderTexture.create({
			width:
				this.shape === 'hex'
					? Math.ceil((options.widthInCells - 1) * this.cellSize * 0.75 + this.cellSize)
					: options.widthInCells * this.cellSize,
			height:
				this.shape === 'hex'
					? options.heightInCells * this.cellSize + this.cellSize / 2
					: options.heightInCells * this.cellSize,
		});
		this.sprite = new Sprite(this.renderTexture);
		this.addChild(this.sprite);
		this.addChild(this.marker);
	}

	/** cells revealed since the last call, by width/height already given to the constructor */
	get exploredCount(): number {
		return this.drawn.size;
	}

	/**
	 * Bakes every cell in `explored` that has not been drawn yet, at whatever colour
	 * `colorFor` reports for it. A cell already baked is never revisited even if `colorFor`
	 * would now answer differently - explored terrain does not usually change colour, and a
	 * game that wants it to can `reset()` and resync from a clean texture.
	 */
	sync(explored: ReadonlySet<number>, colorFor: (x: number, y: number) => number): void {
		const cells = newlyRevealed(explored, this.drawn);
		if (cells.length === 0) return;

		const patch = new Graphics();
		for (const index of cells) {
			this.drawn.add(index);
			const x = index % this.widthInCells;
			const y = Math.floor(index / this.widthInCells);
			const center = minimapCellCenter(x, y, this.cellSize, this.shape);
			if (this.shape === 'hex') {
				const radius = this.cellSize / 2;
				const points: number[] = [];
				for (let corner = 0; corner < 6; corner++) {
					const angle = (Math.PI / 3) * corner;
					points.push(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
				}
				patch.poly(points).fill({ color: colorFor(x, y) });
			} else {
				patch
					.rect(center.x - this.cellSize / 2, center.y - this.cellSize / 2, this.cellSize, this.cellSize)
					.fill({ color: colorFor(x, y) });
			}
		}

		Game.current.app.renderer.render({ container: patch, target: this.renderTexture, clear: false });
		patch.destroy();
	}

	/** positions a marker at a cell, optionally pointing it in a facing direction (radians) */
	setMarker(x: number, y: number, facing?: number, color = 0xffffff): void {
		this.marker.clear();
		this.marker.circle(0, 0, Math.max(1, this.cellSize)).fill({ color });

		if (facing !== undefined) {
			const length = this.cellSize * 2;
			this.marker
				.moveTo(0, 0)
				.lineTo(Math.cos(facing) * length, Math.sin(facing) * length)
				.stroke({ color, width: 1 });
		}

		const center = minimapCellCenter(x, y, this.cellSize, this.shape);
		this.marker.x = center.x;
		this.marker.y = center.y;
	}

	/** forgets everything baked, so the next `sync` repaints from a clean texture - a fresh floor */
	reset(): void {
		this.drawn.clear();
		Game.current.app.renderer.render({ container: new Container(), target: this.renderTexture, clear: true });
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		this.renderTexture.destroy(true);
		super.destroy(options);
	}
}
