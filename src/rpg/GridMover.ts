import { type MovableSprite, playMoverAnimation } from './MovableSprite.ts';

export type Direction4 = 'up' | 'down' | 'left' | 'right';

export interface GridMoverOptions {
	tileWidth: number;
	tileHeight: number;

	/** tiles crossed per second */
	speed?: number;

	/** an animation name to play while moving in this direction, if the sprite has one */
	walkAnimation?: (direction: Direction4) => string;

	/** an animation name to play while standing still facing this direction */
	idleAnimation?: (direction: Direction4) => string;
}

/**
 * Grid movement tweened between tiles, with a walk cycle - what turns "the player pressed
 * right" into a sprite that glides from one tile to the next and faces the way it is going,
 * rather than teleporting square to square.
 *
 * This owns position and animation only. Whether the target tile is passable, whether
 * something is standing on it, whether stepping onto it should trigger an event - all of
 * that is a question for the map, asked before `moveBy` is called.
 *
 * @example
 * ```ts
 * import { GridMover } from '@datamoc/mw_games/rpg';
 * import type { MovableSprite } from '@datamoc/mw_games/rpg';
 *
 * declare const heroSprite: MovableSprite;
 *
 * const mover = new GridMover(heroSprite, 5, 5, { tileWidth: 32, tileHeight: 32, speed: 4 });
 * mover.moveBy(1, 0); // a tile check already confirmed this is passable
 *
 * // in the game loop:
 * mover.update(1 / 60);
 * ```
 */
export class GridMover {
	x: number;
	y: number;
	facing: Direction4 = 'down';

	private sprite: MovableSprite;
	private tileWidth: number;
	private tileHeight: number;
	private speed: number;
	private options: GridMoverOptions;

	private fromX: number;
	private fromY: number;
	private target: { x: number; y: number } | null = null;
	private progress = 0;

	constructor(sprite: MovableSprite, x: number, y: number, options: GridMoverOptions) {
		this.sprite = sprite;
		this.x = this.fromX = x;
		this.y = this.fromY = y;
		this.tileWidth = options.tileWidth;
		this.tileHeight = options.tileHeight;
		this.speed = options.speed ?? 4;
		this.options = options;

		this.place();
		this.playIdle();
	}

	get isMoving(): boolean {
		return this.target !== null;
	}

	/**
	 * Faces a direction without moving - what a bump into a wall or an NPC turns into,
	 * rather than nothing at all. Without this, a player who arrives beside an NPC from the
	 * "wrong" side can never turn to face it, since an actual step that way is blocked and
	 * `moveBy` only ever faces the direction it successfully moves in.
	 */
	turnTo(dx: number, dy: number): void {
		if (this.target) return;
		this.facing = directionOf(dx, dy);
		this.playIdle();
	}

	/** starts moving one tile in the given direction; false when already moving */
	moveBy(dx: number, dy: number): boolean {
		if (this.target) return false;

		this.facing = directionOf(dx, dy);
		this.fromX = this.x;
		this.fromY = this.y;
		this.target = { x: this.x + dx, y: this.y + dy };
		this.progress = 0;
		this.playWalk();
		return true;
	}

	update(dt: number): void {
		this.sprite.update?.(dt);
		if (!this.target) return;

		this.progress = Math.min(1, this.progress + this.speed * dt);
		this.sprite.x = lerp(this.fromX, this.target.x, this.progress) * this.tileWidth;
		this.sprite.y = lerp(this.fromY, this.target.y, this.progress) * this.tileHeight;

		if (this.progress >= 1) {
			this.x = this.target.x;
			this.y = this.target.y;
			this.target = null;
			this.playIdle();
		}
	}

	private place(): void {
		this.sprite.x = this.x * this.tileWidth;
		this.sprite.y = this.y * this.tileHeight;
	}

	private playWalk(): void {
		playMoverAnimation(this.sprite, this.options.walkAnimation?.(this.facing));
	}

	private playIdle(): void {
		playMoverAnimation(this.sprite, this.options.idleAnimation?.(this.facing));
	}
}

function directionOf(dx: number, dy: number): Direction4 {
	if (dx > 0) return 'right';
	if (dx < 0) return 'left';
	return dy > 0 ? 'down' : 'up';
}

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t;
}
