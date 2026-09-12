import type { Level } from './Level.ts';
import type { Step } from './Pathfinder.ts';
import { hexDistance, hexLine, hexRange } from '../core/Hex.ts';
import { Signal } from '../core/Signal.ts';

/**
 * How a target resolves into the cells it actually affects.
 *
 * `single` is a dagger throw or a bolt from a wand - only the cell aimed at. `burst` is an
 * explosion or a cloud, centred on the target rather than the thrower. `line` is a beam or a
 * spear thrust - everything between thrower and target, not just where it lands. `cone` is a
 * breath or a spray - widening with distance along the aim direction, `width` counting how
 * many cells wide the far end is.
 */
export type AreaShape =
	{ kind: 'single' } | { kind: 'burst'; radius: number } | { kind: 'line' } | { kind: 'cone'; width: number };

export interface TargetingOptions {
	/** how far the aim can reach, in cells (Chebyshev distance - the usual roguelike ruler) */
	range: number;

	/** whether a wall in the way blocks the shot; on by default, since most things do not arc */
	requireLineOfSight?: boolean;
}

/**
 * The straight-line ruler distance a roguelike uses: diagonals cost the same as a step.
 *
 * @example
 * ```ts
 * import { chebyshevDistance, traceLine, hasLineOfSight, canTarget, resolveArea, Level, WALL, FLOOR } from '@datamoc/mw_games/roguelike';
 *
 * const level = new Level(20, 20, [WALL, FLOOR], 1); // an open floor
 * const origin = { x: 2, y: 2 };
 * const target = { x: 8, y: 5 };
 *
 * chebyshevDistance(origin, target); // 6
 * traceLine(origin, target); // every cell the shot crosses
 * hasLineOfSight(level, origin, target); // true - nothing blocks it
 *
 * if (canTarget(level, origin, target, { range: 10 })) {
 *   const hit = resolveArea(origin, target, { kind: 'burst', radius: 2 });
 * }
 * ```
 */
export function chebyshevDistance(a: Step, b: Step): number {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Every cell a straight line crosses from `from` to `to`, `from` included and `to` included.
 *
 * Bresenham's algorithm, not a shadowcast: this answers "what is on the way to this exact
 * point", which is what aiming needs. `FieldOfView` answers "what can be seen from here at
 * all", a different question with a different (and pricier) algorithm.
 */
export function traceLine(from: Step, to: Step): Step[] {
	const points: Step[] = [];

	let x = from.x;
	let y = from.y;
	const dx = Math.abs(to.x - from.x);
	const dy = -Math.abs(to.y - from.y);
	const sx = from.x < to.x ? 1 : -1;
	const sy = from.y < to.y ? 1 : -1;
	let error = dx + dy;

	for (;;) {
		points.push({ x, y });
		if (x === to.x && y === to.y) break;

		const doubled = error * 2;
		if (doubled >= dy) {
			error += dy;
			x += sx;
		}
		if (doubled <= dx) {
			error += dx;
			y += sy;
		}
	}

	return points;
}

export type BallisticaStop = 'opaque' | 'impassable' | 'outside' | 'none';

export interface BallisticaOptions {
	/** what ends the path; the stopping cell is included in `cells` */
	stop?: BallisticaStop;
}

export interface BallisticaResult {
	/** cells from origin through the target or first stopping cell */
	cells: Step[];
	/** the first cell that satisfied `stop`, or null when the path reached its target */
	stop: Step | null;
}

/**
 * Traces a projectile-like path through a level and reports its first collision.
 *
 * Unlike `traceLine`, this understands the level topology and terrain. `opaque` is the
 * default for beams and sight, `impassable` is useful for movement and projectiles that can
 * cross transparent walls, and `outside` is useful when the requested target may be off-map.
 * The collision cell is included in `cells`, so a caller can apply an impact there before
 * deciding what the game should do with it.
 *
 * @example
 * ```ts
 * import { ballistica, Level, WALL, FLOOR } from '@datamoc/mw_games/roguelike';
 *
 * const level = new Level(10, 1, [WALL, FLOOR], 1);
 * const result = ballistica(level, { x: 0, y: 0 }, { x: 9, y: 0 }, { stop: 'opaque' });
 * console.log(result.cells, result.stop); // path and first blocking cell, if any
 * ```
 */
export function ballistica(level: Level, from: Step, to: Step, options: BallisticaOptions = {}): BallisticaResult {
	const line = level.shape === 'hex' ? hexLine(from, to) : traceLine(from, to);
	const stopMode = options.stop ?? 'opaque';
	const cells: Step[] = [];
	let stop: Step | null = null;

	for (const cell of line) {
		cells.push(cell);
		if (cells.length === 1 || stopMode === 'none') continue;
		const blocked =
			(stopMode === 'outside' && !level.inside(cell.x, cell.y)) ||
			(stopMode === 'opaque' && level.inside(cell.x, cell.y) && !level.transparent(cell.x, cell.y)) ||
			(stopMode === 'impassable' && level.inside(cell.x, cell.y) && !level.passable(cell.x, cell.y));
		if (blocked) {
			stop = cell;
			break;
		}
	}

	return { cells, stop };
}

/** true when nothing between `from` and `to` (both cells themselves excepted) blocks sight */
export function hasLineOfSight(level: Level, from: Step, to: Step): boolean {
	const line = level.shape === 'hex' ? hexLine(from, to) : traceLine(from, to);
	for (let i = 1; i < line.length - 1; i++) {
		if (!level.transparent(line[i].x, line[i].y)) return false;
	}
	return true;
}

/** whether `target` is a legal aim point from `origin`: in range, and in sight unless waived */
export function canTarget(level: Level, origin: Step, target: Step, options: TargetingOptions): boolean {
	const distance = level.shape === 'hex' ? hexDistance(origin, target) : chebyshevDistance(origin, target);
	if (distance > options.range) return false;
	if ((options.requireLineOfSight ?? true) && !hasLineOfSight(level, origin, target)) return false;
	return true;
}

/** the cells a shape actually affects, once aimed at `target` from `origin` */
export function resolveArea(origin: Step, target: Step, shape: AreaShape): Step[] {
	switch (shape.kind) {
		case 'single':
			return [target];

		case 'line':
			return traceLine(origin, target);

		case 'cone':
			return coneCells(origin, target, shape.width);

		case 'burst': {
			const cells: Step[] = [];
			const r = shape.radius;
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (dx * dx + dy * dy > r * r) continue;
					cells.push({ x: target.x + dx, y: target.y + dy });
				}
			}
			return cells;
		}
	}
}

/**
 * Resolves an area using the level's topology, including hex lines, cones and bursts.
 *
 * @example
 * ```ts
 * import { Level, FLOOR, resolveAreaOnLevel } from '@datamoc/mw_games/roguelike';
 * const level = new Level(8, 8, [{ passable: true, transparent: true }, FLOOR], 1, 'hex');
 * const cells = resolveAreaOnLevel(level, { x: 2, y: 2 }, { x: 4, y: 2 }, { kind: 'line' });
 * ```
 */
export function resolveAreaOnLevel(level: Level, origin: Step, target: Step, shape: AreaShape): Step[] {
	if (level.shape !== 'hex') return resolveArea(origin, target, shape);
	if (shape.kind === 'single') return [{ ...target }];
	if (shape.kind === 'line') return hexLine(origin, target);
	if (shape.kind === 'burst') return hexRange(target, shape.radius);
	return hexConeCells(origin, target, shape.width);
}

/**
 * A widening hex-grid cone, with `width` extra cells on each side at its far end.
 *
 * @example
 * ```ts
 * import { hexConeCells } from '@datamoc/mw_games/roguelike';
 * const cells = hexConeCells({ x: 2, y: 2 }, { x: 5, y: 2 }, 2);
 * ```
 */
export function hexConeCells(origin: Step, target: Step, width: number): Step[] {
	const distance = hexDistance(origin, target);
	if (distance === 0) return [{ ...origin }];
	const line = hexLine(origin, target);
	const cells: Step[] = [];
	for (let i = 1; i <= distance; i++) {
		const centre = line[i];
		const radius = Math.round((i / distance) * width);
		for (const cell of hexRange(centre, radius)) {
			if (hexDistance(origin, cell) === i) cells.push(cell);
		}
	}
	return cells;
}

/**
 * Every cell in a widening spray from `origin` towards `target`: the aim snaps to the
 * nearest of the 8 directions, the length is the distance aimed, and step `i` of `length`
 * spans `round(i / length * width)` cells to each side of the centre line. A width of 0
 * is a single-file beam, the same cells `line` would trace along that snapped direction.
 *
 * @example
 * ```ts
 * import { coneCells, chainTargets, knockbackPath, Level, WALL, FLOOR } from '@datamoc/mw_games/roguelike';
 *
 * const breath = coneCells({ x: 5, y: 5 }, { x: 5, y: 0 }, 3); // a dragon's breath, aimed north
 *
 * const monsters = [{ x: 5, y: 4 }, { x: 5, y: 3 }, { x: 6, y: 2 }];
 * const arc = chainTargets(monsters, { x: 5, y: 5 }, 3, 2); // a lightning bolt hopping between them
 *
 * const level = new Level(20, 20, [WALL, FLOOR], 1);
 * const shovedTo = knockbackPath(level, { x: 5, y: 5 }, { x: 1, y: 0 }, 3); // shoved 3 cells east
 * ```
 */
export function coneCells(origin: Step, target: Step, width: number): Step[] {
	const dx = target.x - origin.x;
	const dy = target.y - origin.y;
	const length = Math.max(Math.abs(dx), Math.abs(dy));
	if (length === 0) return [{ ...origin }];

	const stepX = Math.sign(dx);
	const stepY = Math.sign(dy);
	//perpendicular to the snapped direction: swapped for diagonals, single-axis otherwise
	const perpX = dx !== 0 && dy !== 0 ? stepX : stepY;
	const perpY = dx !== 0 && dy !== 0 ? -stepY : stepX;

	const cells: Step[] = [];
	for (let i = 1; i <= length; i++) {
		const cx = origin.x + stepX * i;
		const cy = origin.y + stepY * i;
		const half = Math.round((i / length) * width);
		for (let o = -half; o <= half; o++) cells.push({ x: cx + perpX * o, y: cy + perpY * o });
	}
	return cells;
}

export interface ConeSectorOptions {
	/** the full angle of the sector, in degrees; 0 is a single ray along the aim */
	degrees: number;

	/** how far a ray reaches, in cells */
	range: number;

	/**
	 * What ends a ray. The default `opaque` is what makes a wall stop the part of the cone
	 * behind it, which is the difference between a breath weapon and a laser through walls.
	 */
	stop?: BallisticaStop;
}

/** how finely `coneSector` spaces its rays: fine enough that no cell is stepped over at range */
const SECTOR_RAY_DEGREES = 0.5;

/**
 * Rounds an offset outwards from zero, unlike `Math.round`, whose half-up rule sends -2.5 to
 * -2 and 2.5 to 3. Rays are cast in mirrored pairs about the aim, so rounding has to be
 * mirrored too or the sector comes out a cell wider on one side than the other.
 */
function roundOffset(value: number): number {
	return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Every cell inside a circular sector: an arc of `degrees` centred on the aim, rays cast
 * across it every 0.5 degrees, each ray clamped to `range` and stopped by a wall. The union
 * of those rays is the sector, so a wall in the arc shadows everything behind it while the
 * rest of the cone still reaches.
 *
 * This is a different shape from `coneCells`, not a better one. A sector is aimed at an angle
 * and keeps it: a breath weapon, a searchlight, a blast of gas. `coneCells` snaps the aim to
 * one of the eight directions and widens a linear spray from it, which is what a wand fired
 * down a corridor wants. `coneSector` needs the level (that is what stops its rays), so it is
 * a plain function rather than one of `AreaShape`'s kinds, whose resolver must work without
 * one; a game calls it wherever it would call `resolveAreaOnLevel`. The aim's own cell is not
 * in the result, so a caster is never inside its own cone.
 *
 * @example
 * ```ts
 * import { coneSector, Level, WALL, FLOOR } from '@datamoc/mw_games/roguelike';
 *
 * const level = new Level(20, 20, [WALL, FLOOR], 1);
 * // a 60-degree cone, 6 cells deep, aimed east from (4, 10)
 * const cells = coneSector(level, { x: 4, y: 10 }, { x: 10, y: 10 }, { degrees: 60, range: 6 });
 * ```
 */
export function coneSector(level: Level, from: Step, to: Step, options: ConeSectorOptions): Step[] {
	if (!Number.isFinite(options.degrees) || options.degrees < 0) {
		throw new Error('a cone sector needs a finite non-negative angle in degrees');
	}
	if (!Number.isFinite(options.range) || options.range < 0) {
		throw new Error('a cone sector needs a finite non-negative range');
	}

	const dx = to.x - from.x;
	const dy = to.y - from.y;
	//no aim direction, no sector: the same answer the other cone shapes give for a self-aim
	if (dx === 0 && dy === 0) return [{ ...from }];

	const aim = Math.atan2(dy, dx);
	const half = (options.degrees * Math.PI) / 360;
	const rays = Math.max(1, Math.round(options.degrees / SECTOR_RAY_DEGREES));
	const stop = options.stop ?? 'opaque';

	const seen = new Set<number>();
	const cells: Step[] = [];
	for (let i = 0; i <= rays; i++) {
		const angle = aim - half + (2 * half * i) / rays;
		const end = {
			x: from.x + roundOffset(Math.cos(angle) * options.range),
			y: from.y + roundOffset(Math.sin(angle) * options.range),
		};
		for (const cell of ballistica(level, from, end, { stop }).cells) {
			if (cell.x === from.x && cell.y === from.y) continue;
			//a ray whose far end is off the map walks off it; only the on-map part is the sector
			if (!level.inside(cell.x, cell.y)) continue;
			const key = level.index(cell.x, cell.y);
			if (seen.has(key)) continue;
			seen.add(key);
			cells.push({ x: cell.x, y: cell.y });
		}
	}
	return cells;
}

/**
 * An arcing chain across `candidates`: starting from `origin`, each link is the nearest
 * not-yet-visited candidate within `range` of the previous one, up to `jumps` links. A
 * lightning arc, a contagion, anything that hops from one victim to the next rather than
 * travelling as a projectile - the game applies its own effect per link in order.
 */
export function chainTargets(candidates: readonly Step[], origin: Step, jumps: number, range: number): Step[] {
	const visited = new Set<number>();
	const chain: Step[] = [];
	let from = origin;

	for (let jump = 0; jump < jumps; jump++) {
		let best = -1;
		let bestDistance = range + 1;
		for (let i = 0; i < candidates.length; i++) {
			if (visited.has(i)) continue;
			const distance = chebyshevDistance(from, candidates[i]);
			if (distance <= range && distance < bestDistance) {
				bestDistance = distance;
				best = i;
			}
		}
		if (best === -1) break;
		visited.add(best);
		chain.push(candidates[best]);
		from = candidates[best];
	}
	return chain;
}

/**
 * A damage/effect multiplier keyed to range band - the "melee bonus, falls off at range" or
 * "point-blank penalty on a ranged weapon" family of modifiers many games attach to an attack
 * once its distance is known. `mwg` supplies no default bands or multipliers, only the lookup:
 * bands are checked in order, the first whose `max` is at or above `distance` applies, and a
 * distance past every band's `max` falls back to `beyond`.
 *
 * @example
 * ```ts
 * import { rangeMultiplier, areaFalloffMultiplier, type RangeBand } from '@datamoc/mw_games/roguelike';
 *
 * const bands: RangeBand[] = [{ max: 2, multiplier: 1.5 }, { max: 6, multiplier: 1 }];
 * rangeMultiplier(1, bands); // 1.5 - point-blank bonus
 * rangeMultiplier(10, bands, 0.5); // 0.5 - past every band, falls back to `beyond`
 *
 * areaFalloffMultiplier(0, [1, 0.5]); // 1 - first target hit, full damage
 * areaFalloffMultiplier(1, [1, 0.5]); // 0.5 - second target
 * ```
 */
export interface RangeBand {
	/** the greatest distance this band covers */
	max: number;
	multiplier: number;
}

export function rangeMultiplier(distance: number, bands: readonly RangeBand[], beyond = 1): number {
	for (const band of bands) {
		if (distance <= band.max) return band.multiplier;
	}
	return beyond;
}

/**
 * A per-target multiplier for an area effect hitting several targets at once, stepping down
 * (or up) by how many targets were already resolved before this one - "full damage to the
 * first target hit, half to every one after" is `areaFalloffMultiplier(index, [1, 0.5])`.
 * `index` is the target's zero-based order among everyone the area shape hit (`resolveArea`'s
 * own returned order is a natural source); an index past the end of `steps` repeats the last
 * step rather than falling back to full strength.
 */
export function areaFalloffMultiplier(index: number, steps: readonly number[]): number {
	if (steps.length === 0) return 1;
	return steps[Math.min(index, steps.length - 1)];
}

/**
 * The cells something shoved from `from` along `direction` (a unit step, one of the 8)
 * travels: every passable cell up to `distance`, stopping before the first impassable
 * one. The game moves the shoved actor to the last cell returned - or nowhere, when the
 * very first cell already blocks, in which case the shove lands against the wall instead.
 */
export function knockbackPath(level: Level, from: Step, direction: Step, distance: number): Step[] {
	const cells: Step[] = [];
	for (let i = 1; i <= distance; i++) {
		const at = { x: from.x + direction.x * i, y: from.y + direction.y * i };
		if (!level.passable(at.x, at.y)) break;
		cells.push(at);
	}
	return cells;
}

export interface TargetingControllerOptions {
	/** where the aim starts: the thrower's own cell */
	origin: Step;

	/** how far the aim reaches, in the owning shape's own ruler (`canTarget`'s) */
	range: number;

	/** whether a wall between origin and cursor blocks the aim; on by default */
	requireLineOfSight?: boolean;

	/** how a confirmed aim resolves into cells; a single cell by default */
	shape?: AreaShape;

	/** the cursor's first cell; defaults to `origin` */
	cursor?: Step;

	/**
	 * A game's own rule on top of range and sight (not through an ally, not an empty floor
	 * tile). The controller never guesses what is in a cell: only the game knows.
	 */
	validate?: (target: Step) => boolean;
}

/** What `TargetingController.confirm` returns, and what its `onConfirm` carries. Cells only. */
export interface TargetResult {
	readonly origin: Step;
	readonly target: Step;
	readonly shape: AreaShape;

	/** the cells the shape affects, resolved through the level's own topology */
	readonly cells: readonly Step[];
}

/**
 * The input-facing half of targeting: a cursor a player moves over cells, the range and
 * line-of-sight rule that decides whether the current aim is legal, an optional preview of
 * the shape, and a confirm/cancel result. It carries no renderer: `moveTo` takes a cell, so
 * a game converts its own pointer position through its own camera, and the controller hands
 * back cells for the game to draw and resolve. Legality beyond range and sight is the
 * optional `validate` hook's job, and damage is never the controller's business.
 *
 * @example
 * ```ts
 * import { Level, FLOOR, WALL, TargetingController } from '@datamoc/mw_games/roguelike';
 *
 * const level = new Level(12, 12, [WALL, FLOOR], 1);
 * const aiming = new TargetingController(level, {
 *   origin: { x: 2, y: 2 },
 *   range: 6,
 *   shape: { kind: 'burst', radius: 1 },
 * });
 *
 * aiming.move(1, 0); // keyboard: one cell east
 * aiming.moveTo({ x: 5, y: 2 }); // pointer: the caller resolved the screen point first
 * console.log(aiming.valid); // in range and in sight
 * console.log(aiming.preview()); // the burst's cells, or [] while the aim is illegal
 *
 * const shot = aiming.confirm(); // null when illegal, the target cells when not
 * ```
 */
export class TargetingController {
	readonly onMove = new Signal<Step>();
	readonly onConfirm = new Signal<TargetResult>();
	readonly onCancel = new Signal<void>();

	private readonly level: Level;
	private readonly origin: Step;
	private readonly range: number;
	private readonly requireLineOfSight: boolean;
	private readonly validate?: (target: Step) => boolean;
	private shape: AreaShape;
	private cursor: Step;

	constructor(level: Level, options: TargetingControllerOptions) {
		if (!Number.isFinite(options.range) || options.range < 0) {
			throw new Error('targeting range must be a finite non-negative number');
		}
		this.level = level;
		this.origin = { ...options.origin };
		this.range = options.range;
		this.requireLineOfSight = options.requireLineOfSight ?? true;
		this.validate = options.validate;
		this.shape = options.shape ?? { kind: 'single' };
		this.cursor = { ...(options.cursor ?? options.origin) };
	}

	/** the cell the cursor is on now, as a copy - mutating it does not move the aim */
	get target(): Step {
		return { ...this.cursor };
	}

	/** how many cells the cursor is from the origin, in the level's own ruler */
	get distance(): number {
		return this.level.shape === 'hex'
			? hexDistance(this.origin, this.cursor)
			: chebyshevDistance(this.origin, this.cursor);
	}

	get inRange(): boolean {
		return this.distance <= this.range;
	}

	get inSight(): boolean {
		return hasLineOfSight(this.level, this.origin, this.cursor);
	}

	/** whether the current aim is legal: range, sight unless waived, and the game's own rule */
	get valid(): boolean {
		if (!this.inRange) return false;
		if (this.requireLineOfSight && !this.inSight) return false;
		return this.validate ? this.validate(this.cursor) : true;
	}

	/**
	 * Moves the cursor one cell, for keyboard and gamepad navigation. On a square level the
	 * offset is added directly; on a hex level it is looked up among the cursor's six
	 * neighbours, since only the level knows which offset means which direction there. A move
	 * that would leave the map is ignored rather than clamped to its edge.
	 */
	move(dx: number, dy: number): void {
		if (this.level.shape === 'hex') {
			const next = this.level
				.neighbors(this.cursor.x, this.cursor.y)
				.find((neighbor) => neighbor.x - this.cursor.x === dx && neighbor.y - this.cursor.y === dy);
			if (next) this.moveTo(next);
			return;
		}
		this.moveTo({ x: this.cursor.x + dx, y: this.cursor.y + dy });
	}

	/**
	 * Moves the cursor to a specific cell, for pointer navigation: the caller has already
	 * turned a screen point into a cell through its own camera. Off-map cells are ignored.
	 */
	moveTo(cell: Step): void {
		if (!this.level.inside(cell.x, cell.y)) return;
		this.cursor = { x: cell.x, y: cell.y };
		this.onMove.dispatch({ ...this.cursor });
	}

	/** Replaces the shape a confirm resolves to, keeping the cursor where it is. */
	setShape(shape: AreaShape): void {
		this.shape = shape;
	}

	/** The cells the current aim would affect, for a preview overlay; empty while illegal. */
	preview(): Step[] {
		if (!this.valid) return [];
		return resolveAreaOnLevel(this.level, this.origin, this.cursor, this.shape);
	}

	/** Returns the confirmed target, or null when the current aim is illegal. */
	confirm(): TargetResult | null {
		if (!this.valid) return null;
		const result: TargetResult = {
			origin: { ...this.origin },
			target: { ...this.cursor },
			shape: this.shape,
			cells: this.preview(),
		};
		this.onConfirm.dispatch(result);
		return result;
	}

	/** Abandons the aim without confirming; the game closes its own overlay on `onCancel`. */
	cancel(): void {
		this.onCancel.dispatch();
	}
}
