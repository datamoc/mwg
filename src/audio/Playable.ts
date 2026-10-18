import * as Resources from '../assets/paths.ts';

/**
 * The surface `mwg/audio` needs from a playing sound - exactly what `HTMLAudioElement`
 * already provides, named here so a test (or a game with its own audio backend) can supply
 * a fake without a real `Audio` element existing, which nothing outside a browser can
 * create.
 *
 * A backend that synthesises its sound instead of decoding a file (see `StreamPlayable`) has to
 * answer the questions `HTMLAudioElement` answers implicitly: `currentTime` reads and seeks the
 * playhead and holds the duration once a track that does not loop has ended; `playbackRate` is
 * honoured (by resampling) or ignored but never throws; `onended` fires once at the end of a
 * track that does not loop and never for one that does; and `play()` may return a promise that
 * settles when the audio is allowed to start.
 */
export interface Playable {
	play(): void | Promise<void>;
	pause(): void;
	currentTime: number;
	volume: number;
	loop: boolean;
	/** speed and pitch together, matching `HTMLAudioElement.playbackRate`; 1 is unchanged */
	playbackRate?: number;
	/** Optional completion hook, matching HTMLAudioElement.onended. Backends without an
	 * end event can omit it; single-track Music remains fully usable there. */
	onended?: ((event: Event) => unknown) | null;
}

/**
 * The real thing: an `HTMLAudioElement` pointed at a resolved asset path.
 *
 * @example
 * ```ts
 * import { createAudio, Sound } from '@datamoc/mwg/audio';
 *
 * // Sound/Music both default to this; supply your own only for a test or a non-browser backend
 * const hit = new Sound('sounds/hit.mp3', { create: createAudio });
 * ```
 */
export function createAudio(path: string): Playable {
	let url: string;
	try {
		url = Resources.resolve(path);
	} catch (error) {
		//a sound missing from the build must not stop the game from starting: it plays as silence
		console.warn(`${(error as Error).message} - "${path}" will be silent`);
		return silentPlayable();
	}
	return new Audio(url);
}

/** a `Playable` that makes no sound, standing in for an asset that could not be resolved */
function silentPlayable(): Playable {
	return { play() {}, pause() {}, currentTime: 0, volume: 1, loop: false };
}
