/** Grid size and dynamics for `Cloth`. The top row is the pinned attachment edge. */
export interface ClothOptions {
	/** rest width in world units; must be finite and above 0 */
	width: number;
	/** rest height in world units; must be finite and above 0 */
	height: number;
	/** quads across; an integer of at least 1 (points across are `segmentsX + 1`) */
	segmentsX: number;
	/** quads down; an integer of at least 1 (points down are `segmentsY + 1`) */
	segmentsY: number;
	/** how much of each constraint error one relaxation pass removes, 0 to 1; default 0.9 */
	stiffness?: number;
	/** share of velocity lost per update, 0 to 1; default 0.02 */
	damping?: number;
	/** acceleration in world units per second squared; default `{ x: 0, y: 0 }` */
	gravity?: { x: number; y: number };
	/** acceleration in world units per second squared; default `{ x: 0, y: 0 }` */
	wind?: { x: number; y: number };
}

function assertFinitePair(value: { x: number; y: number } | undefined, name: string): { x: number; y: number } {
	const pair = value ?? { x: 0, y: 0 };
	if (!Number.isFinite(pair.x) || !Number.isFinite(pair.y)) {
		throw new RangeError(`a cloth ${name} needs finite coordinates, saw (${pair.x}, ${pair.y})`);
	}
	return { x: pair.x, y: pair.y };
}

/**
 * A small pinned-point cloth mesh: Verlet integration over a grid of points joined by
 * structural distance constraints, the top row pinned by default. Renderer-free arithmetic
 * (roadmap 423): no physics engine, no allocations per step, deterministic for a fixed
 * `update(dt)` sequence, so a frame budget is exact rather than hoped for - one update
 * costs O(points + links), two relaxation passes over structural links only, never shear
 * or bend constraints and never a full cloth simulator. A skirt, tunic or scarf follows
 * its character with a slight lag; `ClothSprite` draws the mesh on the GPU path 414 ships.
 *
 * @example
 * ```ts
 * import { Cloth } from '@datamoc/mw_games/physics';
 *
 * const scarf = new Cloth({ width: 60, height: 20, segmentsX: 6, segmentsY: 2, gravity: { x: 0, y: 900 } });
 * for (let i = 0; i < 60; i++) scarf.update(1 / 60); // one fixed second
 * console.log(scarf.pointPosition(scarf.indexOf(3, 2)).y > 20); // true - the free end sags down
 * console.log(scarf.pointPosition(scarf.indexOf(0, 0))); // { x: 0, y: 0 } - the pinned edge never moves
 * ```
 */
export class Cloth {
	readonly segmentsX: number;
	readonly segmentsY: number;
	readonly stiffness: number;
	readonly damping: number;
	private gravity: { x: number; y: number };
	private wind: { x: number; y: number };
	private readonly rest: Float32Array;
	private readonly positions: Float32Array;
	private readonly previous: Float32Array;
	private readonly pinned: Uint8Array;
	private readonly links: Array<readonly [number, number, number]>;

	constructor(options: ClothOptions) {
		if (!Number.isFinite(options.width) || options.width <= 0) {
			throw new RangeError(`a cloth needs width above 0, saw ${options.width}`);
		}
		if (!Number.isFinite(options.height) || options.height <= 0) {
			throw new RangeError(`a cloth needs height above 0, saw ${options.height}`);
		}
		for (const key of ['segmentsX', 'segmentsY'] as const) {
			if (!Number.isInteger(options[key]) || options[key] < 1) {
				throw new RangeError(`a cloth needs integer ${key} of at least 1, saw ${options[key]}`);
			}
		}
		const stiffness = options.stiffness ?? 0.9;
		if (!Number.isFinite(stiffness) || stiffness < 0 || stiffness > 1) {
			throw new RangeError(`a cloth needs stiffness between 0 and 1, saw ${stiffness}`);
		}
		const damping = options.damping ?? 0.02;
		if (!Number.isFinite(damping) || damping < 0 || damping > 1) {
			throw new RangeError(`a cloth needs damping between 0 and 1, saw ${damping}`);
		}
		this.segmentsX = options.segmentsX;
		this.segmentsY = options.segmentsY;
		this.stiffness = stiffness;
		this.damping = damping;
		this.gravity = assertFinitePair(options.gravity, 'gravity');
		this.wind = assertFinitePair(options.wind, 'wind');
		const count = this.pointCount;
		this.rest = new Float32Array(count * 2);
		this.positions = new Float32Array(count * 2);
		this.previous = new Float32Array(count * 2);
		this.pinned = new Uint8Array(count);
		this.links = [];
		const stepX = options.width / options.segmentsX;
		const stepY = options.height / options.segmentsY;
		for (let row = 0; row <= options.segmentsY; row++) {
			for (let column = 0; column <= options.segmentsX; column++) {
				const index = this.indexOf(column, row);
				this.rest[index * 2] = column * stepX;
				this.rest[index * 2 + 1] = row * stepY;
				//the top edge is the attachment: a waistband, a held scarf end, a curtain rail
				if (row === 0) this.pinned[index] = 1;
			}
		}
		this.reset();
		const at = (column: number, row: number): number => this.indexOf(column, row);
		for (let row = 0; row <= options.segmentsY; row++) {
			for (let column = 0; column < options.segmentsX; column++) {
				this.links.push([at(column, row), at(column + 1, row), stepX]);
			}
		}
		for (let row = 0; row < options.segmentsY; row++) {
			for (let column = 0; column <= options.segmentsX; column++) {
				this.links.push([at(column, row), at(column, row + 1), stepY]);
			}
		}
	}

	/** how many simulated points the mesh holds */
	get pointCount(): number {
		return (this.segmentsX + 1) * (this.segmentsY + 1);
	}

	/** the flat index of the point at `(column, row)`; throws a RangeError outside the grid */
	indexOf(column: number, row: number): number {
		if (
			!Number.isInteger(column) ||
			!Number.isInteger(row) ||
			column < 0 ||
			row < 0 ||
			column > this.segmentsX ||
			row > this.segmentsY
		) {
			throw new RangeError(
				`cloth point (${column}, ${row}) is outside a ${this.segmentsX + 1}x${this.segmentsY + 1} grid`,
			);
		}
		return row * (this.segmentsX + 1) + column;
	}

	private checkIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.pointCount) {
			throw new RangeError(`cloth point ${index} does not exist`);
		}
	}

	/** the current position of one point */
	pointPosition(index: number): { x: number; y: number } {
		this.checkIndex(index);
		return { x: this.positions[index * 2], y: this.positions[index * 2 + 1] };
	}

	/** whether a point is pinned (integration and relaxation both leave it alone) */
	isPinned(index: number): boolean {
		this.checkIndex(index);
		return this.pinned[index] === 1;
	}

	/** index pairs joined by a structural constraint, row links then column links, for drawing the mesh */
	pointLinks(): Array<readonly [number, number]> {
		return this.links.map(([a, b]) => [a, b] as const);
	}

	/** pin a point where it currently stands */
	pinPoint(index: number): void {
		this.checkIndex(index);
		this.pinned[index] = 1;
		this.previous[index * 2] = this.positions[index * 2];
		this.previous[index * 2 + 1] = this.positions[index * 2 + 1];
	}

	/** release a pinned point; it keeps its current position and moves from there */
	unpinPoint(index: number): void {
		this.checkIndex(index);
		this.pinned[index] = 0;
	}

	/** replace the wind acceleration; validated, so a gust can never smuggle in a NaN */
	setWind(x: number, y: number): void {
		const pair = assertFinitePair({ x, y }, 'wind');
		this.wind = pair;
	}

	/** replace the gravity acceleration */
	setGravity(x: number, y: number): void {
		const pair = assertFinitePair({ x, y }, 'gravity');
		this.gravity = pair;
	}

	/** put every point back at rest with no velocity; pins are kept */
	reset(): void {
		this.positions.set(this.rest);
		this.previous.set(this.rest);
	}

	/** how many points currently sit away from their rest positions */
	movedCount(): number {
		let moved = 0;
		for (let index = 0; index < this.pointCount; index++) {
			if (this.positions[index * 2] !== this.rest[index * 2]) {
				moved++;
				continue;
			}
			if (this.positions[index * 2 + 1] !== this.rest[index * 2 + 1]) moved++;
		}
		return moved;
	}

	/**
	 * Write every current position into `into`, which must hold exactly
	 * `pointCount * 2` floats. The mesh side calls this with its GPU position array.
	 */
	writePositions(into: Float32Array): void {
		if (!(into instanceof Float32Array) || into.length !== this.positions.length) {
			throw new RangeError(
				`a cloth target needs a Float32Array of ${this.positions.length} floats, saw length ${into?.length}`,
			);
		}
		into.set(this.positions);
	}

	/**
	 * Advance the mesh by `dt` seconds: one Verlet integration pass, then two relaxation
	 * passes over the structural links. Call with a fixed `dt` (a `FixedStepper` does that)
	 * for a deterministic sequence; keep it small (60 Hz steps), since Verlet answers a
	 * huge step with a huge swing rather than an error. A zero `dt` holds still; a negative
	 * or non-finite one throws a RangeError.
	 */
	update(dt: number): void {
		if (!Number.isFinite(dt) || dt < 0) {
			throw new RangeError(`a cloth update needs dt of at least 0, saw ${dt}`);
		}
		if (dt === 0) return;
		const keep = 1 - this.damping;
		const ax = (this.gravity.x + this.wind.x) * dt * dt;
		const ay = (this.gravity.y + this.wind.y) * dt * dt;
		const { positions, previous, pinned } = this;
		for (let index = 0; index < this.pointCount; index++) {
			if (pinned[index] === 1) continue;
			const x = positions[index * 2];
			const y = positions[index * 2 + 1];
			positions[index * 2] = x + (x - previous[index * 2]) * keep + ax;
			positions[index * 2 + 1] = y + (y - previous[index * 2 + 1]) * keep + ay;
			previous[index * 2] = x;
			previous[index * 2 + 1] = y;
		}
		//two passes are the whole solver: enough to hold a hem together, few enough to budget
		for (let pass = 0; pass < 2; pass++) this.relax();
	}

	private relax(): void {
		const { positions, pinned, stiffness } = this;
		if (stiffness === 0) return;
		for (const [a, b, rest] of this.links) {
			const dx = positions[b * 2] - positions[a * 2];
			const dy = positions[b * 2 + 1] - positions[a * 2 + 1];
			const distance = Math.hypot(dx, dy);
			if (distance === 0) continue;
			const error = ((distance - rest) / distance) * stiffness;
			const aPinned = pinned[a] === 1;
			const bPinned = pinned[b] === 1;
			if (aPinned && bPinned) continue;
			//an anchored end takes the whole correction so the free end does the travelling
			const aShare = aPinned ? 0 : bPinned ? 1 : 0.5;
			const bShare = bPinned ? 0 : aPinned ? 1 : 0.5;
			positions[a * 2] += dx * error * aShare;
			positions[a * 2 + 1] += dy * error * aShare;
			positions[b * 2] -= dx * error * bShare;
			positions[b * 2 + 1] -= dy * error * bShare;
		}
	}
}
