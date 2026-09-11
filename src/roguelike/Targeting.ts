import type { Level } from './Level.ts';
import type { Step } from './Pathfinder.ts';
import { hexDistance, hexLine, hexRange } from '../core/Hex.ts';

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
