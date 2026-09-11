import { createAudio, type Playable } from './Playable.ts';
import { onCaption } from './Captions.ts';

export interface SoundOptions {
	/** overlapping instances before the oldest is reused; a footstep needs more than a shout */
	poolSize?: number;
	volume?: number;

	/** creates one playable instance for the resolved path; defaults to a real `Audio` element */
	create?: (path: string) => Playable;

	/** shown by a captioning overlay (via `Captions.onCaption`) every time this sound plays */
	caption?: string;
}

/**
 * A sound effect, pooled so the same clip can overlap itself. A dozen arrows landing in the
 * same second must not cut each other off, which a single `<audio>` element would - the
 * next play just steals the oldest of the pool, round-robin, rather than restarting the one
 * already mid-sound.
 *
 * @example
 * ```ts
 * import { Sound } from '@datamoc/mw_games/audio';
 *
 * const hit = new Sound('sounds/hit.mp3', { poolSize: 6, caption: 'a sword strikes' });
 * hit.play(); // safe to call several times in the same second
 * ```
 */
export class Sound {
	private pool: Playable[];
	private next = 0;
	private caption?: string;
	volume: number;

	constructor(path: string, options: SoundOptions = {}) {
		const size = Math.max(1, options.poolSize ?? 4);
		const create = options.create ?? createAudio;
		this.volume = options.volume ?? 1;
		this.caption = options.caption;
		this.pool = Array.from({ length: size }, () => create(path));
	}

	/**
	 * Plays one instance from the pool.
	 *
	 * @param gain multiplied into the sound's own volume, for a distance-attenuated one-shot
	 * (`Positional.SoundSource.playFor`); 1 leaves it at `volume`.
	 */
	play(gain = 1): void {
		const audio = this.pool[this.next];
		this.next = (this.next + 1) % this.pool.length;

		audio.volume = this.volume * gain;
		audio.currentTime = 0;
		// play() can return a Promise that rejects if this reuse interrupts its own prior,
		// still-loading play() (a real browser, not the fakes tests supply) - swallow it the
		// standard way, since restarting a pooled clip mid-load is expected here, not an error.
		void Promise.resolve(audio.play()).catch(() => {});

		if (this.caption) onCaption.dispatch({ text: this.caption });
	}

	stopAll(): void {
		for (const audio of this.pool) {
			audio.pause();
			audio.currentTime = 0;
		}
	}
}
