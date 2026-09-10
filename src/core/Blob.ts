/**
 * A spreading volume field over a grid: a number per cell that creeps into its open
 * neighbours and thins out over time. Fire, gas, caustic ooze, flood water - anything
 * with a volume per cell.
 *
 * Deliberately dumber than a simulation: `mwg` holds the volumes and diffuses them, and
 * the game decides what a volume *means* (reading `cellsAbove` each turn to burn, poison
 * or corrode whoever stands there, or to drown whoever wades in). Per-creature timers
 * (`applyStatusEffect`) already cover "this victim burns for 3 turns"; this covers the
 * other half, "this *place* burns until it burns out".
 *
 * Renderer-free and module-free, so a game can lay volumes over any grid without pulling in
 * a terrain or combat module.
 *
 * @example
 * ```ts
 * import { Blob } from '@datamoc/mw_games/core';
 *
 * const fire = new Blob(20, 20);
 * fire.seed(5, 5, 10); // a fireball lands
 *
 * fire.spread((x, y) => x >= 0 && y >= 0 && x < 20 && y < 20, 0.25, 0.9); // one turn of spreading
 * for (const cell of fire.cellsAbove(0.5)) console.log('burning at', cell.x, cell.y);
 *
 * fire.clear(5, 5); // someone douses that one tile
 * ```
 */

/** the four axial neighbours of a cell, same order as `roguelike`'s square topology */
const OFFSET_4: ReadonlyArray<readonly [number, number]> = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
];

export class Blob {
	readonly width: number;
	readonly height: number;

	private volume: Float32Array;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.volume = new Float32Array(width * height);
	}

	/** the array index of `(x, y)`, or -1 when it lies off the grid */
	private index(x: number, y: number): number {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
		return y * this.width + x;
	}

	/** how much effect sits on `(x, y)` right now; 0 off-map */
	volumeAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? 0 : this.volume[i];
	}

	/** the total volume across the whole map - useful for "has it burned out yet" */
	total(): number {
		let sum = 0;
		for (let i = 0; i < this.volume.length; i++) sum += this.volume[i];
		return sum;
	}

	/** adds `amount` to whatever is already on `(x, y)`; off-map is a no-op */
	seed(x: number, y: number, amount: number): void {
		const i = this.index(x, y);
		if (i >= 0) this.volume[i] += amount;
	}

	/** zeroes whatever sits on `(x, y)`, leaving its neighbours alone; off-map is a no-op */
	clear(x: number, y: number): void {
		const i = this.index(x, y);
		if (i >= 0) this.volume[i] = 0;
	}

	/**
	 * One diffusion step: every cell shares `spread` of its volume equally among its open
	 * 4-neighbours (a cell with no open neighbour keeps it all), then every cell keeps only
	 * `decay` of what it ends up with. `decay: 1` conserves volume and only moves it around;
	 * anything lower thins the effect out over time. `open(x, y)` decides whether the effect
	 * may cross into a cell, so the caller chooses what blocks it.
	 */
	spread(open: (x: number, y: number) => boolean, spread = 0.25, decay = 0.9): void {
		const next = new Float32Array(this.volume.length);

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const here = y * this.width + x;
				const amount = this.volume[here];
				if (amount <= 0) continue;

				const neighbours: number[] = [];
				for (const [dx, dy] of OFFSET_4) {
					const nx = x + dx;
					const ny = y + dy;
					const i = this.index(nx, ny);
					if (i >= 0 && open(nx, ny)) neighbours.push(i);
				}

				if (neighbours.length === 0) {
					next[here] += amount;
				} else {
					const share = (amount * spread) / neighbours.length;
					next[here] += amount - share * neighbours.length;
					for (const cell of neighbours) next[cell] += share;
				}
			}
		}

		for (let i = 0; i < next.length; i++) {
			const kept = next[i] * decay;
			//snap float dust to zero so a burned-out effect actually reads as gone
			this.volume[i] = kept < 0.001 ? 0 : kept;
		}
	}

	/** every cell holding at least `minimum` - the cells a game applies its effect on */
	cellsAbove(minimum: number): Array<{ x: number; y: number; volume: number }> {
		const out: Array<{ x: number; y: number; volume: number }> = [];
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const volume = this.volume[y * this.width + x];
				if (volume >= minimum) out.push({ x, y, volume });
			}
		}
		return out;
	}

	toJSON(): { width: number; height: number; volume: number[] } {
		return { width: this.width, height: this.height, volume: [...this.volume] };
	}

	static fromJSON(data: { width: number; height: number; volume: number[] }): Blob {
		const blob = new Blob(data.width, data.height);
		blob.volume.set(data.volume.slice(0, blob.volume.length));
		return blob;
	}
}
