import { onCaption } from './Captions.ts';

/**
 * A sound effect described as data and voiced by a synthesis backend instead of read from a
 * file. mwg owns the shape the game and the mixer need (an id, a priority, what a second
 * trigger does, a caption); whatever else a backend wants (chip, voices, curves) rides along
 * untouched, so a retro-instrument package can carry its own `SfxDefinition` through unchanged.
 */
export interface SfxDefinition {
	id: string;
	/** higher cuts lower when the mixer is full; 0 when omitted */
	priority?: number;
	/** what a second trigger does while the first still sounds: `'restart'` (the default), `'ignore'`, or `'layer'` */
	retrigger?: 'restart' | 'ignore' | 'layer';
	/** shown by a captioning overlay each time the effect plays */
	caption?: string;
	[backendData: string]: unknown;
}

/** what a play carries into the backend: the mix mwg computed and a seed that makes any randomness reproducible */
export interface SfxPlayOptions {
	/** 0 to 1, after distance and the sound's own volume */
	gain: number;
	/** -1 (left) to 1 (right) */
	pan: number;
	/** playback ratio, 1 unchanged */
	pitch: number;
	/** the only source of chance an effect may use */
	seed: number;
}

/** one effect sounding on a backend */
export interface SfxVoice {
	stop(): void;
	/** false once it has finished by itself or been stopped */
	readonly active: boolean;
}

/** the synthesis side: a chip engine that can voice an effect, wherever it keeps its voices */
export interface SfxBackend {
	/** returns null when it cannot voice the effect (no free channel, unknown chip), which is not an error */
	play(definition: SfxDefinition, options: SfxPlayOptions): SfxVoice | null;
}

/** effects by id, so a sound can be made from an id the content named */
export class SfxBank {
	private readonly definitions = new Map<string, SfxDefinition>();

	constructor(definitions: Iterable<SfxDefinition> = []) {
		for (const definition of definitions) this.define(definition);
	}

	define(definition: SfxDefinition): void {
		if (!definition.id) throw new Error('a sound effect needs an id');
		this.definitions.set(definition.id, definition);
	}

	has(id: string): boolean {
		return this.definitions.has(id);
	}

	get(id: string): SfxDefinition {
		const definition = this.definitions.get(id);
		if (!definition) throw new Error(`no sound effect "${id}" in the bank`);
		return definition;
	}

	ids(): string[] {
		return [...this.definitions.keys()];
	}
}

/** a granted slot in the arbiter; `release` frees it */
export interface SfxGrant {
	release(): void;
}

/**
 * The shared voice limit between chip effects and the bus's `'se'` jingles: both ask here before
 * they sound, and when the limit is reached the lowest-priority voice (the oldest among equals)
 * is cut for a new one of equal or higher priority; a new one below everything sounding is
 * refused. One arbiter handed to a bus and to every `SfxSound` makes them a single pool.
 *
 * @example
 * ```ts
 * import { SfxArbiter } from '@datamoc/mwg/audio';
 *
 * const arbiter = new SfxArbiter({ maxVoices: 2 });
 * const a = arbiter.request(1, () => console.log('a cut'));
 * arbiter.request(1, () => console.log('b cut'));
 * arbiter.request(5, () => console.log('c cut')); // cuts a, the oldest of the lowest priority
 * a?.release();
 * ```
 */
export class SfxArbiter {
	private readonly maxVoices: number;
	private readonly voices: { priority: number; stop: () => void; active: () => boolean }[] = [];

	constructor(options: { maxVoices?: number } = {}) {
		this.maxVoices = Math.max(1, Math.floor(options.maxVoices ?? 8));
	}

	get active(): number {
		return this.voices.length;
	}

	/**
	 * Asks for a slot. `stop` cuts the voice when a better one needs its place; `active` says
	 * whether it still sounds, so a voice that ended by itself frees its slot for any asker, not
	 * only for the sound that owned it.
	 */
	request(priority: number, stop: () => void, active: () => boolean = () => true): SfxGrant | null {
		for (let i = this.voices.length - 1; i >= 0; i--) if (!this.voices[i].active()) this.voices.splice(i, 1);
		if (this.voices.length >= this.maxVoices) {
			let victim = 0;
			for (let i = 1; i < this.voices.length; i++) {
				if (this.voices[i].priority < this.voices[victim].priority) victim = i;
			}
			if (this.voices[victim].priority > priority) return null;
			const [cut] = this.voices.splice(victim, 1);
			cut.stop();
		}
		const entry = { priority, stop, active };
		this.voices.push(entry);
		return {
			release: () => {
				const at = this.voices.indexOf(entry);
				if (at !== -1) this.voices.splice(at, 1);
			},
		};
	}
}

/**
 * A reproducible seed for an effect: the same id on the same game frame (and the same ordinal
 * within that frame) always gives the same number, so a replay or a lockstep peer hears exactly
 * what the original run heard, and audio never perturbs the simulation.
 *
 * @example
 * ```ts
 * import { sfxSeed } from '@datamoc/mwg/audio';
 *
 * sfxSeed('arrow', 120) === sfxSeed('arrow', 120); // true
 * ```
 */
export function sfxSeed(id: string, frame: number, ordinal = 0): number {
	let hash = 0x811c9dc5;
	const mix = (value: number): void => {
		hash = Math.imul(hash ^ (value & 0xff), 0x01000193);
		hash = Math.imul(hash ^ ((value >>> 8) & 0xff), 0x01000193);
		hash = Math.imul(hash ^ ((value >>> 16) & 0xff), 0x01000193);
		hash = Math.imul(hash ^ ((value >>> 24) & 0xff), 0x01000193);
	};
	for (let i = 0; i < id.length; i++) mix(id.charCodeAt(i));
	mix(Math.floor(frame));
	mix(ordinal);
	return hash >>> 0;
}

export interface SfxSoundOptions {
	/** where an effect given by id is looked up */
	bank?: SfxBank;
	/** the shared voice limit; none means a voice is never cut for another */
	arbiter?: SfxArbiter;
	/** the game's own frame counter, never the wall clock, so seeds repeat across runs; 0 when omitted */
	frame?: () => number;
	/** shown with each play when the definition has no caption of its own */
	caption?: string;
	/** level, 0 to 1; 1 when omitted */
	volume?: number;
}

/**
 * The data-driven counterpart of `Sound`: it plays an `SfxDefinition` (or the id of one in a
 * bank) through a backend, with the same `play(gain, pitch)` shape so a `SoundSource` can
 * attenuate it, and a pan on top. It applies the definition's retrigger rule, asks the shared
 * arbiter for a voice, fires the caption, and hands the backend a deterministic seed.
 *
 * @example
 * ```ts
 * import { SfxArbiter, SfxBank, SfxSound, SoundSource, AudioListener, type SfxBackend } from '@datamoc/mwg/audio';
 *
 * declare const chip: SfxBackend;
 *
 * const bank = new SfxBank([{ id: 'arrow', priority: 5, caption: 'an arrow flies' }]);
 * const arrow = new SfxSound(chip, 'arrow', { bank, arbiter: new SfxArbiter(), frame: () => 0 });
 * new SoundSource(arrow, { x: 3, y: 4 }).playFor(new AudioListener());
 * ```
 */
export class SfxSound {
	volume: number;
	/** how many plays reached the backend, for a test to assert on without a speaker */
	plays = 0;

	private readonly backend: SfxBackend;
	private readonly definition: SfxDefinition;
	private readonly options: SfxSoundOptions;
	private readonly live: { voice: SfxVoice; grant: SfxGrant | null }[] = [];
	private suspended_ = false;
	private lastFrame = Number.NaN;
	private ordinal = 0;

	constructor(backend: SfxBackend, effect: SfxDefinition | string, options: SfxSoundOptions = {}) {
		this.backend = backend;
		this.options = options;
		this.volume = options.volume ?? 1;
		if (typeof effect === 'string') {
			if (!options.bank) throw new Error(`a sound effect given by id ("${effect}") needs a bank`);
			this.definition = options.bank.get(effect);
		} else {
			this.definition = effect;
		}
	}

	get isSuspended(): boolean {
		return this.suspended_;
	}

	/** voices that still sound */
	get activeVoices(): number {
		this.prune();
		return this.live.length;
	}

	/** plays the effect; returns false when it was ignored, refused by the arbiter or the backend had no voice */
	play(gain = 1, pitch = 1, pan = 0): boolean {
		if (this.suspended_) return false;
		this.prune();
		const rule = this.definition.retrigger ?? 'restart';
		if (this.live.length > 0 && rule === 'ignore') return false;
		if (this.live.length > 0 && rule === 'restart') this.stopAll();

		const frame = this.options.frame?.() ?? 0;
		this.ordinal = frame === this.lastFrame ? this.ordinal + 1 : 0;
		this.lastFrame = frame;

		let voice: SfxVoice | null = null;
		const grant =
			this.options.arbiter?.request(
				this.definition.priority ?? 0,
				() => {
					voice?.stop();
				},
				() => voice?.active ?? true,
			) ?? null;
		if (this.options.arbiter && !grant) return false;
		voice = this.backend.play(this.definition, {
			gain: Math.max(0, Math.min(1, gain * this.volume)),
			pan: Math.max(-1, Math.min(1, pan)),
			pitch,
			seed: sfxSeed(this.definition.id, frame, this.ordinal),
		});
		if (!voice) {
			grant?.release();
			return false;
		}
		this.live.push({ voice, grant });
		this.plays++;
		const caption = this.definition.caption ?? this.options.caption;
		if (caption) onCaption.dispatch({ text: caption });
		return true;
	}

	stopAll(): void {
		for (const { voice, grant } of this.live.splice(0)) {
			voice.stop();
			grant?.release();
		}
	}

	suspend(): void {
		this.suspended_ = true;
		this.stopAll();
	}

	resume(): void {
		this.suspended_ = false;
	}

	/** drops voices that finished by themselves, returning their arbiter slots */
	private prune(): void {
		for (let i = this.live.length - 1; i >= 0; i--) {
			if (!this.live[i].voice.active) {
				this.live[i].grant?.release();
				this.live.splice(i, 1);
			}
		}
	}
}
