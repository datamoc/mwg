import * as Resources from '../assets/index.ts';

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
}

/** the real thing: an `HTMLAudioElement` pointed at a resolved asset path */
export function createAudio(path: string): Playable {
	return new Audio(Resources.resolve(path));
}
