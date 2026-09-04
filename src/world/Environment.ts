import { Signal } from '../core/Signal.ts';

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export interface EnvironmentSnapshot {
	day: number;
	seconds: number;
	phase: DayPhase;
	weather: string;
}

export interface EnvironmentOptions {
	/** Length of one day in seconds. */
	dayLength?: number;
	startSeconds?: number;
	startWeather?: string;
	/** Four phase boundaries as fractions of a day, in dawn/day/dusk/night order. */
	phaseBoundaries?: readonly [number, number, number];
}

/** A continuous world clock that maps elapsed time to day phase and weather. */
export class EnvironmentClock {
	readonly changed = new Signal<EnvironmentSnapshot>();
	readonly dayLength: number;
	private seconds_: number;
	private weather_: string;
	private boundaries: readonly [number, number, number];

	constructor(options: EnvironmentOptions = {}) {
		this.dayLength = options.dayLength ?? 120;
		if (!(this.dayLength > 0)) throw new Error('an environment day must be longer than zero seconds');
		this.boundaries = options.phaseBoundaries ?? [0.2, 0.7, 0.8];
		if (this.boundaries[0] <= 0 || this.boundaries[0] >= this.boundaries[1] || this.boundaries[1] >= this.boundaries[2] || this.boundaries[2] >= 1) {
			throw new Error('environment phase boundaries must be ascending fractions strictly between 0 and 1');
		}
		this.seconds_ = options.startSeconds ?? 0;
		this.weather_ = options.startWeather ?? 'clear';
		if (!Number.isFinite(this.seconds_)) throw new Error('environment startSeconds must be finite');
	}

	get day(): number { return Math.floor(this.seconds_ / this.dayLength); }
	get seconds(): number { return this.seconds_; }
	get weather(): string { return this.weather_; }
	get phase(): DayPhase {
		const fraction = ((this.seconds_ % this.dayLength) + this.dayLength) % this.dayLength / this.dayLength;
		if (fraction < this.boundaries[0]) return 'dawn';
		if (fraction < this.boundaries[1]) return 'day';
		if (fraction < this.boundaries[2]) return 'dusk';
		return 'night';
	}
	get night(): boolean { return this.phase === 'night'; }

	advance(seconds: number): EnvironmentSnapshot {
		if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`environment advance must be non-negative, got ${seconds}`);
		this.seconds_ += seconds;
		const snapshot = this.snapshot();
		this.changed.dispatch(snapshot);
		return snapshot;
	}

	setWeather(weather: string): EnvironmentSnapshot {
		if (!weather) throw new Error('weather needs a non-empty id');
		this.weather_ = weather;
		const snapshot = this.snapshot();
		this.changed.dispatch(snapshot);
		return snapshot;
	}

	snapshot(): EnvironmentSnapshot {
		return { day: this.day, seconds: this.seconds_, phase: this.phase, weather: this.weather_ };
	}

	static restore(options: EnvironmentOptions, snapshot: EnvironmentSnapshot): EnvironmentClock {
		return new EnvironmentClock({ ...options, startSeconds: snapshot.seconds, startWeather: snapshot.weather });
	}
}
