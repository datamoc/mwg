import { clamp } from '../core/Math.ts';
import type { AudioBus, BusKind } from './Channels.ts';

/** the television standard a retro machine ran at: it sets the clock its music was timed by */
export type AudioRegion = 'pal' | 'ntsc';

/**
 * How a machine profile's output stage is treated: `faithful` keeps what the hardware did
 * (DC offset, aliasing and all), `clean` removes the DC and softens the top end.
 */
export type OutputStage = 'faithful' | 'clean';

/** player-facing audio settings as plain data, the shape a save or a settings file holds */
export interface AudioSettingsData {
	/** volume per bus kind, 0 to 100 like every other volume in the bus API */
	busVolumes: Record<BusKind, number>;
	/** the MIDI engine name content is voiced by first, or null for the internal path */
	preferredEngine: string | null;
	region: AudioRegion;
	outputStage: OutputStage;
	/** whether caption text is shown for captioned sounds */
	captions: boolean;
	/** dynamics control, 0 (untouched) to 1 (a soft limiter at full), for loudness comfort */
	dynamics: number;
	/** softening of bright or broadband sounds, 0 (untouched) to 1 (most softened) */
	soften: number;
}

/**
 * The `core.Settings` custom keys the audio rows use; sliders hold percent, 0 to 100.
 *
 * @example
 * ```ts
 * import { AUDIO_SETTINGS_KEYS } from '@datamoc/mwg/audio';
 * import { Settings } from '@datamoc/mwg/core';
 *
 * declare const settings: Settings;
 *
 * settings.setCustom(AUDIO_SETTINGS_KEYS.soften, 40); // 40 percent
 * ```
 */
export const AUDIO_SETTINGS_KEYS = {
	soften: 'audio.soften',
	dynamics: 'audio.dynamics',
	captions: 'audio.captions',
	outputStage: 'audio.outputStage',
	region: 'audio.region',
} as const;

/** one row of a settings screen, in the same shape as `two-d/ui`'s `SettingsCustomRow` */
export type AudioSettingsRow =
	| { kind: 'boolean'; key: string; label: string }
	| { kind: 'number'; key: string; label: string; min: number; max: number; step?: number }
	| { kind: 'choice'; key: string; label: string; options: readonly [string, ...string[]] };

/**
 * The accessibility and fidelity rows a player-facing settings screen shows: softening of bright
 * and broadband sounds, loudness dynamics, caption text, the output stage and the region. Pass them
 * as the `custom` option of `SettingsScreen`, and read the answers back with
 * `AudioSettings.restoreFromCustom(settings.snapshot().custom)`. Labels are English defaults.
 *
 * @example
 * ```ts
 * import { audioSettingsRows } from '@datamoc/mwg/audio';
 *
 * console.log(audioSettingsRows().map((row) => row.key)); // ['audio.soften', 'audio.dynamics', ...]
 * ```
 */
export function audioSettingsRows(
	labels: Partial<Record<keyof typeof AUDIO_SETTINGS_KEYS, string>> = {},
): AudioSettingsRow[] {
	return [
		{
			kind: 'number',
			key: AUDIO_SETTINGS_KEYS.soften,
			label: labels.soften ?? 'Soften bright sounds',
			min: 0,
			max: 100,
			step: 5,
		},
		{
			kind: 'number',
			key: AUDIO_SETTINGS_KEYS.dynamics,
			label: labels.dynamics ?? 'Even out loudness',
			min: 0,
			max: 100,
			step: 5,
		},
		{ kind: 'boolean', key: AUDIO_SETTINGS_KEYS.captions, label: labels.captions ?? 'Sound captions' },
		{
			kind: 'choice',
			key: AUDIO_SETTINGS_KEYS.outputStage,
			label: labels.outputStage ?? 'Output',
			options: ['faithful', 'clean'],
		},
		{ kind: 'choice', key: AUDIO_SETTINGS_KEYS.region, label: labels.region ?? 'Region', options: ['ntsc', 'pal'] },
	];
}

/**
 * The playback rate a tune authored for one region runs at on the other: a PAL machine's
 * 50 Hz clock against NTSC's 60 Hz makes the same file slower and lower, which is the
 * difference a player who grew up with the other standard hears first.
 *
 * @example
 * ```ts
 * import { regionPlaybackRate } from '@datamoc/mwg/audio';
 *
 * console.log(regionPlaybackRate('pal', 'ntsc')); // 0.8333..., slower on PAL
 * console.log(regionPlaybackRate('ntsc', 'ntsc')); // 1, its own region
 * ```
 */
export function regionPlaybackRate(region: AudioRegion, authored: AudioRegion = 'ntsc'): number {
	if (region === authored) return 1;
	return region === 'pal' ? 50 / 60 : 60 / 50;
}

/**
 * The low-pass cutoff, in hertz, that a `soften` amount asks an output stage for: nothing
 * at 0, down to a muffled 3.5 kHz at 1, never above what the sample rate can represent.
 *
 * @example
 * ```ts
 * import { softenCutoff } from '@datamoc/mwg/audio';
 *
 * console.log(softenCutoff(0, 44100)); // 18000, effectively open
 * console.log(softenCutoff(1, 44100) < softenCutoff(0.5, 44100)); // true, more soften, lower cutoff
 * ```
 */
export function softenCutoff(soften: number, sampleRate: number): number {
	const amount = clamp(soften, 0, 1);
	const cutoff = 18000 * (3500 / 18000) ** amount;
	return Math.min(cutoff, sampleRate / 2);
}

/**
 * One sample through the dynamics control: at 0 the sample is untouched, and as the amount
 * rises a soft knee pulls peaks toward full scale without ever passing it, so a loud game
 * gets quieter peaks rather than clipped ones.
 *
 * @example
 * ```ts
 * import { dynamicsLimit } from '@datamoc/mwg/audio';
 *
 * console.log(dynamicsLimit(0.5, 0)); // 0.5, untouched
 * console.log(dynamicsLimit(4, 1) < 1); // true, a hot sample is pulled under full scale
 * ```
 */
export function dynamicsLimit(sample: number, dynamics: number): number {
	const amount = clamp(dynamics, 0, 1);
	if (amount === 0) return sample;
	const limited = Math.tanh(sample);
	return sample * (1 - amount) + limited * amount;
}

/**
 * The player's audio settings in one place, over the pieces that already exist: bus
 * volumes apply to an `AudioBus` (`applyToBus`), the preferred engine names what
 * `resolveMidiSynth` is asked for first, the region and output stage describe the machine
 * profile a retro package renders for, and captions, dynamics and soften are the
 * accessibility dials. Everything clamps on the way in, and `snapshot`/`restore` round-trip
 * the plain-data shape a settings screen persists.
 *
 * @example
 * ```ts
 * import { AudioSettings } from '@datamoc/mwg/audio';
 *
 * const settings = new AudioSettings({ preferredEngine: 'retro:mt32', soften: 0.4 });
 * settings.setBusVolume('se', 130);
 * console.log(settings.snapshot().busVolumes.se); // 100, clamped
 * ```
 */
export class AudioSettings {
	private data: AudioSettingsData;

	constructor(initial: Partial<AudioSettingsData> = {}) {
		this.data = {
			busVolumes: { bgm: 90, bgs: 90, me: 90, se: 90 },
			preferredEngine: null,
			region: 'ntsc',
			outputStage: 'faithful',
			captions: false,
			dynamics: 0,
			soften: 0,
		};
		this.restore(initial);
	}

	/** a copy of the current settings, safe to store */
	snapshot(): AudioSettingsData {
		return { ...this.data, busVolumes: { ...this.data.busVolumes } };
	}

	/** takes settings in, clamping every dial; a partial update keeps the rest */
	restore(data: Partial<AudioSettingsData>): void {
		if (data.busVolumes) {
			for (const kind of Object.keys(data.busVolumes) as BusKind[]) {
				this.data.busVolumes[kind] = clamp(data.busVolumes[kind], 0, 100);
			}
		}
		if (data.preferredEngine !== undefined) this.data.preferredEngine = data.preferredEngine;
		if (data.region !== undefined) this.data.region = data.region;
		if (data.outputStage !== undefined) this.data.outputStage = data.outputStage;
		if (data.captions !== undefined) this.data.captions = data.captions;
		if (data.dynamics !== undefined) this.data.dynamics = clamp(data.dynamics, 0, 1);
		if (data.soften !== undefined) this.data.soften = clamp(data.soften, 0, 1);
	}

	setBusVolume(kind: BusKind, volume: number): void {
		this.data.busVolumes[kind] = clamp(volume, 0, 100);
	}

	/**
	 * takes the audio keys of a `core.Settings` custom bag in (see `audioSettingsRows`), so the
	 * sliders a `SettingsScreen` shows are the dials this class reads; keys that are absent or of
	 * the wrong kind leave the current value alone
	 */
	restoreFromCustom(custom: Readonly<Record<string, string | number | boolean>>): void {
		const patch: Partial<AudioSettingsData> = {};
		const dynamics = custom[AUDIO_SETTINGS_KEYS.dynamics];
		const soften = custom[AUDIO_SETTINGS_KEYS.soften];
		const captions = custom[AUDIO_SETTINGS_KEYS.captions];
		const outputStage = custom[AUDIO_SETTINGS_KEYS.outputStage];
		const region = custom[AUDIO_SETTINGS_KEYS.region];
		if (typeof dynamics === 'number') patch.dynamics = dynamics / 100;
		if (typeof soften === 'number') patch.soften = soften / 100;
		if (typeof captions === 'boolean') patch.captions = captions;
		if (outputStage === 'faithful' || outputStage === 'clean') patch.outputStage = outputStage;
		if (region === 'pal' || region === 'ntsc') patch.region = region;
		this.restore(patch);
	}

	/** pushes the per-bus volumes onto a bus's mixer, the settings' one live connection */
	applyToBus(bus: AudioBus): void {
		for (const kind of Object.keys(this.data.busVolumes) as BusKind[]) {
			bus.setMixer(kind, { volume: this.data.busVolumes[kind] / 100 });
		}
	}

	/** the rate content authored for `authored` should play at under this region */
	playbackRate(authored: AudioRegion = 'ntsc'): number {
		return regionPlaybackRate(this.data.region, authored);
	}

	/** the cutoff the current soften amount (and a clean stage's extra softening) asks for */
	cutoff(sampleRate: number): number {
		const extra = this.data.outputStage === 'clean' ? 0.25 : 0;
		return softenCutoff(clamp(this.data.soften + extra, 0, 1), sampleRate);
	}

	/** one sample through the current dynamics amount */
	limit(sample: number): number {
		return dynamicsLimit(sample, this.data.dynamics);
	}
}
