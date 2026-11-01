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
 *
 * @example
 * ```ts
 * import { Viewport, splitScreenHalves } from '@datamoc/mwg/two-d/render';
 *
 * const [left, right] = splitScreenHalves(640, 360);
 * const player1 = new Viewport({ ...left, zoom: 2 });
 * const player2 = new Viewport({ ...right, zoom: 2 });
 * // add both containers: game.stage.addChild(player1.container, player2.container);
 *
 * player1.camera.follow({ x: 50, y: 50 });
 * player1.update(1 / 60);
 * ```
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
 *
 * @example
 * ```ts
 * import { splitScreenHalves } from '@datamoc/mwg/two-d/render';
 *
 * const [top, bottom] = splitScreenHalves(400, 600); // taller than wide: stacks vertically
 * console.log(top); // { x: 0, y: 0, width: 400, height: 300 }
 * console.log(bottom); // { x: 0, y: 300, width: 400, height: 300 }
 * ```
 */
export function splitScreenHalves(
	width: number,
	height: number,
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

/** which rectangle the large share of a three-player screen sits on: the first (left, or top in portrait) or the last */
export interface SplitScreenOptions {
	/**
	 * Three players only. `'half-and-quarters'` (the default) is the same shape as
	 * `'large-left'`: one half of the screen for one player, the other half cut into two
	 * quarters. `'large-left'` names the first half along the split axis (the left half in a
	 * landscape layout, the top half in a portrait one), `'large-right'` the second.
	 */
	three?: 'half-and-quarters' | 'large-left' | 'large-right';
}

function assertPositiveSize(name: string, value: number): void {
	if (!Number.isFinite(value) || value <= 0)
		throw new Error(`${name} must be a positive, finite number, not ${value}`);
}

/**
 * The rectangles of a 1 to 4 player same-screen layout, ordered left to right (and top to
 * bottom), each ready to hand straight to a `Viewport`.
 *
 * One player fills the screen, two are exactly `splitScreenHalves`, three are one half plus
 * two quarters of the other half, and four are quadrants. Every rectangle tiles the canvas
 * exactly, with no overlap and no gap, at any width and height: each axis is cut with
 * `Math.floor`, the same rule `splitScreenHalves` already follows, so an odd dimension's
 * spare pixel lands on whichever piece starts further right (or down) along that axis, never
 * split or dropped - the right half of a two-player split, the right or bottom quadrant of a
 * four-player one. That keeps the arithmetic exact and the choice deterministic, rather than
 * depending on floating point or on which piece is drawn first.
 *
 * @example
 * ```ts
 * import { splitScreenLayout } from '@datamoc/mwg/two-d/render';
 *
 * const quadrants = splitScreenLayout(4, 1280, 720); // four 640x360 rectangles
 * const three = splitScreenLayout(3, 1280, 720); // 640x720, then two 640x360 quarters
 * const threeOnTheRight = splitScreenLayout(3, 1280, 720, { three: 'large-right' });
 * console.log(quadrants[3], three[0], threeOnTheRight[2]);
 * ```
 */
export function splitScreenLayout(
	players: 1 | 2 | 3 | 4,
	width: number,
	height: number,
	options: SplitScreenOptions = {},
): ViewportOptions[] {
	if (players !== 1 && players !== 2 && players !== 3 && players !== 4)
		throw new Error(`splitScreenLayout supports 1 to 4 players, not ${players}`);
	assertPositiveSize('splitScreenLayout width', width);
	assertPositiveSize('splitScreenLayout height', height);

	if (players === 1) return [{ x: 0, y: 0, width, height }];

	if (players === 2) {
		const [first, second] = splitScreenHalves(width, height);
		return [{ ...first }, { ...second }];
	}

	if (players === 4) {
		const halfWidth = Math.floor(width / 2);
		const halfHeight = Math.floor(height / 2);
		return [
			{ x: 0, y: 0, width: halfWidth, height: halfHeight },
			{ x: halfWidth, y: 0, width: width - halfWidth, height: halfHeight },
			{ x: 0, y: halfHeight, width: halfWidth, height: height - halfHeight },
			{ x: halfWidth, y: halfHeight, width: width - halfWidth, height: height - halfHeight },
		];
	}

	//three players: the half that keeps its full length, and the other half cut across it
	const [first, second] = splitScreenHalves(width, height);
	const largeFirst = (options.three ?? 'half-and-quarters') !== 'large-right';
	const large = largeFirst ? first : second;
	const small = largeFirst ? second : first;

	let quarters: ViewportOptions[];
	if (width >= height) {
		//landscape: the small share is a full-height column, so it is cut into stacked quarters
		const topHeight = Math.floor(small.height / 2);
		quarters = [
			{ x: small.x, y: 0, width: small.width, height: topHeight },
			{ x: small.x, y: topHeight, width: small.width, height: small.height - topHeight },
		];
	} else {
		//portrait: the small share is a full-width row, so it is cut into side-by-side quarters
		const leftWidth = Math.floor(small.width / 2);
		quarters = [
			{ x: 0, y: small.y, width: leftWidth, height: small.height },
			{ x: leftWidth, y: small.y, width: small.width - leftWidth, height: small.height },
		];
	}

	return largeFirst ? [large, ...quarters] : [...quarters, large];
}

/** a canvas size to lay a local multiplayer screen out in, for `createViewports` */
export interface CreateViewportsOptions extends SplitScreenOptions {
	width: number;
	height: number;
	/** screen pixels per world unit, applied to every viewport; `Camera`'s own default is 1 */
	zoom?: number;
}

/**
 * `splitScreenLayout` and `Viewport` in one call: one viewport per player, in the same order
 * the layout returns them, each with `zoom` set.
 *
 * @example
 * ```ts
 * import { createViewports } from '@datamoc/mwg/two-d/render';
 *
 * const viewports = createViewports(2, { width: 1280, height: 720, zoom: 2 });
 * // add both containers to the stage, then drive each camera normally:
 * // game.stage.addChild(viewports[0].container, viewports[1].container);
 * viewports[0].camera.follow({ x: 100, y: 100 });
 * viewports[1].camera.follow({ x: 900, y: 100 });
 * ```
 */
export function createViewports(players: 1 | 2 | 3 | 4, options: CreateViewportsOptions): Viewport[] {
	return splitScreenLayout(players, options.width, options.height, options).map(
		(rect) => new Viewport({ ...rect, zoom: options.zoom }),
	);
}
