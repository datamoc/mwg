import type { Level } from './Level.ts';

/**
 * A discrete height per cell: raised platforms, cliffs, pits.
 *
 * A sidecar like `Secrets` and `Doors`, holding the `Level` it belongs to rather
 * than living inside it - the still-fundamentally-2D map gains a height value,
 * not a third axis. Every cell starts at 0, the ground everything else is
 * measured against; negative heights are pits, for whatever a game makes of them.
 *
 * What reads it: `FieldOfView.update` takes heights to block sight asymmetrically
 * (a cliff hides what is behind it from below, but not from above), and
 * `Pathfinder` takes heights with a climb limit. What does not: `TileMap` draws
 * tiles where the grid says, and sprites stand where the game puts them - a
 * raised cell *looks* raised because the game offsets its occupants' sprites
 * upward by their height, which is presentation, not pathing, and lives game-side.
 */
export class Elevation {
	private readonly level: Level;
	private readonly heights: Int32Array;

	constructor(level: Level) {
		this.level = level;
		this.heights = new Int32Array(level.cellCount);
	}

	/** the height of a cell; off the map reads as ground (walking there is refused by `Level` itself) */
	heightAt(x: number, y: number): number {
		if (!this.level.inside(x, y)) return 0;
		return this.heights[this.level.index(x, y)];
	}

	/** raises or lowers one cell - heights are whole levels, not fractions */
	set(x: number, y: number, height: number): void {
		if (!Number.isInteger(height)) {
			throw new Error(`a cell's height must be a whole number, got ${height}`);
		}
		if (!this.level.inside(x, y)) return;
		this.heights[this.level.index(x, y)] = height;
	}
}
