import { FOV } from 'rot-js';
import type { Level } from './Level.ts';

/**
 * What the player can see, and what they remember seeing.
 *
 * Two sets, because a roguelike map has three states and not two: lit and in view,
 * remembered but not currently seen, and never visited. The middle one is the whole reason
 * exploring a dungeon feels like exploring — the map you have built stays on screen while
 * what is happening on it does not.
 *
 * The shadowcasting itself comes from rot.js, which has had these edge cases beaten out of
 * it over years. What is here is the memory around it.
 */
export class FieldOfView {
	private level: Level;
	//rot.js exports FOV as an object of classes rather than a namespace, so the type of
	//an instance has to be derived from the constructor
	private fov: InstanceType<typeof FOV.PreciseShadowcasting>;

	/** cells currently in view */
	readonly visible = new Set<number>();

	/** cells ever seen, which is what gets drawn dim */
	readonly explored = new Set<number>();

	/** how bright each visible cell is, 0 to 1, by cell index */
	readonly light = new Map<number, number>();

	constructor(level: Level) {
		this.level = level;
		this.fov = new FOV.PreciseShadowcasting((x, y) => level.transparent(x, y));
	}

	/**
	 * Recomputes what is visible from a point.
	 *
	 * @param radius how far light reaches, in cells
	 */
	update(x: number, y: number, radius: number): void {
		this.visible.clear();
		this.light.clear();

		this.fov.compute(x, y, radius, (cx: number, cy: number, _r: number, visibility: number) => {
			if (!this.level.inside(cx, cy)) return;

			const cell = this.level.index(cx, cy);
			this.visible.add(cell);
			this.explored.add(cell);
			this.light.set(cell, visibility);
		});
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
