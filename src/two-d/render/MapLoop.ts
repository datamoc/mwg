/**
 * The arithmetic of a map that loops: the same world repeated on one or both axes, so a
 * camera at the right edge sees the left one beyond it and a character leaving one side
 * arrives at the other.
 *
 * Pure geometry, no display objects: `wrapPoint` folds a position back into the map,
 * `nearest` picks which copy of a thing is closest to a viewer, `delta` is the shortest
 * way around for movement and AI, and `offsets` says which copies of the whole map a view
 * has to draw. That split is what lets a project with its own camera (or its own renderer)
 * use the same rules as a `TileMap`.
 *
 * @example
 * ```ts
 * import { MapLoop } from '@datamoc/mwg/two-d/render';
 *
 * const loop = new MapLoop({ width: 640, height: 480, wrapX: true });
 * console.log(loop.wrapPoint(700, 100)); // { x: 60, y: 100 }
 * console.log(loop.nearest(60, 100, 620, 100)); // { x: 700, y: 100 } - the copy next to the viewer
 * console.log(loop.delta(630, 100, 10, 100)); // { dx: 20, dy: 0 } - across the seam, not back the long way
 * ```
 */
export interface MapLoopOptions {
	/** the map's size in world units */
	width: number;
	height: number;

	/** whether the map repeats left-to-right */
	wrapX?: boolean;

	/** whether the map repeats top-to-bottom */
	wrapY?: boolean;
}

export interface MapPoint {
	x: number;
	y: number;
}

export class MapLoop {
	readonly width: number;
	readonly height: number;
	readonly wrapX: boolean;
	readonly wrapY: boolean;

	constructor(options: MapLoopOptions) {
		if (!(options.width > 0) || !(options.height > 0)) {
			throw new Error('a looping map needs a positive width and height');
		}
		this.width = options.width;
		this.height = options.height;
		this.wrapX = options.wrapX ?? false;
		this.wrapY = options.wrapY ?? false;
	}

	/** true when at least one axis repeats */
	get wraps(): boolean {
		return this.wrapX || this.wrapY;
	}

	/** folds a world position back into `[0, width) x [0, height)` on the wrapped axes */
	wrapPoint(x: number, y: number): MapPoint {
		return {
			x: this.wrapX ? modulo(x, this.width) : x,
			y: this.wrapY ? modulo(y, this.height) : y,
		};
	}

	/**
	 * The copy of `(x, y)` nearest `(nearX, nearY)`: the wrapped copy a sprite should be
	 * drawn at so it appears on the viewer's side of the seam rather than across the map.
	 */
	nearest(x: number, y: number, nearX: number, nearY: number): MapPoint {
		return {
			x: x + this.copyIndex(x, nearX, this.width, this.wrapX) * this.width,
			y: y + this.copyIndex(y, nearY, this.height, this.wrapY) * this.height,
		};
	}

	/**
	 * The shortest signed step from `(fromX, fromY)` to `(toX, toY)`, across a wrapped seam
	 * when that is closer - what chasing, fleeing and pathfinding should use on a looping
	 * map, since the straight line would otherwise walk the long way round.
	 */
	delta(fromX: number, fromY: number, toX: number, toY: number): MapPoint {
		const dx = this.wrapX ? signedDelta(fromX, toX, this.width) : toX - fromX;
		const dy = this.wrapY ? signedDelta(fromY, toY, this.height) : toY - fromY;
		return { x: dx, y: dy };
	}

	/**
	 * The translations at which copies of the whole map have to be drawn for a view centred
	 * on `(nearX, nearY)` with the given half extents: one offset when nothing wraps, two
	 * on a single axis, four when both do - and only those the view actually reaches, so a
	 * small view in the middle of the map gets the `0, 0` offset alone.
	 *
	 * `margin` widens the test, for a sprite that straddles the seam.
	 */
	offsets(nearX: number, nearY: number, halfWidth: number, halfHeight: number, margin = 0): MapPoint[] {
		const xs = this.copyOffsets(nearX, halfWidth + margin, this.width, this.wrapX);
		const ys = this.copyOffsets(nearY, halfHeight + margin, this.height, this.wrapY);
		const points: MapPoint[] = [];
		for (const y of ys) for (const x of xs) points.push({ x, y });
		return points;
	}

	private copyIndex(value: number, near: number, size: number, wraps: boolean): number {
		if (!wraps) return 0;
		return Math.round((near - value) / size);
	}

	private copyOffsets(near: number, half: number, size: number, wraps: boolean): number[] {
		if (!wraps) return [0];
		//which repetitions the interval [near - half, near + half] touches, relative to the base copy
		const first = Math.floor((near - half) / size);
		const last = Math.ceil((near + half) / size) - 1;
		const offsets: number[] = [];
		for (let index = first; index <= last; index++) offsets.push(index * size);
		return offsets;
	}
}

/** a positive modulo, unlike `%`: `-1` on a 10-wide map is 9, not -1 */
function modulo(value: number, size: number): number {
	return ((value % size) + size) % size;
}

/** the signed distance from `from` to `to`, taking whichever way around is shorter */
function signedDelta(from: number, to: number, size: number): number {
	return modulo(to - from + size / 2, size) - size / 2;
}
