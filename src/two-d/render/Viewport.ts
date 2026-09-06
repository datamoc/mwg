import { Container, Graphics } from 'pixi.js';
import { Camera, type CameraOptions } from './Camera.ts';

export interface ViewportOptions extends CameraOptions {
	/** this viewport's own rectangle of the screen, in pixels */
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * One player's own rectangle of the screen, for a same-screen local multiplayer layout: a
 * `Camera` whose world is offset to start at `x`/`y` instead of the corner of the canvas,
 * and clipped to `width`/`height` so it never bleeds into a neighbouring player's share of
 * the screen. A game with a single `Viewport` covering the whole canvas behaves exactly like
 * a game using a bare `Camera` directly - this adds a screen region and a mask around it,
 * nothing else.
 */
export class Viewport {
	readonly camera: Camera;

	/** add this to `Game.current.stage`, the way a single-camera game already adds `camera.world` */
	readonly container = new Container();

	private readonly clip = new Graphics();

	constructor(options: ViewportOptions) {
		this.camera = new Camera(options);
		this.container.addChild(this.camera.world);
		this.container.addChild(this.clip);
		this.container.mask = this.clip;
		this.resize(options.x, options.y, options.width, options.height);
	}

	/** moves and/or resizes this viewport's own rectangle of the screen */
	resize(x: number, y: number, width: number, height: number): void {
		this.camera.setViewport(width, height, x, y);
		this.clip.clear().rect(x, y, width, height).fill(0xffffff);
	}

	update(dt: number): void {
		this.camera.update(dt);
	}
}

/**
 * The two even halves of `width`×`height` a two-player split screen typically wants -
 * side by side for a landscape screen, stacked for a portrait one - as plain rectangles a
 * game hands straight to two `Viewport`s (or to `resize` on a resize event). Not the only
 * reasonable split, so not baked into `Viewport` itself: a game wanting an L-shaped, uneven,
 * or three/four-player layout lays out its own rectangles the same way.
 */
export function splitScreenHalves(
	width: number,
	height: number
): [{ x: number; y: number; width: number; height: number }, { x: number; y: number; width: number; height: number }] {
	if (width >= height) {
		const half = Math.floor(width / 2);
		return [
			{ x: 0, y: 0, width: half, height },
			{ x: half, y: 0, width: width - half, height },
		];
	}
	const half = Math.floor(height / 2);
	return [
		{ x: 0, y: 0, width, height: half },
		{ x: 0, y: half, width, height: height - half },
	];
}
