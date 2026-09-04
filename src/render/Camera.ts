import { Container } from 'pixi.js';
import { Game } from '../core/Game.ts';
import * as Random from '../core/Random.ts';

/**
 * A view onto a world larger than the screen.
 *
 * The camera does not move: it moves the world under a fixed viewport, which is what a
 * renderer actually wants. `world` is the container to put the map and its inhabitants in;
 * anything that should stay put on screen (the HUD, a dialogue box) goes outside it.
 *
 * Positions are in world units. At `zoom = 3` a 16px tile is 48 screen pixels.
 */
export interface CameraOptions {
	/** screen pixels per world unit */
	zoom?: number;

	/**
	 * How much of the screen the target may drift across before the camera follows, 0 to 1.
	 *
	 * 0 pins the target to the centre, which is precise but makes the world lurch on every
	 * step. 0.3 lets it wander through the middle third, which reads far calmer in a
	 * grid-based game where movement is in whole tiles.
	 */
	deadzone?: number;

	/**
	 * When set, `zoom` snaps to the nearest value at which one world unit of this size lands
	 * on a whole number of screen pixels - a tile's own width or height, typically.
	 *
	 * `apply()` already rounds the whole camera's screen offset to a whole pixel, which stops
	 * pixel art shimmering as the camera moves, but at a fractional zoom each tile's *own*
	 * edge still lands on a different sub-pixel offset depending on its position, so
	 * nearest-neighbour sampling rounds one tile's edge column one way and its neighbour's
	 * the other - a thin seam between tiles that camera-level rounding alone cannot fix.
	 * Snapping zoom itself so tile-size × zoom is always a whole number closes the gap at
	 * its source, without a per-tile sampling flag.
	 */
	pixelPerfectTileSize?: number;
}

export class Camera {
	/** put the map and everything in it here */
	readonly world = new Container();

	/** centre of the view, in world units */
	x = 0;
	y = 0;

	private _zoom: number;
	private deadzone: number;
	private readonly pixelPerfectTileSize?: number;

	private viewWidth = 0;
	private viewHeight = 0;
	//where this camera's own rectangle starts on screen; 0,0 for an ordinary full-screen
	//camera, nonzero for one player's share of a split-screen layout (see render.Viewport)
	private screenX = 0;
	private screenY = 0;

	private followTarget: { x: number; y: number } | null = null;
	//how fast the camera closes on its target: it covers `intensity` of the remaining
	//distance each second, so it eases in without ever quite arriving
	private followIntensity = 0;

	private shakeMagnitude = 0;
	private shakeRemaining = 0;
	private shakeDuration = 1;
	private shakeX = 0;
	private shakeY = 0;

	/** clamps the view to these world bounds when set, so the map's edge is never crossed */
	private bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

	constructor(options: CameraOptions = {}) {
		this.deadzone = options.deadzone ?? 0;
		this.pixelPerfectTileSize = options.pixelPerfectTileSize;
		this._zoom = 1;
		this.zoom = options.zoom ?? 1;
	}

	get zoom(): number {
		return this._zoom;
	}

	set zoom(value: number) {
		const clamped = Math.max(0.01, value);
		this._zoom = this.pixelPerfectTileSize ? snapZoom(clamped, this.pixelPerfectTileSize) : clamped;
	}

	/**
	 * The framework calls this on resize; sizes are in screen pixels. `screenX`/`screenY`
	 * default to 0 (an ordinary camera starting at the corner of the canvas); a `Viewport`
	 * gives its camera a nonzero one so this camera's own rectangle starts partway across
	 * the screen instead, for a split-screen layout.
	 */
	setViewport(width: number, height: number, screenX = 0, screenY = 0): void {
		this.viewWidth = width;
		this.viewHeight = height;
		this.screenX = screenX;
		this.screenY = screenY;
	}

	/** the visible rectangle, in world units: use it to cull */
	get view(): { x: number; y: number; width: number; height: number } {
		const width = this.viewWidth / this._zoom;
		const height = this.viewHeight / this._zoom;
		const { x: centreX, y: centreY } = this.clampedCentre(this.x, this.y);
		return { x: centreX - width / 2, y: centreY - height / 2, width, height };
	}

	/** stops the camera leaving the map; pass null to allow it again */
	setBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number } | null): void {
		this.bounds = bounds;
	}

	/** jumps to a point with no easing, for a teleport or a scene change */
	snapTo(x: number, y: number): void {
		this.x = x;
		this.y = y;
		this.followTarget = null;
		this.followIntensity = 0;
		this.apply();
	}

	/** eases towards a fixed point */
	panTo(x: number, y: number, intensity = 4): void {
		this.followTarget = { x, y };
		this.followIntensity = intensity;
	}

	/** eases towards something that keeps moving, such as the player */
	follow(target: { x: number; y: number }, intensity = 8): void {
		this.followTarget = target;
		this.followIntensity = intensity;
	}

	stopFollowing(): void {
		this.followTarget = null;
		this.followIntensity = 0;
	}

	/** @param magnitude world units @param duration seconds */
	shake(magnitude: number, duration = 0.4): void {
		this.shakeMagnitude = magnitude;
		this.shakeRemaining = this.shakeDuration = duration;
	}

	update(dt: number): void {
		if (this.followTarget && this.followIntensity > 0) {
			const deadX = (this.view.width * this.deadzone) / 2;
			const deadY = (this.view.height * this.deadzone) / 2;

			let dx = this.followTarget.x - this.x;
			let dy = this.followTarget.y - this.y;

			//inside the deadzone the camera simply does not move
			dx = dx > deadX ? dx - deadX : dx < -deadX ? dx + deadX : 0;
			dy = dy > deadY ? dy - deadY : dy < -deadY ? dy + deadY : 0;

			//framerate-independent easing: the same fraction is covered per second however
			//long the frame was, so a slow frame does not lag the camera behind
			const t = 1 - Math.exp(-this.followIntensity * dt);
			this.x += dx * t;
			this.y += dy * t;
		}

		if (this.shakeRemaining > 0) {
			this.shakeRemaining -= dt;
			//the shake fades out over its duration rather than stopping dead
			const damping = Math.max(0, this.shakeRemaining / this.shakeDuration);
			this.shakeX = Random.float(-this.shakeMagnitude, this.shakeMagnitude) * damping;
			this.shakeY = Random.float(-this.shakeMagnitude, this.shakeMagnitude) * damping;
		} else {
			this.shakeX = this.shakeY = 0;
		}

		this.apply();
	}

	/** world point to screen pixels */
	toScreen(x: number, y: number): { x: number; y: number } {
		//must agree with apply()'s clamped centre (shake included), or a point converted
		//with this and placed on screen lands somewhere other than where the camera
		//actually drew it - exactly what happens near a bound, or on an axis the map is
		//narrower than the view
		const { x: centreX, y: centreY } = this.clampedCentre(this.x + this.shakeX, this.y + this.shakeY);
		return {
			x: (x - centreX) * this._zoom + this.screenX + this.viewWidth / 2,
			y: (y - centreY) * this._zoom + this.screenY + this.viewHeight / 2,
		};
	}

	/** screen pixels to world point, for turning a click into a tile */
	toWorld(x: number, y: number): { x: number; y: number } {
		const { x: centreX, y: centreY } = this.clampedCentre(this.x + this.shakeX, this.y + this.shakeY);
		return {
			x: (x - this.screenX - this.viewWidth / 2) / this._zoom + centreX,
			y: (y - this.screenY - this.viewHeight / 2) / this._zoom + centreY,
		};
	}

	//the bounds-clamped centre `apply()` renders at, also what `view` reports for
	//culling: the two must agree, or culling drops tiles that are actually on screen
	private clampedCentre(x: number, y: number): { x: number; y: number } {
		if (!this.bounds) return { x, y };

		const halfWidth = this.viewWidth / this._zoom / 2;
		const halfHeight = this.viewHeight / this._zoom / 2;
		const { minX, minY, maxX, maxY } = this.bounds;

		//when the map is narrower than the view, centre it rather than clamping to an
		//edge, which would push the map against one side of the screen
		return {
			x: maxX - minX < halfWidth * 2 ? (minX + maxX) / 2 : clamp(x, minX + halfWidth, maxX - halfWidth),
			y: maxY - minY < halfHeight * 2 ? (minY + maxY) / 2 : clamp(y, minY + halfHeight, maxY - halfHeight),
		};
	}

	private apply(): void {
		const { x: centreX, y: centreY } = this.clampedCentre(this.x + this.shakeX, this.y + this.shakeY);

		this.world.scale.set(this._zoom);
		//rounding to whole screen pixels stops pixel art shimmering as the camera moves
		this.world.x = Math.round(this.screenX + this.viewWidth / 2 - centreX * this._zoom);
		this.world.y = Math.round(this.screenY + this.viewHeight / 2 - centreY * this._zoom);
	}
}

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

/**
 * The nearest zoom to `zoom` at which `tileSize * zoom` is a whole number of screen pixels -
 * the pure math behind `CameraOptions.pixelPerfectTileSize`, exported so a game can snap a
 * zoom value (from a slider, say) before ever handing it to a `Camera`.
 */
export function snapZoom(zoom: number, tileSize: number): number {
	const pixels = Math.max(1, Math.round(zoom * tileSize));
	return pixels / tileSize;
}

/** a camera sized to the running game's viewport, updated on every frame */
export function createCamera(options: CameraOptions = {}): Camera {
	const camera = new Camera(options);
	const game = Game.current;
	//the logical viewport, not the backing store, which is larger on a hidpi display
	camera.setViewport(game.width, game.height);
	return camera;
}
