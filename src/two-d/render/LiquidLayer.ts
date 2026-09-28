import { Container, Sprite, TilingSprite } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';

export interface LiquidLayerOptions {
	/** the repeating liquid surface texture */
	texture: Texture2D;
	/** map size in tiles */
	width: number;
	height: number;
	/** tile size in world units; default 16 */
	tileSize?: number;
	/** which cells hold liquid */
	isLiquid: (x: number, y: number) => boolean;
	/** texture pixels scrolled per second, downwards when positive; default 5 */
	speed?: number;
	/** the sprite an expanding ripple draws; without one `ripple` does nothing */
	rippleTexture?: Texture2D;
	/** seconds a ripple takes to grow and fade; default 0.5 */
	rippleDuration?: number;
}

/**
 * An animated liquid surface under a tile map: one scrolling tiling quad per liquid cell,
 * so each cell can carry its own visibility tint (`setCellColor`, the same idea as
 * `TileMap.setCellColor`) without showing liquid in cells the player has not seen. `ripple`
 * spawns a ring that grows and fades on a cell. Drive it with `update(dt)` each frame.
 *
 * Every child opts out of pointer events: a decorative layer must never swallow the taps
 * meant for the map beneath it.
 *
 * @example
 * ```ts
 * import { Texture } from 'pixi.js';
 * import { LiquidLayer } from '@datamoc/mw_games/two-d/render';
 *
 * const water = new LiquidLayer({
 *   texture: Texture.EMPTY,
 *   width: 8,
 *   height: 8,
 *   isLiquid: (x, y) => y > 5,
 * });
 * water.setCellColor(3, 6, 0xffffff); // lit; a tint of 0 hides the cell
 * water.update(1 / 60);
 * ```
 */
export class LiquidLayer extends Container {
	private readonly cells = new Map<number, TilingSprite>();
	private readonly ripples: { sprite: Sprite; age: number }[] = [];
	private readonly columns: number;
	private readonly tileSize: number;
	private readonly speed: number;
	private readonly rippleTexture?: Texture2D;
	private readonly rippleDuration: number;
	private offset = 0;

	constructor(options: LiquidLayerOptions) {
		super();
		this.eventMode = 'none';
		this.columns = options.width;
		this.tileSize = options.tileSize ?? 16;
		this.speed = options.speed ?? 5;
		this.rippleTexture = options.rippleTexture;
		this.rippleDuration = options.rippleDuration ?? 0.5;
		for (let y = 0; y < options.height; y++) {
			for (let x = 0; x < options.width; x++) {
				if (!options.isLiquid(x, y)) continue;
				const tile = new TilingSprite({
					texture: options.texture,
					width: this.tileSize,
					height: this.tileSize,
				});
				tile.eventMode = 'none';
				tile.position.set(x * this.tileSize, y * this.tileSize);
				//the texture is anchored to the map, not the cell, so neighbours line up
				tile.tilePosition.set(-tile.x, -tile.y);
				tile.visible = false;
				this.cells.set(x + y * this.columns, tile);
				this.addChild(tile);
			}
		}
	}

	/** tints one cell; a tint of 0 hides it, and cells start hidden until lit */
	setCellColor(x: number, y: number, tint: number): void {
		const tile = this.cells.get(x + y * this.columns);
		if (!tile) return;
		tile.tint = tint;
		tile.visible = tint !== 0;
	}

	/** starts a ripple on a visible liquid cell */
	ripple(x: number, y: number): void {
		if (!this.rippleTexture || !this.cells.get(x + y * this.columns)?.visible) return;
		const sprite = new Sprite(this.rippleTexture);
		sprite.eventMode = 'none';
		sprite.anchor.set(0.5);
		sprite.position.set((x + 0.5) * this.tileSize, (y + 0.5) * this.tileSize);
		sprite.scale.set(0);
		this.addChild(sprite);
		this.ripples.push({ sprite, age: 0 });
	}

	/** how many ripples are still growing */
	get rippleCount(): number {
		return this.ripples.length;
	}

	update(dt: number): void {
		this.offset += this.speed * dt;
		for (const tile of this.cells.values()) {
			if (tile.visible) tile.tilePosition.y = -tile.y + this.offset;
		}
		for (let i = this.ripples.length - 1; i >= 0; i--) {
			const ripple = this.ripples[i];
			ripple.age += dt;
			if (ripple.age >= this.rippleDuration) {
				ripple.sprite.destroy();
				this.ripples.splice(i, 1);
			} else {
				const progress = ripple.age / this.rippleDuration;
				ripple.sprite.scale.set(progress);
				ripple.sprite.alpha = 1 - progress;
			}
		}
	}
}
