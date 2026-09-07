import { Container, Sprite } from 'pixi.js';
import * as Random from '../../core/Random.ts';
import type { Texture2D } from './Types2D.ts';

/**
 * One live particle. Exposed as plain readable state rather than hidden inside the emitter,
 * because that is what makes the simulation testable without a renderer at all: an emitter
 * given no `texture` runs the whole physics step and draws nothing, so a test drives
 * `update(dt)` and reads positions directly, the same split `Level` and `TileMap` already
 * draw between what a thing *is* and how it is drawn.
 */
export interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;

	/** seconds since birth */
	age: number;

	/** seconds this particle lives for */
	life: number;

	rotation: number;
	spin: number;

	/** current interpolated values, recomputed every step from the emitter's ranges */
	scale: number;
	alpha: number;

	/** false for a pooled particle waiting to be reused */
	active: boolean;
}

/** a `[min, max]` range picked per particle; a bare number means that value exactly */
export type ParticleRange = number | readonly [number, number];

export interface ParticleEmitterOptions {
	/** drawn per particle; omit for a pure simulation that renders nothing (tests, headless) */
	texture?: Texture2D;

	/** how many particles can live at once. The pool is allocated once at this size and never grows */
	max?: number;

	/** particles emitted per second while `start()`ed; 0 makes the emitter burst-only */
	rate?: number;

	/** seconds a particle lives */
	life?: ParticleRange;

	/** initial speed, world units per second */
	speed?: ParticleRange;

	/** emission direction in radians; the default sprays in every direction */
	angle?: ParticleRange;

	/** constant acceleration, world units per second squared - the default falls nowhere */
	gravity?: { x: number; y: number };

	/** scale at birth and at death, interpolated across a particle's life */
	scale?: readonly [number, number];

	/** alpha at birth and at death */
	alpha?: readonly [number, number];

	/** rotation change in radians per second */
	spin?: ParticleRange;

	/** multiplied into every particle sprite; ignored without a `texture` */
	tint?: number;
}

function pick(range: ParticleRange): number {
	return typeof range === 'number' ? range : Random.float(range[0], range[1]);
}

/**
 * A pooled particle emitter: sparks off a sword hit, dust under a footstep, rain over a map.
 *
 * Pooled rather than allocating per particle, because this is the one primitive in the
 * framework that can be asked to create and discard thousands of short-lived things per
 * second, and a garbage collector pause is exactly the frame-time cost this project's own
 * performance priority cares about. The pool is allocated once at `max` and reused forever
 * after; asking for more particles than that while `max` are already alive drops the request
 * rather than growing, so a runaway emitter degrades visibly instead of eating memory.
 *
 * Every random draw goes through `mwg/core`'s seeded `Random`, so a replayed or
 * seeded run produces the same spray, rather than particles being the one thing on screen
 * that a deterministic replay cannot reproduce.
 *
 * @example
 * ```ts
 * import { ParticleEmitter, type Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const sparkTexture: Texture2D;
 *
 * const sparks = new ParticleEmitter({
 * 	texture: sparkTexture,
 * 	max: 64,
 * 	life: [0.2, 0.4],
 * 	speed: [80, 160],
 * 	gravity: { x: 0, y: 300 },
 * 	scale: [1, 0.2],
 * 	alpha: [1, 0],
 * });
 * sparks.x = 100;
 * sparks.y = 60;
 *
 * sparks.burst(12); // a sword hit: 12 particles at once, fewer if the pool is nearly full
 * sparks.update(1 / 60); // steps physics and, since a texture was given, the sprites too
 * console.log(sparks.activeCount); // 12 - still alive right after the burst
 * ```
 */
export class ParticleEmitter extends Container {
	private readonly pool: Particle[] = [];
	private readonly sprites: Sprite[] = [];

	private readonly rate: number;
	private readonly life: ParticleRange;
	private readonly speed: ParticleRange;
	private readonly angleRange: ParticleRange;
	private readonly gravityX: number;
	private readonly gravityY: number;
	private readonly scaleRange: readonly [number, number];
	private readonly alphaRange: readonly [number, number];
	private readonly spin: ParticleRange;

	private emitting = false;

	/** where the next pool search starts, so reuse stays O(1) amortised rather than O(pool) */
	private poolCursor = 0;

	/** fractional particles owed from previous frames, so a low rate still emits accurately */
	private debt = 0;

	constructor(options: ParticleEmitterOptions = {}) {
		super();

		const max = Math.max(1, Math.floor(options.max ?? 200));
		this.rate = options.rate ?? 0;
		this.life = options.life ?? [0.4, 0.9];
		this.speed = options.speed ?? [20, 60];
		this.angleRange = options.angle ?? [0, Math.PI * 2];
		this.gravityX = options.gravity?.x ?? 0;
		this.gravityY = options.gravity?.y ?? 0;
		this.scaleRange = options.scale ?? [1, 1];
		this.alphaRange = options.alpha ?? [1, 0];
		this.spin = options.spin ?? 0;

		for (let i = 0; i < max; i++) {
			this.pool.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, rotation: 0, spin: 0, scale: 1, alpha: 1, active: false });

			if (options.texture) {
				const sprite = new Sprite(options.texture);
				sprite.anchor.set(0.5);
				sprite.visible = false;
				if (options.tint !== undefined) sprite.tint = options.tint;
				this.sprites.push(sprite);
				this.addChild(sprite);
			}
		}
	}

	/** begins continuous emission at `rate` particles per second */
	start(): void {
		this.emitting = true;
	}

	/** stops emitting; particles already alive still finish their lives */
	stop(): void {
		this.emitting = false;
		this.debt = 0;
	}

	get isEmitting(): boolean {
		return this.emitting;
	}

	/** how many particles are alive right now */
	get activeCount(): number {
		let count = 0;
		for (const particle of this.pool) if (particle.active) count++;
		return count;
	}

	/** the pool, live: a renderer or a test reads `active` particles straight off it */
	get particles(): readonly Particle[] {
		return this.pool;
	}

	/**
	 * Emits `count` particles at once - a hit spark, an explosion.
	 *
	 * @returns how many were actually emitted, which is fewer than asked when the pool is full
	 */
	burst(count: number): number {
		let emitted = 0;
		for (let i = 0; i < count; i++) {
			if (!this.spawn()) break;
			emitted++;
		}
		return emitted;
	}

	private spawn(): boolean {
		//a cursor rather than a scan from zero: reusing the pool must not get more expensive
		//the fuller it gets, which is exactly when an emitter is under the most load
		let particle: Particle | null = null;
		for (let tried = 0; tried < this.pool.length; tried++) {
			const candidate = this.pool[this.poolCursor];
			this.poolCursor = (this.poolCursor + 1) % this.pool.length;
			if (!candidate.active) {
				particle = candidate;
				break;
			}
		}
		if (!particle) return false;

		const angle = pick(this.angleRange);
		const speed = pick(this.speed);

		particle.x = this.x;
		particle.y = this.y;
		particle.vx = Math.cos(angle) * speed;
		particle.vy = Math.sin(angle) * speed;
		particle.age = 0;
		particle.life = Math.max(1e-6, pick(this.life));
		particle.rotation = 0;
		particle.spin = pick(this.spin);
		particle.scale = this.scaleRange[0];
		particle.alpha = this.alphaRange[0];
		particle.active = true;
		return true;
	}

	update(dt: number): void {
		if (this.emitting && this.rate > 0) {
			this.debt += this.rate * dt;
			while (this.debt >= 1) {
				this.debt -= 1;
				if (!this.spawn()) {
					//pool full: drop the backlog rather than banking it for a later burst
					this.debt = 0;
					break;
				}
			}
		}

		for (const particle of this.pool) {
			if (!particle.active) continue;

			particle.age += dt;
			if (particle.age >= particle.life) {
				particle.active = false;
				continue;
			}

			particle.vx += this.gravityX * dt;
			particle.vy += this.gravityY * dt;
			particle.x += particle.vx * dt;
			particle.y += particle.vy * dt;
			particle.rotation += particle.spin * dt;

			const t = particle.age / particle.life;
			particle.scale = this.scaleRange[0] + (this.scaleRange[1] - this.scaleRange[0]) * t;
			particle.alpha = this.alphaRange[0] + (this.alphaRange[1] - this.alphaRange[0]) * t;
		}

		this.draw();
	}

	/** mirrors the pool onto the sprites; a no-op for a textureless emitter */
	private draw(): void {
		if (this.sprites.length === 0) return;

		for (let i = 0; i < this.pool.length; i++) {
			const particle = this.pool[i];
			const sprite = this.sprites[i];
			sprite.visible = particle.active;
			if (!particle.active) continue;

			//particle positions are world units, the emitter's own origin included, while the
			//sprite is a child of the emitter - so the origin is subtracted back out here
			sprite.x = particle.x - this.x;
			sprite.y = particle.y - this.y;
			sprite.rotation = particle.rotation;
			sprite.alpha = particle.alpha;
			sprite.scale.set(particle.scale);
		}
	}

	/** kills every live particle at once, without emitting anything further */
	clear(): void {
		for (const particle of this.pool) particle.active = false;
		this.debt = 0;
		this.draw();
	}
}
