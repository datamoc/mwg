import type { Sound } from './Sound.ts';

/** A point in the same 2D space the game's camera works in, in world units. */
export interface AudioPoint {
	x: number;
	y: number;
}

/**
 * How far away a source can be heard from, and how fast it fades.
 *
 * `refDistance` is full volume, `maxDistance` is silence, and `rolloff` shapes the drop
 * between them: 1 is inverse-linear, 2 inverse-square. These are the names the Web Audio
 * `PannerNode` uses for the same three numbers, so a game that later moves to a real panner
 * does not have to re-author them.
 */
export interface AudioFalloff {
	/** distance at which the source is at full volume; defaults to 1 */
	refDistance?: number;

	/** distance at which the source is silent; defaults to Infinity */
	maxDistance?: number;

	/** exponent of the inverse-distance drop; defaults to 1 */
	rolloff?: number;
}

/**
 * The gain a listener at `distance` hears a source at, clamped to [0, 1]: 1 at or inside
 * `refDistance`, 0 at or beyond `maxDistance`, an inverse-distance curve between them.
 *
 * @example
 * ```ts
 * import { audioGain } from '@datamoc/mw_games/audio';
 *
 * audioGain(0, { refDistance: 2 }); // 1 - inside the full-volume radius
 * audioGain(2, { refDistance: 2 }); // 1 - the reference distance itself
 * audioGain(4, { refDistance: 2 }); // 0.5 - one doubling away
 * audioGain(4, { refDistance: 2, maxDistance: 4 }); // 0 - at the edge of hearing
 * ```
 */
export function audioGain(distance: number, falloff: AudioFalloff = {}): number {
	const refDistance = falloff.refDistance ?? 1;
	const maxDistance = falloff.maxDistance ?? Infinity;
	const rolloff = falloff.rolloff ?? 1;

	if (!(distance > refDistance)) return 1;
	if (!(distance < maxDistance)) return 0;

	const gain = Math.pow(refDistance / distance, rolloff);
	return Math.max(0, Math.min(1, gain));
}

/**
 * Stereo pan in [-1, 1] for a source: -1 is hard left of the listener, 1 hard right, 0
 * directly ahead or behind. The listener's `facing` is its heading in radians (0 faces +x,
 * increasing clockwise on a screen where y grows downward), so turning the listener turns
 * what counts as "right" with it - a sound to the world's east is centred when the listener
 * faces east and hard right when the listener faces north.
 *
 * A game with a stereo backend applies this itself; the framework has no panner node of its
 * own, so it reports the number rather than pretending to pan.
 *
 * @example
 * ```ts
 * import { audioPan } from '@datamoc/mw_games/audio';
 *
 * const listener = { x: 0, y: 0, facing: 0 }; // facing east
 * audioPan(listener, { x: 10, y: 0 }); // 0 - straight ahead
 * audioPan(listener, { x: 0, y: 10 }); // 1 - to the listener's right
 * audioPan(listener, { x: 0, y: -10 }); // -1 - to its left
 * ```
 */
export function audioPan(listener: AudioPoint & { facing: number }, source: AudioPoint): number {
	const dx = source.x - listener.x;
	const dy = source.y - listener.y;
	const distance = Math.hypot(dx, dy);
	if (distance === 0) return 0;

	//the listener's right-hand direction at heading `facing`, in screen coordinates
	const rightX = Math.sin(listener.facing);
	const rightY = Math.cos(listener.facing);
	const pan = (dx * rightX + dy * rightY) / distance;
	return Math.max(-1, Math.min(1, pan));
}

/**
 * Where sounds are heard from: a game moves one listener to its camera or its party leader
 * each frame, and every `SoundSource` is mixed against it.
 *
 * @example
 * ```ts
 * import { AudioListener } from '@datamoc/mw_games/audio';
 *
 * const listener = new AudioListener({ x: 40, y: 12 });
 * listener.moveTo(41, 12); // following the camera
 * listener.face(Math.PI / 2); // now facing the world's south
 * ```
 */
export class AudioListener implements AudioPoint {
	x: number;
	y: number;

	/** heading in radians: 0 faces +x, increasing clockwise on a y-down screen */
	facing: number;

	constructor(options: { x?: number; y?: number; facing?: number } = {}) {
		this.x = options.x ?? 0;
		this.y = options.y ?? 0;
		this.facing = options.facing ?? 0;
	}

	moveTo(x: number, y: number): void {
		this.x = x;
		this.y = y;
	}

	face(radians: number): void {
		this.facing = radians;
	}
}

export interface SoundSourceOptions extends AudioFalloff {
	x?: number;
	y?: number;
}

/**
 * One positional one-shot: a `Sound` attached to a point in the world, heard from a
 * listener with the distance gain `audioGain` computes. `playFor` applies that gain through
 * `Sound.play(gain)`, and stays silent past `maxDistance` rather than playing at volume 0.
 *
 * Long-running position (a waterfall, an engine) is the game's own loop calling `playFor` on
 * a cadence it chooses; this is the placement and the mix, not a scheduler.
 *
 * @example
 * ```ts
 * import { AudioListener, Sound, SoundSource } from '@datamoc/mw_games/audio';
 *
 * const listener = new AudioListener({ x: 0, y: 0 });
 * const arrow = new Sound('sounds/arrow.mp3');
 * const source = new SoundSource(arrow, { x: 6, y: 8, refDistance: 4, maxDistance: 20 });
 *
 * const gain = source.gainTo(listener); // 0.4 at distance 10
 * source.playFor(listener); // plays at that gain, or not at all when silent
 * ```
 */
export class SoundSource implements AudioPoint {
	x: number;
	y: number;

	private readonly sound: Sound;
	private readonly falloff: AudioFalloff;

	constructor(sound: Sound, options: SoundSourceOptions = {}) {
		this.sound = sound;
		this.x = options.x ?? 0;
		this.y = options.y ?? 0;
		this.falloff = {
			refDistance: options.refDistance,
			maxDistance: options.maxDistance,
			rolloff: options.rolloff,
		};
	}

	moveTo(x: number, y: number): void {
		this.x = x;
		this.y = y;
	}

	gainTo(listener: AudioPoint): number {
		return audioGain(Math.hypot(this.x - listener.x, this.y - listener.y), this.falloff);
	}

	panTo(listener: AudioPoint & { facing: number }): number {
		return audioPan(listener, this);
	}

	/** Plays the source at the gain the listener hears it; returns the gain actually used. */
	playFor(listener: AudioPoint): number {
		const gain = this.gainTo(listener);
		if (gain <= 0) return 0;
		this.sound.play(gain);
		return gain;
	}
}
