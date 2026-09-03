import { FOV } from 'rot-js';
import type { Level } from './Level.ts';
import type { Elevation } from './Elevation.ts';
import { hexRange, hexLine } from '../core/Hex.ts';
import { chebyshevDistance, traceLine } from './Targeting.ts';

/**
 * What the player can see, and what they remember seeing.
 *
 * Two sets, because a roguelike map has three states and not two: lit and in view,
 * remembered but not currently seen, and never visited. The middle one is the whole reason
 * exploring a dungeon feels like exploring: the map you have built stays on screen while
 * what is happening on it does not.
 *
 * The shadowcasting itself comes from rot.js on a square `Level`, which has had these edge
 * cases beaten out of it over years - what is here around it is the memory. rot.js has
 * nothing hex-shaped, so a hex `Level` instead traces a straight line (`hexLine`) to every
 * cell in range and lights it if nothing along the way is opaque: simple line-of-sight,
 * deliberately not true shadowcasting, which is the v1 this roadmap item commits to.
 */
/**
 * Sight from a height: the viewer's elevation, for maps with an `Elevation`.
 *
 * A cliff hides what is behind it from below but not from above - an intervening
 * cell blocks exactly when it rises above both ends of the gaze. `height`
 * defaults to the height of the cell stood on; a flying or perched viewer passes
 * its own.
 */
export interface HeightSight {
	heights: Elevation;
	height?: number;
}

export class FieldOfView {	private level: Level;
	//rot.js exports FOV as an object of classes rather than a namespace, so the type of
	//an instance has to be derived from the constructor
	private fov: InstanceType<typeof FOV.PreciseShadowcasting> | null;

	/** cells currently in view */
	readonly visible = new Set<number>();

	/** cells ever seen, which is what gets drawn dim */
	readonly explored = new Set<number>();

	/** how bright each visible cell is, 0 to 1, by cell index */
	readonly light = new Map<number, number>();

	constructor(level: Level) {
		this.level = level;
		this.fov = level.shape === 'hex' ? null : new FOV.PreciseShadowcasting((x, y) => level.transparent(x, y));
	}

	/**
	 * Recomputes what is visible from a point.
	 *
	 * @param radius how far light reaches, in cells
	 * @param sight when given, sight is height-aware: every cell in range is
	 * tested along the straight line to it, blocked by opaque terrain or by a
	 * cell rising above viewer and target alike. That is line-of-sight per cell
	 * rather than shadowcasting, so its edges deliberately disagree with the
	 * flat computation in the same way targeting already does - rot.js's
	 * callback only ever sees the blocking cell, never the target, so the
	 * viewer-relative rule cannot live inside it.
	 */
	update(x: number, y: number, radius: number, sight?: HeightSight): void {
		this.visible.clear();
		this.light.clear();

		if (sight) {
			this.updateFromHeight(x, y, radius, sight);
			return;
		}

		if (this.fov) {
			this.fov.compute(x, y, radius, (cx: number, cy: number, _r: number, visibility: number) => {
				if (!this.level.inside(cx, cy)) return;

				const cell = this.level.index(cx, cy);
				this.visible.add(cell);
				this.explored.add(cell);
				this.light.set(cell, visibility);
			});
			return;
		}

		const center = { x, y };
		for (const target of hexRange(center, radius)) {
			if (!this.level.inside(target.x, target.y)) continue;

			const line = hexLine(center, target);
			//every cell between the two ends must be transparent; the two ends themselves
			//need not be, the same rule `hasLineOfSight` uses for a square grid
			const blocked = line
				.slice(1, -1)
				.some((cell) => !this.level.inside(cell.x, cell.y) || !this.level.transparent(cell.x, cell.y));
			if (blocked) continue;

			this.lightCell(target.x, target.y, line.length - 1, radius);
		}
	}

	/** lights one visible cell with the usual distance falloff */
	private lightCell(x: number, y: number, distance: number, radius: number): void {
		const cell = this.level.index(x, y);
		this.visible.add(cell);
		this.explored.add(cell);
		this.light.set(cell, radius === 0 ? 1 : Math.max(0, 1 - distance / (radius + 1)));
	}

	/** height-aware sight for both shapes: one straight line per cell, one rule for cliffs */
	private updateFromHeight(x: number, y: number, radius: number, sight: HeightSight): void {
		const viewer = sight.height ?? sight.heights.heightAt(x, y);
		const center = { x, y };

		if (this.level.shape === 'hex') {
			for (const target of hexRange(center, radius)) {
				if (!this.level.inside(target.x, target.y)) continue;
				const line = hexLine(center, target);
				if (this.heightBlocked(line, sight.heights, viewer, sight.heights.heightAt(target.x, target.y))) continue;
				this.lightCell(target.x, target.y, line.length - 1, radius);
			}
			return;
		}

		for (let ty = y - radius; ty <= y + radius; ty++) {
			for (let tx = x - radius; tx <= x + radius; tx++) {
				if (!this.level.inside(tx, ty)) continue;
				if (chebyshevDistance(center, { x: tx, y: ty }) > radius) continue;
				const line = traceLine(center, { x: tx, y: ty });
				if (this.heightBlocked(line, sight.heights, viewer, sight.heights.heightAt(tx, ty))) continue;
				this.lightCell(tx, ty, line.length - 1, radius);
			}
		}
	}

	/**
	 * Whether anything between the line's ends blocks a gaze from `viewer` height
	 * to `target` height: opaque terrain always does, and so does a cell rising
	 * above them both. Heights only ever add blocking - a wall still reads as a
	 * wall from above.
	 */
	private heightBlocked(
		line: Array<{ x: number; y: number }>,
		heights: Elevation,
		viewer: number,
		target: number
	): boolean {
		const top = Math.max(viewer, target);
		for (let i = 1; i < line.length - 1; i++) {
			const cell = line[i];
			if (!this.level.inside(cell.x, cell.y) || !this.level.transparent(cell.x, cell.y)) return true;
			if (heights.heightAt(cell.x, cell.y) > top) return true;
		}
		return false;
	}

	isVisible(x: number, y: number): boolean {
		return this.visible.has(this.level.index(x, y));
	}

	isExplored(x: number, y: number): boolean {
		return this.explored.has(this.level.index(x, y));
	}

	/** how lit a cell is right now, 0 when out of view */
	lightAt(x: number, y: number): number {
		return this.light.get(this.level.index(x, y)) ?? 0;
	}

	/** forgets everything, as a new floor should */
	reset(): void {
		this.visible.clear();
		this.explored.clear();
		this.light.clear();
	}

	/** reveals the whole map, for a magic mapping effect or a debug view */
	revealAll(): void {
		for (let i = 0; i < this.level.cellCount; i++) this.explored.add(i);
	}
}
