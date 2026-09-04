/**
 * One wave: `entries` spawn spread evenly across `duration` seconds, starting `delay`
 * seconds after the spawner itself starts (not after the previous wave ends - waves may
 * overlap, which is exactly what a game escalating toward a boss often wants).
 */
export interface Wave<T> {
	delay: number;
	entries: readonly { kind: T; count: number }[];

	/** spread `entries` across this many seconds; 0 (the default) spawns them all at once */
	duration?: number;
}

export interface SpawnerOptions<T> {
	waves: readonly Wave<T>[];
	onSpawn: (kind: T) => void;

	/** fires once, the moment the first entry of a wave actually spawns */
	onWaveStart?: (waveIndex: number) => void;

	/** fires once every scheduled spawn across every wave has happened */
	onComplete?: () => void;
}

interface ScheduledSpawn<T> {
	time: number;
	kind: T;
	waveIndex: number;
}

/**
 * A `dt`-driven timer for escalating, timed spawning - "wave 3 starts at t+45s, spawns 8 of
 * kind A and 2 of kind B over the next 10s" - distinct in shape from `roguelike.Scheduler`,
 * which orders whose turn it is by energy cost and has no concept of real time at all. Not
 * specific to tower defense: any game with escalating timed spawns (a horde mode, a survival
 * minigame) wants the same primitive.
 *
 * The whole schedule is flattened and sorted once, at construction, rather than tracked wave
 * by wave - simpler to get right, and cheap enough that a spawner is not something a game
 * expects to have thousands of.
 */
export class Spawner<T> {
	private schedule: ScheduledSpawn<T>[] = [];
	private cursor = 0;
	private elapsed = 0;
	//a Set, not a single "last" index - overlapping waves (see the Wave doc) interleave in
	//the time-sorted schedule, so a wave already started can recur after a different one's
	//entry sorts between two of its own
	private startedWaves = new Set<number>();
	private completed = false;

	private onSpawn: (kind: T) => void;
	private onWaveStart?: (waveIndex: number) => void;
	private onComplete?: () => void;

	constructor(options: SpawnerOptions<T>) {
		this.onSpawn = options.onSpawn;
		this.onWaveStart = options.onWaveStart;
		this.onComplete = options.onComplete;

		options.waves.forEach((wave, waveIndex) => {
			const total = wave.entries.reduce((sum, entry) => sum + entry.count, 0);
			const duration = wave.duration ?? 0;

			let i = 0;
			for (const entry of wave.entries) {
				for (let n = 0; n < entry.count; n++, i++) {
					const spread = total > 1 && duration > 0 ? (i / (total - 1)) * duration : 0;
					this.schedule.push({ time: wave.delay + spread, kind: entry.kind, waveIndex });
				}
			}
		});

		this.schedule.sort((a, b) => a.time - b.time);
		if (this.schedule.length === 0) {
			this.completed = true;
			this.onComplete?.();
		}
	}

	update(dt: number): void {
		if (this.completed) return;
		this.elapsed += dt;

		while (this.cursor < this.schedule.length && this.schedule[this.cursor].time <= this.elapsed) {
			const spawn = this.schedule[this.cursor];
			if (!this.startedWaves.has(spawn.waveIndex)) {
				this.startedWaves.add(spawn.waveIndex);
				this.onWaveStart?.(spawn.waveIndex);
			}
			this.onSpawn(spawn.kind);
			this.cursor++;
		}

		if (this.cursor >= this.schedule.length) {
			this.completed = true;
			this.onComplete?.();
		}
	}

	/** true once every scheduled spawn has happened */
	get isComplete(): boolean {
		return this.completed;
	}
}
