import type { Level } from './Level.ts';
import type { Step } from './Pathfinder.ts';

/**
 * How a target resolves into the cells it actually affects.
 *
 * `single` is a dagger throw or a bolt from a wand - only the cell aimed at. `burst` is an
 * explosion or a cloud, centred on the target rather than the thrower. `line` is a beam or a
 * spear thrust - everything between thrower and target, not just where it lands.
 */
export type AreaShape = { kind: 'single' } | { kind: 'burst'; radius: number } | { kind: 'line' };

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
