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

	play(): void {
		const audio = this.pool[this.next];
		this.next = (this.next + 1) % this.pool.length;

		audio.volume = this.volume;
		audio.currentTime = 0;
		void audio.play();

		if (this.caption) onCaption.dispatch({ text: this.caption });
	}

	stopAll(): void {
		for (const audio of this.pool) {
			audio.pause();
			audio.currentTime = 0;
		}
	}
}
