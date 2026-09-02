export interface ProjectilePoint {
	x: number;
	y: number;
}

export interface ProjectileOptions {
	/** world units per second; ignored if `duration` is given */
	speed?: number;

	/** seconds to cross the whole flight; overrides `speed` when both are given */
	duration?: number;
}

/**
 * Tweens a sprite's position in a straight line, world units to world units.
 *
 * This owns position only, the same division `GridMover` draws for tile movement: whether
 * the shot lands, what it does on arrival, whether it should even be fired - all of that is
 * the caller's business, decided (with `mwg/roguelike`'s targeting helpers, typically)
 * before a `Projectile` is ever created. What is here is just "this point moves to that
 * point over time", because a thrown potion and a wand bolt both need exactly that and
 * nothing about the game's own arithmetic.
 */
export class Projectile {
	private sprite: ProjectilePoint;
	private fromX: number;
	private fromY: number;
	private toX: number;
	private toY: number;
	private duration: number;
	private elapsed = 0;
	private arrived = false;

	constructor(sprite: ProjectilePoint, from: ProjectilePoint, to: ProjectilePoint, options: ProjectileOptions = {}) {
		this.sprite = sprite;
		this.fromX = from.x;
		this.fromY = from.y;
		this.toX = to.x;
		this.toY = to.y;

		const distance = Math.hypot(to.x - from.x, to.y - from.y);
		this.duration = options.duration ?? distance / (options.speed ?? 400);
		//a zero-length flight (fired at your own feet) still resolves in one update
		if (this.duration <= 0) this.duration = 1e-6;

		sprite.x = from.x;
		sprite.y = from.y;
	}

	get done(): boolean {
		return this.arrived;
	}

	/** 0 at launch, 1 on arrival */
	get progress(): number {
		return Math.min(1, this.elapsed / this.duration);
	}

	/** @returns true the instant it arrives, so a caller can trigger impact exactly once */
	update(dt: number): boolean {
		if (this.arrived) return false;

		this.elapsed += dt;
		const t = this.progress;
		this.sprite.x = this.fromX + (this.toX - this.fromX) * t;
		this.sprite.y = this.fromY + (this.toY - this.fromY) * t;

		if (t >= 1) {
			this.arrived = true;
			return true;
		}
		return false;
	}
}
