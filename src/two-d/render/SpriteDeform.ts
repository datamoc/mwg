import { MeshPlane } from 'pixi.js';
import type { Texture2D } from './Types2D.ts';

/** A single control point on a deformation grid, in local pixels. */
export interface DeformPoint {
	x: number;
	y: number;
}

/** Grid dimensions and rest size for {@link PinnedDeform}. */
export interface PinnedDeformOptions {
	/** control points across; an integer of at least 2 */
	columns: number;
	/** control points down; an integer of at least 2 */
	rows: number;
	/** rest width in local pixels; must be finite and above 0 */
	width: number;
	/** rest height in local pixels; must be finite and above 0 */
	height: number;
}

function assertGrid(options: PinnedDeformOptions): void {
	for (const key of ['columns', 'rows'] as const) {
		if (!Number.isInteger(options[key]) || options[key] < 2) {
			throw new RangeError(`a pinned deform grid needs integer ${key} of at least 2, saw ${options[key]}`);
		}
	}
	for (const key of ['width', 'height'] as const) {
		if (!Number.isFinite(options[key]) || options[key] <= 0) {
			throw new RangeError(`a pinned deform grid needs ${key} above 0, saw ${options[key]}`);
		}
	}
}

function assertPoint(x: number, y: number): void {
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new Error(`a deform control point needs finite coordinates, saw (${x}, ${y})`);
	}
}

/**
 * A pinned-point deformation grid: the renderer-free math behind roadmap item 414.
 *
 * The grid holds `columns * rows` control points over a `width * height` rest
 * rectangle. Every point stays exactly at its rest position until the game drags
 * it with {@link PinnedDeform.drag} (or {@link PinnedDeform.nudge}); there is no
 * falloff onto neighbours, no smoothing pass and no whole-sprite rotation, so a
 * Pontifex wingtip can move while the wing root stays bit-identical. UVs are not
 * modelled here at all: this class only tracks positions, and the GPU side
 * (`DeformableSprite`) leaves its UV buffer untouched.
 *
 * @example
 * ```ts
 * import { PinnedDeform } from '@datamoc/mwg/two-d/render';
 *
 * const wing = new PinnedDeform({ columns: 4, rows: 3, width: 96, height: 64 });
 * wing.drag(wing.indexOf(3, 0), 99, -6); // the wingtip follows the bone
 * console.log(wing.at(wing.indexOf(0, 1))); // { x: 0, y: 32 } - the pinned root never moves
 * console.log(wing.movedCount()); // 1 - only the dragged tip left its rest position
 * ```
 */
export class PinnedDeform {
	readonly columns: number;
	readonly rows: number;
	readonly width: number;
	readonly height: number;
	private readonly rest: Float32Array;
	private readonly offsets: Float32Array;

	constructor(options: PinnedDeformOptions) {
		assertGrid(options);
		this.columns = options.columns;
		this.rows = options.rows;
		this.width = options.width;
		this.height = options.height;
		this.rest = new Float32Array(this.count * 2);
		this.offsets = new Float32Array(this.count * 2);
		for (let row = 0; row < this.rows; row++) {
			for (let column = 0; column < this.columns; column++) {
				const index = (row * this.columns + column) * 2;
				this.rest[index] = (column / (this.columns - 1)) * this.width;
				this.rest[index + 1] = (row / (this.rows - 1)) * this.height;
			}
		}
	}

	/** how many control points the grid holds */
	get count(): number {
		return this.columns * this.rows;
	}

	/** the flat index of the point at `(column, row)`; throws a RangeError outside the grid */
	indexOf(column: number, row: number): number {
		if (
			!Number.isInteger(column) ||
			!Number.isInteger(row) ||
			column < 0 ||
			row < 0 ||
			column >= this.columns ||
			row >= this.rows
		) {
			throw new RangeError(`control point (${column}, ${row}) is outside a ${this.columns}x${this.rows} grid`);
		}
		return row * this.columns + column;
	}

	private checkIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.count) {
			throw new RangeError(`control point ${index} is outside a grid of ${this.count} points`);
		}
	}

	/** the rest position of one point; the value pinned points always report */
	restAt(index: number): DeformPoint {
		this.checkIndex(index);
		return { x: this.rest[index * 2], y: this.rest[index * 2 + 1] };
	}

	/** the current position of one point: rest plus whatever `drag`/`nudge` applied */
	at(index: number): DeformPoint {
		this.checkIndex(index);
		return {
			x: this.rest[index * 2] + this.offsets[index * 2],
			y: this.rest[index * 2 + 1] + this.offsets[index * 2 + 1],
		};
	}

	/** whether a point currently sits away from its rest position */
	isMoved(index: number): boolean {
		this.checkIndex(index);
		return this.offsets[index * 2] !== 0 || this.offsets[index * 2 + 1] !== 0;
	}

	/** how many points currently sit away from their rest positions */
	movedCount(): number {
		let moved = 0;
		for (let index = 0; index < this.count; index++) {
			if (this.offsets[index * 2] !== 0 || this.offsets[index * 2 + 1] !== 0) moved++;
		}
		return moved;
	}

	/**
	 * Move one control point to an absolute local position. Only that point
	 * changes; every other point stays pinned at rest.
	 */
	drag(index: number, x: number, y: number): void {
		this.checkIndex(index);
		assertPoint(x, y);
		this.offsets[index * 2] = x - this.rest[index * 2];
		this.offsets[index * 2 + 1] = y - this.rest[index * 2 + 1];
	}

	/** Move a batch of control points, validating the entire batch before changing any. */
	dragMany(points: ReadonlyArray<DeformPoint & { index: number }>): void {
		for (const point of points) {
			this.checkIndex(point.index);
			assertPoint(point.x, point.y);
		}
		for (const point of points) this.drag(point.index, point.x, point.y);
	}

	/** Shift one control point by a delta; the rest stay pinned, as with `drag`. */
	nudge(index: number, dx: number, dy: number): void {
		this.checkIndex(index);
		assertPoint(dx, dy);
		this.offsets[index * 2] += dx;
		this.offsets[index * 2 + 1] += dy;
	}

	/**
	 * Return one point to rest, or every point when called without an index.
	 */
	reset(index?: number): void {
		if (index === undefined) {
			this.offsets.fill(0);
			return;
		}
		this.checkIndex(index);
		this.offsets[index * 2] = 0;
		this.offsets[index * 2 + 1] = 0;
	}

	/**
	 * Adopt externally built rest positions, clearing every offset. `DeformableSprite`
	 * uses this to adopt the GPU plane's own floats, so pinned vertices stay
	 * bit-identical to what the mesh already renders instead of nearly equal.
	 */
	rebase(rest: Float32Array): void {
		if (!(rest instanceof Float32Array) || rest.length !== this.rest.length) {
			throw new Error(`rebase needs a Float32Array of ${this.rest.length} floats, saw length ${rest?.length}`);
		}
		for (const value of rest) {
			if (!Number.isFinite(value)) throw new Error('rebase needs finite rest positions');
		}
		this.rest.set(rest);
		this.offsets.fill(0);
	}

	/** a copy of every current position, row-major `(x, y)` pairs for a mesh buffer */
	positions(): Float32Array {
		const out = new Float32Array(this.rest.length);
		this.writePositions(out);
		return out;
	}

	/**
	 * Write every current position into `into`, which must hold exactly
	 * `count * 2` floats. The mesh side calls this with its GPU position array.
	 */
	writePositions(into: Float32Array): void {
		if (!(into instanceof Float32Array) || into.length !== this.rest.length) {
			throw new Error(
				`a deform target needs a Float32Array of ${this.rest.length} floats, saw length ${into?.length}`,
			);
		}
		for (let index = 0; index < this.rest.length; index++) {
			into[index] = this.rest[index] + this.offsets[index];
		}
	}
}

/** Grid density for {@link DeformableSprite}; both default to 4. */
export interface DeformableSpriteOptions {
	/** vertices across; an integer of at least 2, default 4 */
	columns?: number;
	/** vertices down; an integer of at least 2, default 4 */
	rows?: number;
}

/**
 * A sprite that deforms by pinned control points on the existing GPU mesh path.
 *
 * This is Pixi's `MeshPlane` with a `PinnedDeform` driving its position buffer:
 * `dragVertex` moves one vertex while the rest stay pinned, and the mesh batch
 * renders the result, so a Pontifex wing bends without the game touching Pixi's
 * mesh directly. The routine itself never rotates, scales or repositions the
 * sprite (`rotation` stays 0 through every drag) and never rewrites UVs; games
 * that need a turned sprite rotate the texture art, not this mesh. Colour-batch
 * and shader internals are untouched: this stays out of `ColorTransformBatcher`.
 *
 * @example
 * ```ts
 * import { DeformableSprite } from '@datamoc/mwg/two-d/render';
 * import type { Texture2D } from '@datamoc/mwg/two-d/render';
 *
 * declare const wingTexture: Texture2D;
 *
 * const wing = new DeformableSprite(wingTexture, { columns: 4, rows: 4 });
 * wing.dragVertex(wing.indexOf(3, 0), 99, -6); // the wingtip bends on the GPU mesh
 * console.log(wing.vertexAt(wing.indexOf(0, 1)).x); // 0 - the pinned root stays put
 * console.log(wing.rotation); // 0 - dragging never turns the whole sprite
 * ```
 */
export class DeformableSprite extends MeshPlane {
	private readonly deform: PinnedDeform;

	constructor(texture: Texture2D, options?: DeformableSpriteOptions) {
		const columns = options?.columns ?? 4;
		const rows = options?.rows ?? 4;
		const deform = new PinnedDeform({ columns, rows, width: texture.width, height: texture.height });
		super({ texture, verticesX: columns, verticesY: rows });
		this.deform = deform;
		//a later texture resize must not rebuild the plane under the offsets
		this.autoResize = false;
		this.deform.rebase(Float32Array.from(this.positionArray()));
		this.sync();
	}

	private positionArray(): Float32Array {
		return this.geometry.getAttribute('aPosition').buffer.data as Float32Array;
	}

	private sync(): void {
		const attribute = this.geometry.getAttribute('aPosition');
		this.deform.writePositions(attribute.buffer.data as Float32Array);
		attribute.buffer.update();
	}

	/** vertices across */
	get columns(): number {
		return this.deform.columns;
	}

	/** vertices down */
	get rows(): number {
		return this.deform.rows;
	}

	/** how many control vertices the mesh holds */
	get count(): number {
		return this.deform.count;
	}

	/** the flat index of the vertex at `(column, row)` */
	indexOf(column: number, row: number): number {
		return this.deform.indexOf(column, row);
	}

	/** the rest position of one vertex */
	restAt(index: number): DeformPoint {
		return this.deform.restAt(index);
	}

	/** the current position of one vertex */
	vertexAt(index: number): DeformPoint {
		return this.deform.at(index);
	}

	/** whether a vertex currently sits away from its rest position */
	isMoved(index: number): boolean {
		return this.deform.isMoved(index);
	}

	/** how many vertices currently sit away from their rest positions */
	movedCount(): number {
		return this.deform.movedCount();
	}

	/**
	 * Move one mesh vertex to an absolute local position and re-upload the
	 * position buffer. Only that vertex changes; the rest stay pinned.
	 */
	dragVertex(index: number, x: number, y: number): void {
		this.deform.drag(index, x, y);
		this.sync();
	}

	/** Move several vertices with a single GPU buffer upload. Other vertices stay pinned. */
	dragVertices(points: ReadonlyArray<DeformPoint & { index: number }>): void {
		this.deform.dragMany(points);
		this.sync();
	}

	/** Shift one mesh vertex by a delta and re-upload the position buffer. */
	nudgeVertex(index: number, dx: number, dy: number): void {
		this.deform.nudge(index, dx, dy);
		this.sync();
	}

	/** Return one vertex to rest, or every vertex when called without an index. */
	resetVertices(index?: number): void {
		this.deform.reset(index);
		this.sync();
	}
}
