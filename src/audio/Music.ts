import { createAudio, type Playable } from './Playable.ts';

interface Fade {
	audio: Playable;
	elapsed: number;
	duration: number;
	from: number;
	to: number;
	stopAtEnd: boolean;
}

export interface MusicOptions {
	volume?: number;
	create?: (path: string) => Playable;
}

/**
 * Background music with crossfade: switching tracks fades the old one out and the new one
 * in over the same span, rather than cutting straight from one to the other. Like
 * `AnimatedSprite`, nothing advances on its own - call `update(dt)` from the scene.
 */
export class Music {
	private current: Playable | null = null;
	private fades: Fade[] = [];
	private create: (path: string) => Playable;
	volume: number;

	constructor(options: MusicOptions = {}) {
		this.volume = options.volume ?? 1;
		this.create = options.create ?? createAudio;
	}

	/** @param fadeDuration seconds; 0 switches immediately with no crossfade */
	play(path: string, fadeDuration = 1): void {
		const incoming = this.create(path);
		incoming.loop = true;

		const previous = this.current;
		this.current = incoming;

		if (fadeDuration <= 0) {
			incoming.volume = this.volume;
			// a rejection here means the switch itself (or the previous.pause() right below)
			// interrupted this play()'s own in-flight load - expected during a track switch,
			// so swallow it the standard way rather than let it surface as unhandled.
			void Promise.resolve(incoming.play()).catch(() => {});
			previous?.pause();
			return;
		}

		incoming.volume = 0;
		void Promise.resolve(incoming.play()).catch(() => {});
		this.fades.push({ audio: incoming, elapsed: 0, duration: fadeDuration, from: 0, to: this.volume, stopAtEnd: false });

		if (previous) {
			this.fades.push({
				audio: previous,
				elapsed: 0,
				duration: fadeDuration,
				from: previous.volume,
				to: 0,
				stopAtEnd: true,
			});
		}
	}

	stop(fadeDuration = 1): void {
		const audio = this.current;
		if (!audio) return;
		this.current = null;

		if (fadeDuration <= 0) {
			audio.pause();
			return;
		}
		this.fades.push({ audio, elapsed: 0, duration: fadeDuration, from: audio.volume, to: 0, stopAtEnd: true });
	}

	update(dt: number): void {
		//iterate a copy: a fade finishing may not touch the list, but this stays safe if one day it does
		for (const fade of [...this.fades]) {
			fade.elapsed += dt;
			const t = Math.min(1, fade.elapsed / fade.duration);
			fade.audio.volume = fade.from + (fade.to - fade.from) * t;

			if (t >= 1) {
				this.fades.splice(this.fades.indexOf(fade), 1);
				if (fade.stopAtEnd) {
					fade.audio.pause();
					fade.audio.currentTime = 0;
				}
			}
		}
	}
}
