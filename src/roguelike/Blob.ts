import { neighbourOffsets } from './Level.ts';

/**
 * A spreading area effect over the grid: fire, gas, caustic ooze - anything with a
 * volume per cell that creeps into its neighbours and thins out over time.
 *
 * Deliberately dumber than a simulation: `mwg` holds the volumes and diffuses them, and
 * the game decides what a volume *means* (reading `cellsAbove` each turn to burn, poison
 * or corrode whoever stands there). Per-creature timers (`applyStatusEffect`) already
 * cover "this victim burns for 3 turns"; this covers the other half, "this *place*
 * burns until it burns out".
 */

export class Blob {
	readonly width: number;
	readonly height: number;

	private volume: Float32Array;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		this.volume = new Float32Array(width * height);
	}

	/** how much effect sits on `(x, y)` right now; 0 off-map */
	volumeAt(x: number, y: number): number {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
		return this.volume[y * this.width + x];
	}

	/** the total volume across the whole map - useful for "has it burned out yet" */
	total(): number {
		let sum = 0;
		for (let i = 0; i < this.volume.length; i++) sum += this.volume[i];
		return sum;
	}

	/** adds `amount` to whatever is already on `(x, y)`; off-map is a no-op */
	seed(x: number, y: number, amount: number): void {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		this.volume[y * this.width + x] += amount;
	}

	/**
	 * One diffusion step: every cell shares `spread` of its volume equally among its
	 * passable 4-neighbours (a cell with no open neighbour keeps it all), then every
	 * cell keeps only `decay` of what it ends up with. `decay: 1` conserves volume and
	 * only moves it around; anything lower thins the effect out over time.
	 */
	spread(passable: (x: number, y: number) => boolean, spread = 0.25, decay = 0.9): void {
		const next = new Float32Array(this.volume.length);

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const here = y * this.width + x;
				const amount = this.volume[here];
				if (amount <= 0) continue;

				const open: number[] = [];
				for (const [dx, dy] of neighbourOffsets(4)) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
					if (passable(nx, ny)) open.push(ny * this.width + nx);
				}

				if (open.length === 0) {
					next[here] += amount;
				} else {
					const share = (amount * spread) / open.length;
					next[here] += amount - share * open.length;
					for (const cell of open) next[cell] += share;
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
