import { FOV } from 'rot-js';
import type { Level } from './Level.ts';
import { hexRange, hexLine } from '../core/Hex.ts';

/**
 * What the player can see, and what they remember seeing.
 *
 * Two sets, because a roguelike map has three states and not two: lit and in view,
 * remembered but not currently seen, and never visited. The middle one is the whole reason
 * exploring a dungeon feels like exploring — the map you have built stays on screen while
 * what is happening on it does not.
 *
 * The shadowcasting itself comes from rot.js on a square `Level`, which has had these edge
 * cases beaten out of it over years - what is here around it is the memory. rot.js has
 * nothing hex-shaped, so a hex `Level` instead traces a straight line (`hexLine`) to every
 * cell in range and lights it if nothing along the way is opaque: simple line-of-sight,
 * deliberately not true shadowcasting, which is the v1 this roadmap item commits to.
 */
export class FieldOfView {
	private level: Level;
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
	 */
	update(x: number, y: number, radius: number): void {
		this.visible.clear();
		this.light.clear();

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

			const distance = line.length - 1;
			const cell = this.level.index(target.x, target.y);
			this.visible.add(cell);
			this.explored.add(cell);
			this.light.set(cell, radius === 0 ? 1 : Math.max(0, 1 - distance / (radius + 1)));
		}
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
