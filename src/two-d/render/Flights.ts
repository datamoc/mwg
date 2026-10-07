import { Container, Sprite, Texture } from 'pixi.js';

import { Projectile, type ProjectileOptions, type ProjectilePoint } from './Projectile.ts';
import type { Texture2D } from './Types2D.ts';

/** what a flight moves: position required, presentation optional and applied only when present */
export interface FlightSprite {
	x: number;
	y: number;
	rotation?: number;
	alpha?: number;
	tint?: number;
}

export interface FlightOptions extends ProjectileOptions {
	/** set once at launch, when the sprite takes a tint */
	tint?: number;
	/** radians per second added to the sprite's rotation while flying */
	spin?: number;
	/**
	 * `spin` in degrees per second instead - the same rotation, converted once here,
	 * so an authored angular speed needs no `* Math.PI / 180` at the call site.
	 * Ignored when `spin` is given.
	 */
	spinDegrees?: number;
	/**
	 * Seconds the sprite fades 0 to 1 from launch (a number), or `'progress'`/`true`
	 * to ease 0 to 1 along the flight's own progress - the tween's own clock, so the
	 * fade cannot desynchronise from a duration the caller re-computed differently.
	 * 0, `false` or omitted means no fade.
	 */
	fadeIn?: number | boolean | 'progress';
	/**
	 * Dispatched once, when this flight arrives - never on `cancel()` or `clear()`,
	 * and after the flight has left the list, so an arrival that launches another
	 * flight cannot disturb the iteration it arrived in.
	 */
	onArrive?: () => void;
}

export interface FlightHandle {
	/** the flight's own tween: `progress`, `frame`, `done` */
	readonly projectile: Projectile;
	/** whether the flight has arrived */
	readonly done: boolean;
	/** forgets the flight without dispatching `onArrive`; a manager-built sprite is destroyed */
	cancel(): void;
}

interface LiveFlight {
	projectile: Projectile;
	sprite: FlightSprite;
	built?: Sprite;
	onArrive?: () => void;
	spin?: number;
	fadeMode: 'seconds' | 'progress' | 'none';
	fadeIn: number;
	baseAlpha: number;
	elapsed: number;
}

function fadeModeOf(fadeIn: FlightOptions['fadeIn']): LiveFlight['fadeMode'] {
	if (fadeIn === true || fadeIn === 'progress') return 'progress';
	if (typeof fadeIn === 'number' && fadeIn > 0) return 'seconds';
	return 'none';
}

/**
 * Owns the projectile flights a game has in the air: one `add` per shot, one
 * `update(dt)` driving them all, `onArrive` dispatched exactly once per arrival,
 * and no bookkeeping left to the caller.
 *
 * Ownership follows who made the sprite. A sprite you pass stays yours - the
 * manager positions it but never parents or destroys it, so layering and scene
 * teardown stay the caller's. A texture builds a manager sprite instead: parented
 * here and destroyed on arrival, cancel or clear. Destroying the `Flights` node
 * itself clears first, so manager-built sprites never outlive it.
 *
 * @example
 * ```ts
 * import { Flights } from '@datamoc/mw_games/two-d/render';
 * import type { Container2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const layer: Container2D;
 * declare const bolt: { x: number; y: number };
 *
 * const flights = new Flights();
 * layer.addChild(flights);
 *
 * const flight = flights.add(bolt, { x: 0, y: 0 }, { x: 200, y: 0 }, {
 * 	speed: 400,
 * 	onArrive: () => console.log('hit'),
 * });
 * flights.update(1 / 60);
 * console.log(flights.count, flight.done); // 1 false - still flying
 * flight.cancel();
 * flights.clear();
 * ```
 */
export class Flights extends Container {
	private readonly live: LiveFlight[] = [];

	add(sprite: FlightSprite, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;
	add(texture: Texture2D, from: ProjectilePoint, to: ProjectilePoint, options?: FlightOptions): FlightHandle;
	add(
		art: FlightSprite | Texture2D,
		from: ProjectilePoint,
		to: ProjectilePoint,
		options: FlightOptions = {},
	): FlightHandle {
		let sprite: FlightSprite;
		let built: Sprite | undefined;
		if (art instanceof Texture) {
			built = new Sprite(art);
			this.addChild(built);
			sprite = built;
		} else {
			sprite = art;
		}

		if (options.tint !== undefined && typeof sprite.tint === 'number') sprite.tint = options.tint;
		const fadeMode = fadeModeOf(options.fadeIn);
		const fadeIn = typeof options.fadeIn === 'number' ? options.fadeIn : 0;
		const baseAlpha = typeof sprite.alpha === 'number' ? sprite.alpha : 1;
		if (fadeMode !== 'none') sprite.alpha = 0;

		const flight: LiveFlight = {
			projectile: new Projectile(sprite, from, to, options),
			sprite,
			built,
			onArrive: options.onArrive,
			spin:
				options.spin ?? (options.spinDegrees !== undefined ? (options.spinDegrees * Math.PI) / 180 : undefined),
			fadeMode,
			fadeIn,
			baseAlpha,
			elapsed: 0,
		};
		this.live.push(flight);

		return {
			projectile: flight.projectile,
			get done() {
				return flight.projectile.done;
			},
			cancel: () => {
				const index = this.live.indexOf(flight);
				if (index === -1) return;
				this.live.splice(index, 1);
				this.release(flight);
			},
		};
	}

	/** drives every live flight, then forgets the arrived ones (arrival first, callback after) */
	update(dt: number): void {
		for (let i = this.live.length - 1; i >= 0; i--) {
			const flight = this.live[i];
			flight.elapsed += dt;
			if (flight.spin !== undefined) {
				flight.sprite.rotation = (flight.sprite.rotation ?? 0) + flight.spin * dt;
			}
			if (flight.fadeMode === 'seconds') {
				flight.sprite.alpha = flight.baseAlpha * Math.min(1, flight.elapsed / flight.fadeIn);
			}
			const arrived = flight.projectile.update(dt);
			//after the tween, so the fade tracks the progress this very update produced;
			//on the arrival tick that is exactly 1 and the sprite lands on its base alpha
			if (flight.fadeMode === 'progress') {
				flight.sprite.alpha = flight.baseAlpha * flight.projectile.progress;
			}
			if (arrived) {
				this.live.splice(i, 1);
				this.release(flight);
				flight.onArrive?.();
			}
		}
	}

	/** how many flights are still in the air */
	get count(): number {
		return this.live.length;
	}

	/** drops every live flight at once without dispatching arrivals - a scene change, say */
	clear(): void {
		for (const flight of this.live.splice(0)) this.release(flight);
	}

	override destroy(): void {
		this.clear();
		super.destroy();
	}

	private release(flight: LiveFlight): void {
		if (!flight.built) return;
		this.removeChild(flight.built);
		flight.built.destroy();
	}
}
