import { type MovableSprite, playMoverAnimation } from './MovableSprite.ts';

export interface FreeMoverOptions {
	/** world units crossed per second */
	speed?: number;

	/**
	 * An animation to play while moving, given the current facing in radians (0 along +x,
	 * increasing clockwise in screen space). Bucketing that into however many directions a
	 * sprite sheet actually has (4, 8, whatever) is the game's own job - this stays
	 * unopinionated about how many facings exist, the same way `GridMover`'s callbacks are
	 * unopinionated about animation names.
	 */
	walkAnimation?: (facing: number) => string;

	/** an animation to play while standing still, given the current facing in radians */
	idleAnimation?: (facing: number) => string;
}

/**
 * Movement not snapped to any grid: a float position plus a continuous facing angle, for a
 * twin-stick shooter, a bullet-hell, or any top-down game whose player moves and aims freely
 * rather than stepping cell to cell. `rpg.GridMover` is the tile-to-tile counterpart to this;
 * both own position and animation only, nothing about collision or passability.
 *
 * @example
 * ```ts
 * import { FreeMover } from '@datamoc/mw_games/rpg';
 * import type { MovableSprite } from '@datamoc/mw_games/rpg';
 *
 * declare const heroSprite: MovableSprite;
 *
 * const mover = new FreeMover(heroSprite, 100, 100, { speed: 120 });
 *
 * // in the game loop, from a joystick or WASD:
 * mover.move(1, 0, 1 / 60); // unnormalized direction; FreeMover normalizes it
 * console.log(mover.facing); // radians, updated to face the movement direction
 * ```
 */
export class FreeMover {
	x: number;
	y: number;

	/** radians; unchanged while not moving, so a stopped unit keeps facing where it last went */
	facing = 0;

	private sprite: MovableSprite;
	private speed: number;
	private options: FreeMoverOptions;
	private moving = false;

	constructor(sprite: MovableSprite, x: number, y: number, options: FreeMoverOptions = {}) {
		this.sprite = sprite;
		this.x = x;
		this.y = y;
		this.speed = options.speed ?? 4;
		this.options = options;

		this.place();
		this.playIdle();
	}

	get isMoving(): boolean {
		return this.moving;
	}

	/**
	 * Moves this frame along `(dx, dy)`, which need not be normalized - only its direction
	 * and whether it is nonzero matter, so a caller can pass a raw stick reading straight
	 * through. `(0, 0)` stops the unit in place, facing whichever way it was last moving.
	 */
	move(dx: number, dy: number, dt: number): void {
		const length = Math.hypot(dx, dy);

		if (length > 0) {
			this.facing = Math.atan2(dy, dx);
			this.x += (dx / length) * this.speed * dt;
			this.y += (dy / length) * this.speed * dt;
			if (!this.moving) {
				this.moving = true;
				this.playWalk();
			}
		} else if (this.moving) {
			this.moving = false;
			this.playIdle();
		}

		this.place();
		this.sprite.update?.(dt);
	}

	/** faces a direction without moving, the free-movement equivalent of `GridMover.turnTo` */
	turnTo(dx: number, dy: number): void {
		if (this.moving || (dx === 0 && dy === 0)) return;
		this.facing = Math.atan2(dy, dx);
		this.playIdle();
	}

	private place(): void {
		this.sprite.x = this.x;
		this.sprite.y = this.y;
	}

	private playWalk(): void {
		playMoverAnimation(this.sprite, this.options.walkAnimation?.(this.facing));
	}

	private playIdle(): void {
		playMoverAnimation(this.sprite, this.options.idleAnimation?.(this.facing));
	}
}
