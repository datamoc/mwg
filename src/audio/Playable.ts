import * as Resources from '../assets/paths.ts';

/**
 * The surface `mwg/audio` needs from a playing sound - exactly what `HTMLAudioElement`
 * already provides, named here so a test (or a game with its own audio backend) can supply
 * a fake without a real `Audio` element existing, which nothing outside a browser can
 * create.
 */
export interface Playable {
	play(): void | Promise<void>;
	pause(): void;
	currentTime: number;
	volume: number;
	loop: boolean;
	/** Optional completion hook, matching HTMLAudioElement.onended. Backends without an
	 * end event can omit it; single-track Music remains fully usable there. */
	onended?: ((event: Event) => unknown) | null;
}

/**
 * The real thing: an `HTMLAudioElement` pointed at a resolved asset path.
 *
 * @example
 * ```ts
 * import { createAudio, Sound } from '@datamoc/mw_games/audio';
 *
 * // Sound/Music both default to this; supply your own only for a test or a non-browser backend
 * const hit = new Sound('sounds/hit.mp3', { create: createAudio });
 * ```
 */
export function createAudio(path: string): Playable {
	return new Audio(Resources.resolve(path));
}
