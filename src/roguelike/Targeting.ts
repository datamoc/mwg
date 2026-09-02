import type { Level } from './Level.ts';
import type { Step } from './Pathfinder.ts';

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
	| { kind: 'single' }
	| { kind: 'burst'; radius: number }
	| { kind: 'line' }
	| { kind: 'cone'; width: number };

export interface TargetingOptions {
	/** how far the aim can reach, in cells (Chebyshev distance - the usual roguelike ruler) */
	range: number;

	/** whether a wall in the way blocks the shot; on by default, since most things do not arc */
	requireLineOfSight?: boolean;
}

/** the straight-line ruler distance a roguelike uses: diagonals cost the same as a step */
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

/** true when nothing between `from` and `to` (both cells themselves excepted) blocks sight */
export function hasLineOfSight(level: Level, from: Step, to: Step): boolean {
	const line = traceLine(from, to);
	for (let i = 1; i < line.length - 1; i++) {
		if (!level.transparent(line[i].x, line[i].y)) return false;
	}
	return true;
}

/** whether `target` is a legal aim point from `origin`: in range, and in sight unless waived */
export function canTarget(level: Level, origin: Step, target: Step, options: TargetingOptions): boolean {
	if (chebyshevDistance(origin, target) > options.range) return false;
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
 * Every cell in a widening spray from `origin` towards `target`: the aim snaps to the
 * nearest of the 8 directions, the length is the distance aimed, and step `i` of `length`
 * spans `round(i / length * width)` cells to each side of the centre line. A width of 0
 * is a single-file beam, the same cells `line` would trace along that snapped direction.
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
