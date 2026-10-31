import {
	midiLoopStart,
	timedMidiMessages,
	noteToFrequency,
	parseMidi,
	scheduleMidi,
	type MidiFile,
	type ScheduledNote,
} from './Midi.ts';
import {
	decodeSoundFont,
	parseSoundFont,
	type MissingProgram,
	type SoundFont,
	type SoundFontVoice,
} from './SoundFont.ts';
import type { SoundFontSampleDecoder } from './SampleDecoder.ts';
import { spawn } from '../threads/index.ts';
import {
	INTERNAL_MIDI_ENGINES,
	midiSynthWorkerSource,
	onMidiSynthFallback,
	renderMidiThroughSynth,
	renderSynthMessages,
	resolveSynth,
	synthChoices,
	type MidiSynthFactory,
	type MidiSynthFallback,
	type MidiSynthRequest,
} from './MidiSynth.ts';

/**
 * A Standard MIDI File rendered to stereo PCM frames, the same bridge the RPG Maker
 * player crosses with an offline audio context: browsers cannot decode MIDI, so the
 * file is synthesized once, faster than real time, and what comes out is an ordinary
 * buffered track with a loop region, ready for a `Channel`, a seek and a pitch and
 * pan control that MIDI bytes on their own could never answer.
 *
 * Two voicings. With a `SoundFont` every note plays the real instrument sample for
 * its bank, program, key and velocity, with the font's loops, envelope, tuning and
 * pan. Without one a small General MIDI approximation voices it instead: each program
 * family maps to a waveform and envelope recipe and channel 10 is a noise and sine
 * drum kit. Both honour channel volume, expression and pan per note; the synth keeps
 * melody, rhythm and structure while its timbre stays approximate, which is why a
 * SoundFont makes such a difference. Pitch bend is voiced as the bend in effect
 * when each note starts (two semitones either way); a bend that moves while a note
 * holds does not glide it.
 */

export interface RenderMidiOptions {
	/**
	 * voices the file through a `MidiSynth` instead: a registered engine name (`'retro:mt32'`), a
	 * factory, or an ordered list tried until one works. Takes precedence over `soundfont`, which
	 * stays the next choice when the synth cannot be used (see `onMidiSynthFallback`).
	 */
	synth?: MidiSynthRequest;
	/** voices every note from these samples; without one the built-in synth plays */
	soundfont?: SoundFont | null;
	/** voices only these channels (0 to 15) and drops the rest, to render one stem of a file */
	channels?: readonly number[];
	/** output sample rate in Hz */
	sampleRate?: number;
	/** master level, 0 to 1 */
	gain?: number;
	/** hard cap on rendered seconds; longer tails are cut */
	maxDuration?: number;
	/** Normalize the stereo peak to this linear amplitude (0 < targetPeak <= 1). With targetRms, this is a ceiling. */
	targetPeak?: number;
	/** Normalize stereo RMS to this linear amplitude (0 < targetRms <= 1). Silence stays silent. */
	targetRms?: number;
}

export interface RenderedMidi {
	sampleRate: number;
	left: Float32Array;
	right: Float32Array;
	/** seconds to the first included note, or null for a silent stem */
	firstNoteTime: number | null;
	/** seconds the loop jumps back to: the file's controller-111 marker, else 0 */
	loopStart: number;
	/** seconds the loop wraps from: the end of the render */
	loopEnd: number;
	/** total rendered seconds, equal to loopEnd */
	duration: number;
}

export interface RenderMidiAsyncOptions {
	/** cancels preparation and terminates its render worker; cancellation never triggers an engine fallback */
	signal?: AbortSignal;
	/** a `MidiSynth` request as for `renderMidiToBuffer`; named engines registered with a worker factory render on a worker, other factories stay on this thread */
	synth?: MidiSynthRequest;
	/** raw SoundFont bytes: parsed on this thread, voiced on the worker; a SoundFont 3 needs `decode` */
	soundFontBytes?: ArrayBuffer | ArrayBufferView;
	/**
	 * decodes a SoundFont 3's compressed samples on this thread before the render (the worker has no
	 * `AudioContext`), as `decodeSoundFont` does; a SoundFont 2 passes through and never calls it
	 */
	decode?: SoundFontSampleDecoder;
	/** what plays for a program the font lacks, as for `parseSoundFont`; `'piano'` when omitted */
	missingProgram?: MissingProgram;
	/** voices only these channels (0 to 15), as for `renderMidiToBuffer` */
	channels?: readonly number[];
	/** output sample rate in Hz */
	sampleRate?: number;
	/** master level, 0 to 1 */
	gain?: number;
	/** hard cap on rendered seconds; longer tails are cut */
	maxDuration?: number;
	/** Normalize the stereo peak to this linear amplitude (0 < targetPeak <= 1). With targetRms, this is a ceiling. */
	targetPeak?: number;
	/** Normalize stereo RMS to this linear amplitude (0 < targetRms <= 1). Silence stays silent. */
	targetRms?: number;
}

const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_MASTER_GAIN = 0.35;
const DEFAULT_MAX_DURATION = 8 * 60;

/** a scheduled note plus the two facts only the main thread can supply: its frequency (the Midi.ts formula, which the stringified worker task cannot import) and its resolved SoundFont voices */
interface RenderNote extends ScheduledNote {
	frequency: number;
	voices?: SoundFontVoice[];
}

/** everything the render needs, all of it structured-cloneable: this is the object that crosses to a worker intact */
interface MidiRenderTask {
	notes: RenderNote[];
	/** the file's controller-111 marker in seconds, unclamped: renderNotes clamps it against the duration it computes */
	loopStart: number | null;
	sampleRate: number;
	gain: number;
	maxDuration: number;
}

/**
 * Renders a parsed MIDI file to stereo PCM frames: one offline pass, then the result
 * plays, loops, seeks and re-pitches like any decoded track. Deterministic: the same
 * file and options always produce the same frames, so a test can render and assert
 * without any audio hardware. The synthesis itself lives in `renderNotes`, which the
 * async twin `renderMidiToBufferAsync` ships to a worker, so both paths produce the
 * same bits.
 *
 * @example
 * ```ts
 * import { parseMidi, renderMidiToBuffer } from '@datamoc/mwg/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const rendered = renderMidiToBuffer(parseMidi(midiBytes));
 * console.log(rendered.duration, rendered.loopStart, rendered.loopEnd);
 * ```
 */
export function renderMidiToBuffer(file: MidiFile, options: RenderMidiOptions = {}): RenderedMidi {
	validateLevels(options);
	return normalizeLevels(renderThroughRequestedSynth(file, options) ?? renderNotes(prepare(file, options)), options);
}

/** Validate before starting a render, including worker renders. */
function validateLevels(options: Pick<RenderMidiOptions, 'targetPeak' | 'targetRms'>): void {
	for (const name of ['targetPeak', 'targetRms'] as const) {
		const value = options[name];
		if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > 1))
			throw new RangeError(`${name} must be greater than 0 and at most 1`);
	}
}

/** One gain for both channels preserves stereo balance; a peak ceiling can limit RMS normalization. */
function normalizeLevels(
	rendered: RenderedMidi,
	options: Pick<RenderMidiOptions, 'targetPeak' | 'targetRms'>,
): RenderedMidi {
	if (options.targetPeak === undefined && options.targetRms === undefined) return rendered;
	let peak = 0;
	let sumSquares = 0;
	for (const channel of [rendered.left, rendered.right]) {
		for (const sample of channel) {
			peak = Math.max(peak, Math.abs(sample));
			sumSquares += sample * sample;
		}
	}
	if (peak === 0) return rendered;
	const rms = Math.sqrt(sumSquares / (rendered.left.length + rendered.right.length));
	let gain = options.targetRms === undefined ? Infinity : options.targetRms / rms;
	if (options.targetPeak !== undefined) gain = Math.min(gain, options.targetPeak / peak);
	for (const channel of [rendered.left, rendered.right]) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
	return rendered;
}

/** the channels of 0 to 15 that are not in the list */
function otherChannels(channels: readonly number[]): number[] {
	return Array.from({ length: 16 }, (_, channel) => channel).filter((channel) => !channels.includes(channel));
}

/** the render through `options.synth`, or null when no synth was asked for or none could be used, in which case the internal path voices the file */
function renderThroughRequestedSynth(
	file: MidiFile,
	options: RenderMidiOptions,
	notify: (event: MidiSynthFallback) => void = (event) => onMidiSynthFallback.dispatch(event),
): RenderedMidi | null {
	if (!options.synth) return null;
	const { synth } = resolveSynth(
		options.synth,
		options.sampleRate ?? DEFAULT_SAMPLE_RATE,
		options.soundfont ? 'gm-soundfont' : 'builtin',
		notify,
	);
	if (!synth) return null;
	try {
		return renderMidiThroughSynth(file, synth, {
			maxDuration: options.maxDuration,
			gain: options.gain,
			mutedChannels: options.channels ? otherChannels(options.channels) : undefined,
		});
	} catch (error) {
		if ((error as Error).message === 'MIDI file has no notes') throw error;
		//a synth that fails mid-render must not take the game's music down with it
		notify({
			requested: 'custom',
			used: options.soundfont ? 'gm-soundfont' : 'builtin',
			reason: 'failed',
			message: (error as Error).message,
		});
		return null;
	}
}

/**
 * Renders MIDI bytes or a MidiFile (including game-authored note events) to stereo PCM frames on a worker thread, so the work that costs
 * seconds on a real track (T161 measured 2 to 11.8) does not freeze the loading screen
 * the caller is presumably drawing. Everything cheap stays on this thread: the parse, the
 * schedule, option validation and the SoundFont voice lookup. Only the synthesis crosses
 * to the worker, as structured-cloneable note data, and the stereo buffers come back
 * transferred rather than copied.
 *
 * A named engine registered with a worker factory is also constructed and rendered on the
 * worker. Legacy factories without a worker registration keep running on the calling thread.
 * Worker failures follow the same ordered fallback request and notify on the calling thread.
 *
 * Deterministic to the bit for internal synthesis, because both paths call `renderNotes`: for the same
 * bytes and options this resolves exactly what `renderMidiToBuffer(parseMidi(bytes), ...)`
 * returns. A failure (a malformed file, invalid options, a dead worker) rejects with the
 * same message the synchronous path would have thrown.
 *
 * @example
 * ```ts
 * import { renderMidiToBufferAsync } from '@datamoc/mwg/audio';
 *
 * declare const midi: ArrayBuffer;
 * declare const soundFont: ArrayBuffer;
 *
 * const track = await renderMidiToBufferAsync(midi, { soundFontBytes: soundFont });
 * console.log(track.duration, track.loopStart, track.loopEnd);
 * ```
 *
 * The SoundFont a build embeds is a SoundFont 3 (Opus), which the worker cannot decode: pass
 * `decode` and the samples are decoded on this thread first.
 *
 * ```ts
 * import { renderMidiToBufferAsync, webAudioSampleDecoder } from '@datamoc/mwg/audio';
 *
 * declare const midi: ArrayBuffer;
 * declare const embeddedFont: ArrayBuffer;
 *
 * const track = await renderMidiToBufferAsync(midi, {
 * 	soundFontBytes: embeddedFont,
 * 	decode: webAudioSampleDecoder(),
 * });
 * console.log(track.duration);
 * ```
 */
export async function renderMidiToBufferAsync(
	midi: ArrayBuffer | ArrayBufferView | MidiFile,
	options: RenderMidiAsyncOptions = {},
): Promise<RenderedMidi> {
	options.signal?.throwIfAborted();
	validateLevels(options);
	const file = 'events' in midi ? midi : parseMidi(midi);
	const fontBytes =
		options.soundFontBytes && options.decode
			? await decodeSoundFont(options.soundFontBytes, (bytes, rate, codec) => {
					options.signal?.throwIfAborted();
					return waitForDecode(Promise.resolve(options.decode!(bytes, rate, codec)), options.signal);
				})
			: options.soundFontBytes;
	options.signal?.throwIfAborted();
	const soundfont = fontBytes ? parseSoundFont(fontBytes, { missingProgram: options.missingProgram }) : null;
	const viaSynth = await renderRequestedSynthAsync(file, { ...options, soundfont });
	if (viaSynth) return normalizeLevels(viaSynth, options);
	const task = prepare(file, {
		soundfont,
		channels: options.channels,
		sampleRate: options.sampleRate,
		gain: options.gain,
		maxDuration: options.maxDuration,
	});
	return normalizeLevels(await spawn(renderNotes, [task], { signal: options.signal }), options);
}

/** A platform decoder cannot be stopped, but cancellation must release the preparation queue. */
function waitForDecode(pending: Promise<Int16Array>, signal?: AbortSignal): Promise<Int16Array> {
	if (!signal) return pending;
	return new Promise((resolve, reject) => {
		const cancel = (): void => reject(signal.reason);
		signal.addEventListener('abort', cancel, { once: true });
		pending.then(
			(value) => {
				signal.removeEventListener('abort', cancel);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', cancel);
				reject(error);
			},
		);
		if (signal.aborted) {
			signal.removeEventListener('abort', cancel);
			reject(signal.reason);
		}
	});
}

/** Tries worker-capable names in request order, preserving legacy factories on this thread. */
async function renderRequestedSynthAsync(
	file: MidiFile,
	options: RenderMidiOptions & Pick<RenderMidiAsyncOptions, 'signal'>,
): Promise<RenderedMidi | null> {
	if (!options.synth) return null;
	const choices = synthChoices(options.synth);
	const requested = typeof choices[0] === 'string' ? choices[0] : 'custom';
	const internal = options.soundfont ? 'gm-soundfont' : 'builtin';
	let failure: MidiSynthFallback | undefined;
	for (const choice of choices) {
		if (typeof choice === 'string' && INTERNAL_MIDI_ENGINES.includes(choice)) break;
		const name = typeof choice === 'string' ? choice : 'custom';
		const workerSource = typeof choice === 'string' ? midiSynthWorkerSource(choice) : undefined;
		let rendered: RenderedMidi | null = null;
		if (workerSource) {
			try {
				rendered = await spawn(
					(
						factoryCode: string,
						renderCode: string,
						messages: ReturnType<typeof timedMidiMessages>,
						marker: number | null,
						rate: number,
						renderOptions: Parameters<typeof renderSynthMessages>[3],
					) => {
						const create = new Function(`return (${factoryCode})`)() as MidiSynthFactory;
						const render = new Function(`return (${renderCode})`)() as typeof renderSynthMessages;
						const synth = create(rate);
						if (
							!synth ||
							typeof synth.sampleRate !== 'number' ||
							!(synth.sampleRate > 0) ||
							!['event', 'sysex', 'render', 'reset'].every(
								(key) => typeof (synth as unknown as Record<string, unknown>)[key] === 'function',
							)
						)
							throw new Error('the factory did not return a MidiSynth');
						return render(messages, marker, synth, renderOptions);
					},
					[
						workerSource,
						renderSynthMessages.toString(),
						timedMidiMessages(file),
						midiLoopStart(file),
						options.sampleRate ?? DEFAULT_SAMPLE_RATE,
						{
							maxDuration: options.maxDuration,
							gain: options.gain,
							mutedChannels: options.channels ? otherChannels(options.channels) : undefined,
						},
					],
					{ signal: options.signal },
				);
			} catch (error) {
				options.signal?.throwIfAborted();
				if ((error as Error).message === 'MIDI file has no notes') throw error;
				failure = { requested, used: internal, reason: 'failed', message: (error as Error).message };
			}
		} else {
			rendered = renderThroughRequestedSynth(file, { ...options, synth: choice }, (event) => {
				failure = { ...event, requested };
			});
		}
		if (rendered) {
			if (failure && name !== requested) onMidiSynthFallback.dispatch({ ...failure, used: name });
			return rendered;
		}
	}
	if (failure) onMidiSynthFallback.dispatch(failure);
	else if (choices.length && requested !== internal) {
		onMidiSynthFallback.dispatch({ requested, used: internal, reason: 'unknown' });
	}
	return null;
}

/**
 * The main-thread half of a render: validation, the schedule, and the voice lookup - the
 * parts that need the MidiFile or the SoundFont object, neither of which survives a
 * structured clone. Both paths run this first, which is why they cannot diverge.
 */
function prepare(file: MidiFile, options: RenderMidiOptions): MidiRenderTask {
	const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const master = options.gain ?? DEFAULT_MASTER_GAIN;
	const maxDuration = options.maxDuration ?? DEFAULT_MAX_DURATION;
	if (!(sampleRate > 0)) throw new Error('render sample rate must be positive');
	if (!(master >= 0)) throw new Error('render gain must not be negative');
	if (!(maxDuration > 0)) throw new Error('render max duration must be positive');

	const only = options.channels ? new Set(options.channels) : null;
	const notes = scheduleMidi(file).filter((note) => note.time < maxDuration && (!only || only.has(note.channel)));
	if (notes.length === 0) throw new Error('MIDI file has no notes');
	const soundfont = options.soundfont ?? null;
	const voiceCache = new Map<string, SoundFontVoice[]>();
	return {
		notes: notes.map((note) => ({
			...note,
			frequency: noteToFrequency(note.note),
			voices: soundfont ? sampledVoices(soundfont, voiceCache, note) : undefined,
		})),
		loopStart: midiLoopStart(file),
		sampleRate,
		gain: master,
		maxDuration,
	};
}

/** layered SoundFont voices for a note, memoized: drums read bank 128 whatever CC0 says */
function sampledVoices(
	soundfont: SoundFont,
	cache: Map<string, SoundFontVoice[]>,
	note: ScheduledNote,
): SoundFontVoice[] {
	const bank = note.channel === 9 ? 128 : note.bank;
	const key = `${bank}:${note.program}:${note.note}:${note.velocity >> 3}`;
	let voices = cache.get(key);
	if (!voices) {
		voices = soundfont.voices(bank, note.program, note.note, note.velocity);
		cache.set(key, voices);
	}
	return voices;
}

/**
 * The synthesis itself. **Self-contained by construction:** `spawn` stringifies this
 * function into a worker, where `new Function` rehydrates it with nothing but its own
 * body in scope, so every helper it uses is declared inside it - a module-scope binding
 * would arrive as a ReferenceError on the other side. The synchronous path calls it
 * directly and the async path sends it, which is the whole reason their output is
 * bit-identical rather than merely similar.
 */
function renderNotes(task: MidiRenderTask): RenderedMidi {
	const { sampleRate, gain: master, maxDuration } = task;
	const notes = task.notes;
	const tail = notes.reduce((latest, note) => Math.max(latest, note.time + note.duration), 0);
	const duration = Math.min(maxDuration, tail + 1.5);
	const frames = Math.max(1, Math.ceil(duration * sampleRate));
	const left = new Float32Array(frames);
	const right = new Float32Array(frames);
	const loopStart = Math.min(task.loopStart ?? 0, Math.max(0, duration - 0.1));

	/** equal-power stereo gains for a pan in -1 (left) to 1 (right) */
	function equalPower(pan: number): [number, number] {
		const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
		return [Math.cos(angle), Math.sin(angle)];
	}

	/** one sampled voice, mixed additively into the render */
	function renderSampled(
		left: Float32Array,
		right: Float32Array,
		sampleRate: number,
		note: ScheduledNote,
		voice: SoundFontVoice,
		peak: number,
		startFrame: number,
		frameCount: number,
	): void {
		const data = voice.sample.data;
		if (data.length === 0) return;
		const ratio = 2 ** (((note.note - voice.rootKey) * 100 + voice.cents + (note.bend ?? 0) * 100) / 1200);
		const step = (ratio * voice.sample.rate) / sampleRate;
		if (!(step > 0)) return;

		const endTime = note.time + note.duration;
		const attack = Math.max(0.002, voice.attack);
		const decayEnd = attack + voice.hold + Math.min(voice.decay, 30);
		const release = Math.max(0.03, Math.min(voice.release, 4));
		const sampleSeconds = data.length / voice.sample.rate;
		//Drums ignore note-off: the sample rings out. Melodic voices release at note-off.
		const heldUntil =
			note.channel === 9
				? Math.max(endTime, note.time + Math.min(2, sampleSeconds))
				: Math.max(endTime, note.time + attack);
		const heldLen = heldUntil - note.time;
		const level = peak * voice.gain;
		const sustainLevel = level * voice.sustain;
		const [gainLeft, gainRight] = equalPower(note.pan + voice.pan);

		const looping = voice.loop && voice.sample.loopEnd > voice.sample.loopStart;
		const loopSpan = voice.sample.loopEnd - voice.sample.loopStart;
		const lastFrame = Math.min(
			frameCount,
			startFrame + Math.ceil((heldUntil + release + 0.02 - note.time) * sampleRate),
		);
		let position = 0;
		for (let frame = startFrame; frame < lastFrame; frame++) {
			const t = frame / sampleRate - note.time;
			let envelope: number;
			if (t < attack) envelope = level * (t / attack);
			else if (t < attack + voice.hold) envelope = level;
			else if (t < decayEnd) {
				envelope =
					level +
					(sustainLevel - level) *
						((t - attack - voice.hold) / Math.max(1e-6, decayEnd - attack - voice.hold));
			} else if (t < heldLen) envelope = sustainLevel;
			else if (t < heldLen + release) envelope = sustainLevel * (1 - (t - heldLen) / release);
			else envelope = 0;

			if (looping && position >= voice.sample.loopEnd) {
				position = voice.sample.loopStart + ((position - voice.sample.loopStart) % loopSpan);
			}
			const floored = Math.floor(position);
			const frac = Math.min(1, Math.max(0, position - floored));
			let value: number;
			if ((!looping && position >= data.length) || floored < 0) value = 0;
			else {
				const first = data[Math.min(floored, data.length - 1)];
				const second = data[Math.min(floored + 1, data.length - 1)];
				value = first + (second - first) * frac;
			}
			left[frame] += value * envelope * gainLeft;
			right[frame] += value * envelope * gainRight;
			position += step;
		}
	}

	type SynthWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

	interface SynthRecipe {
		wave: SynthWave;
		attack: number;
		decay: number;
		sustain: number;
		release: number;
		/** static detune in cents for chorused families */
		detune: number;
		/** one-pole lowpass cutoff in Hz for filtered families */
		cutoff?: number;
	}

	/** program family to synthesis recipe: pianos pluck, organs hold, strings swell */
	function recipeFor(program: number): SynthRecipe {
		if (program < 8) return { wave: 'triangle', attack: 0.005, decay: 1.2, sustain: 0.25, release: 0.2, detune: 0 };
		if (program < 16) return { wave: 'sine', attack: 0.003, decay: 0.8, sustain: 0.1, release: 0.5, detune: 0 };
		if (program < 24) {
			return { wave: 'square', attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.08, detune: 0, cutoff: 2500 };
		}
		if (program < 32) {
			return {
				wave: 'sawtooth',
				attack: 0.004,
				decay: 0.6,
				sustain: 0.15,
				release: 0.15,
				detune: 0,
				cutoff: 3000,
			};
		}
		if (program < 40) return { wave: 'triangle', attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.1, detune: 0 };
		if (program < 56) {
			return { wave: 'sawtooth', attack: 0.12, decay: 0.2, sustain: 0.8, release: 0.3, detune: 6, cutoff: 3500 };
		}
		if (program < 80) {
			return {
				wave: 'sawtooth',
				attack: 0.04,
				decay: 0.15,
				sustain: 0.75,
				release: 0.12,
				detune: 0,
				cutoff: 4500,
			};
		}
		if (program < 88) {
			return { wave: 'square', attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1, detune: 0, cutoff: 3800 };
		}
		if (program < 104) {
			return { wave: 'sawtooth', attack: 0.25, decay: 0.3, sustain: 0.7, release: 0.5, detune: 8, cutoff: 2200 };
		}
		return { wave: 'triangle', attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.2, detune: 0 };
	}

	function oscillate(wave: SynthWave, phase: number): number {
		switch (wave) {
			case 'sine':
				return Math.sin(phase);
			case 'square':
				return Math.sin(phase) >= 0 ? 1 : -1;
			case 'sawtooth': {
				const cycles = phase / (2 * Math.PI);
				return 2 * (cycles - Math.floor(cycles)) - 1;
			}
			case 'triangle': {
				const cycles = phase / (2 * Math.PI);
				return 4 * Math.abs(cycles - Math.floor(cycles) - 0.5) - 1;
			}
		}
	}

	/** attack-decay-sustain-release level multiplier, 0 to 1, for a note held `held` seconds */
	function adsr(t: number, attack: number, decay: number, sustain: number, held: number, release: number): number {
		if (t < attack) return t / attack;
		if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / Math.max(1e-6, decay));
		if (t < held) return sustain;
		if (t < held + release) return sustain * (1 - (t - held) / release);
		return 0;
	}

	/** deterministic pseudo-random sample in [-1, 1]: the same seed always gives the same noise */
	function noiseAt(seed: number, index: number): number {
		let h = Math.imul(seed ^ index, 2654435761) >>> 0;
		h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
		h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
		h ^= h >>> 16;
		return ((h >>> 0) / 4294967295) * 2 - 1;
	}

	/** one built-in synth voice, or the drum kit on channel 10, mixed additively */
	function renderSynth(
		left: Float32Array,
		right: Float32Array,
		sampleRate: number,
		note: RenderNote,
		peak: number,
		startFrame: number,
		frameCount: number,
	): void {
		if (note.channel === 9) {
			renderDrum(left, right, sampleRate, note, peak, startFrame, frameCount);
			return;
		}
		const recipe = recipeFor(note.program);
		const frequency = note.frequency * 2 ** ((recipe.detune + (note.bend ?? 0) * 100) / 1200);
		const held = Math.max(note.duration, recipe.attack + 0.01);
		const release = Math.max(0.02, recipe.release);
		const lastFrame = Math.min(frameCount, startFrame + Math.ceil((held + release + 0.02) * sampleRate));
		const [gainLeft, gainRight] = equalPower(note.pan);
		const filtered = recipe.cutoff !== undefined;
		const coefficient = filtered
			? 1 - Math.exp((-2 * Math.PI * Math.min(recipe.cutoff!, frequency * 8 + 800)) / sampleRate)
			: 0;
		let lowpass = 0;
		let phase = 0;
		const phaseStep = (2 * Math.PI * frequency) / sampleRate;
		for (let frame = startFrame; frame < lastFrame; frame++) {
			const t = frame / sampleRate - note.time;
			const value = oscillate(recipe.wave, phase);
			phase += phaseStep;
			lowpass = filtered ? lowpass + coefficient * (value - lowpass) : value;
			const envelope = peak * adsr(t, recipe.attack, recipe.decay, recipe.sustain, held, release);
			left[frame] += lowpass * envelope * gainLeft;
			right[frame] += lowpass * envelope * gainRight;
		}
	}

	/** channel 10: kicks thump, snares and hats hiss, keyed by General MIDI drum note */
	function renderDrum(
		left: Float32Array,
		right: Float32Array,
		sampleRate: number,
		note: ScheduledNote,
		peak: number,
		startFrame: number,
		frameCount: number,
	): void {
		const [gainLeft, gainRight] = equalPower(note.pan);
		const seed = note.note * 7919 + startFrame;
		if (note.note === 35 || note.note === 36 || note.note < 45) {
			//Kick: a sine dropping 150 Hz to 45 Hz, decaying exponentially.
			const level = peak * 1.4;
			const lastFrame = Math.min(frameCount, startFrame + Math.ceil(0.27 * sampleRate));
			let phase = 0;
			for (let frame = startFrame; frame < lastFrame; frame++) {
				const t = frame / sampleRate - note.time;
				const frequency = t < 0.12 ? 150 * (45 / 150) ** (t / 0.12) : 45;
				phase += (2 * Math.PI * frequency) / sampleRate;
				const envelope = level * (0.001 / level) ** Math.min(1, t / 0.22);
				left[frame] += Math.sin(phase) * envelope * gainLeft;
				right[frame] += Math.sin(phase) * envelope * gainRight;
			}
			return;
		}
		const snare = note.note === 38 || note.note === 40;
		const length = snare ? 0.16 : note.note >= 49 ? 0.5 : 0.06;
		const level = peak * (snare ? 0.9 : 0.5);
		const lastFrame = Math.min(frameCount, startFrame + Math.ceil((length + 0.02) * sampleRate));
		for (let frame = startFrame; frame < lastFrame; frame++) {
			const t = frame / sampleRate - note.time;
			const envelope = level * (0.001 / level) ** Math.min(1, t / length);
			const value = noiseAt(seed, frame - startFrame) * envelope;
			left[frame] += value * gainLeft;
			right[frame] += value * gainRight;
		}
	}

	for (const note of notes) {
		const startFrame = Math.floor(note.time * sampleRate);
		if (startFrame >= frames) continue;
		const peak = master * Math.max(0.02, (note.velocity / 127) * note.gain);
		const voices = note.voices ?? [];
		if (voices.length > 0) {
			for (const voice of voices) {
				renderSampled(left, right, sampleRate, note, voice, peak, startFrame, frames);
			}
		} else {
			renderSynth(left, right, sampleRate, note, peak, startFrame, frames);
		}
	}
	return {
		sampleRate,
		left,
		right,
		firstNoteTime: notes.reduce((first, note) => Math.min(first, note.time), Infinity),
		loopStart,
		loopEnd: duration,
		duration,
	};
}

/**
 * Renders one file as several stems that line up: each named group of channels is rendered on its
 * own, and every stem is padded with silence to the length of the longest, so they start together,
 * loop together and can be mixed by level for adaptive music (`AdaptiveMusic`). A group with no
 * notes in the file comes out silent rather than failing, since an arrangement may leave a layer
 * empty. All options of `renderMidiToBuffer` apply, `channels` excepted.
 *
 * @example
 * ```ts
 * import { parseMidi, renderMidiStems } from '@datamoc/mwg/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const stems = renderMidiStems(parseMidi(midiBytes), { rhythm: [9], melody: [0, 1], pads: [2] });
 * console.log(stems.rhythm.duration === stems.melody.duration); // true
 * ```
 */
export function renderMidiStems(
	file: MidiFile,
	groups: Record<string, readonly number[]>,
	options: Omit<RenderMidiOptions, 'channels'> = {},
): Record<string, RenderedMidi> {
	const scheduled = scheduleMidi(file);
	const rendered: Record<string, RenderedMidi | null> = {};
	for (const [name, channels] of Object.entries(groups)) {
		const wanted = new Set(channels);
		const hasNotes = scheduled.some((note) => wanted.has(note.channel));
		rendered[name] = hasNotes ? renderMidiToBuffer(file, { ...options, channels }) : null;
	}
	const frames = Math.max(1, ...Object.values(rendered).map((stem) => stem?.left.length ?? 0));
	const sampleRate =
		Object.values(rendered).find((stem) => stem)?.sampleRate ?? options.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const duration = frames / sampleRate;
	const loopStart = Math.min(midiLoopStart(file) ?? 0, Math.max(0, duration - 0.1));
	const stems: Record<string, RenderedMidi> = {};
	for (const [name, stem] of Object.entries(rendered)) {
		const left = new Float32Array(frames);
		const right = new Float32Array(frames);
		if (stem) {
			left.set(stem.left);
			right.set(stem.right);
		}
		stems[name] = {
			sampleRate,
			left,
			right,
			firstNoteTime: stem?.firstNoteTime ?? null,
			loopStart,
			loopEnd: duration,
			duration,
		};
	}
	return stems;
}

/**
 * Bytes retained by the PCM backing buffers, counting a shared buffer once. This excludes
 * player AudioBuffer copies and other objects. It also works after mono or resampling.
 *
 * @example
 * ```ts
 * import { renderedMidiBytes, renderMidiToBuffer, parseMidi } from '@datamoc/mwg/audio';
 * declare const bytes: ArrayBuffer;
 * console.log(renderedMidiBytes(renderMidiToBuffer(parseMidi(bytes))));
 * ```
 */
export function renderedMidiBytes(track: Pick<RenderedMidi, 'left' | 'right'>): number {
	return (
		track.left.buffer.byteLength + (track.left.buffer === track.right.buffer ? 0 : track.right.buffer.byteLength)
	);
}

/**
 * Copies a rendered MIDI track into a stereo `AudioBuffer` of the given context. The frames are
 * written through `getChannelData`, so the `Float32Array` views a render hands back need no
 * conversion first.
 *
 * @example
 * ```ts
 * import { parseMidi, renderMidiToBuffer, toAudioBuffer } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const midiBytes: ArrayBuffer;
 *
 * const buffer = toAudioBuffer(context, renderMidiToBuffer(parseMidi(midiBytes)));
 * ```
 */
export function toAudioBuffer(context: BaseAudioContext, rendered: RenderedMidi): AudioBuffer {
	const buffer = context.createBuffer(2, Math.max(1, rendered.left.length), rendered.sampleRate);
	buffer.getChannelData(0).set(rendered.left);
	buffer.getChannelData(1).set(rendered.right);
	return buffer;
}
