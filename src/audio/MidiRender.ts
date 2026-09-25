import { midiLoopStart, noteToFrequency, scheduleMidi, type MidiFile, type ScheduledNote } from './Midi.ts';
import type { SoundFont, SoundFontVoice } from './SoundFont.ts';

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
 * SoundFont makes such a difference. Pitch bend is parsed and exposed on the file's
 * events but voiced unbent here.
 */

export interface RenderMidiOptions {
	/** voices every note from these samples; without one the built-in synth plays */
	soundfont?: SoundFont | null;
	/** output sample rate in Hz */
	sampleRate?: number;
	/** master level, 0 to 1 */
	gain?: number;
	/** hard cap on rendered seconds; longer tails are cut */
	maxDuration?: number;
}

export interface RenderedMidi {
	sampleRate: number;
	left: Float32Array;
	right: Float32Array;
	/** seconds the loop jumps back to: the file's controller-111 marker, else 0 */
	loopStart: number;
	/** seconds the loop wraps from: the end of the render */
	loopEnd: number;
	/** total rendered seconds, equal to loopEnd */
	duration: number;
}

const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_MASTER_GAIN = 0.35;
const DEFAULT_MAX_DURATION = 8 * 60;

/**
 * Renders a parsed MIDI file to stereo PCM frames: one offline pass, then the result
 * plays, loops, seeks and re-pitches like any decoded track. Deterministic: the same
 * file and options always produce the same frames, so a test can render and assert
 * without any audio hardware.
 *
 * @example
 * ```ts
 * import { parseMidi, renderMidiToBuffer } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const rendered = renderMidiToBuffer(parseMidi(midiBytes));
 * console.log(rendered.duration, rendered.loopStart, rendered.loopEnd);
 * ```
 */
export function renderMidiToBuffer(file: MidiFile, options: RenderMidiOptions = {}): RenderedMidi {
	const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
	const master = options.gain ?? DEFAULT_MASTER_GAIN;
	const maxDuration = options.maxDuration ?? DEFAULT_MAX_DURATION;
	if (!(sampleRate > 0)) throw new Error('render sample rate must be positive');
	if (!(master >= 0)) throw new Error('render gain must not be negative');
	if (!(maxDuration > 0)) throw new Error('render max duration must be positive');

	const notes = scheduleMidi(file).filter((note) => note.time < maxDuration);
	if (notes.length === 0) throw new Error('MIDI file has no notes');
	const tail = notes.reduce((latest, note) => Math.max(latest, note.time + note.duration), 0);
	const duration = Math.min(maxDuration, tail + 1.5);
	const frames = Math.max(1, Math.ceil(duration * sampleRate));
	const left = new Float32Array(frames);
	const right = new Float32Array(frames);

	const loopStart = Math.min(midiLoopStart(file) ?? 0, Math.max(0, duration - 0.1));
	const soundfont = options.soundfont ?? null;
	const voiceCache = new Map<string, SoundFontVoice[]>();
	for (const note of notes) {
		const startFrame = Math.floor(note.time * sampleRate);
		if (startFrame >= frames) continue;
		const peak = master * Math.max(0.02, (note.velocity / 127) * note.gain);
		const voices = soundfont ? sampledVoices(soundfont, voiceCache, note) : [];
		if (voices.length > 0) {
			for (const voice of voices) {
				renderSampled(left, right, sampleRate, note, voice, peak, startFrame, frames);
			}
		} else {
			renderSynth(left, right, sampleRate, note, peak, startFrame, frames);
		}
	}
	return { sampleRate, left, right, loopStart, loopEnd: duration, duration };
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
	const ratio = 2 ** (((note.note - voice.rootKey) * 100 + voice.cents) / 1200);
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
				(sustainLevel - level) * ((t - attack - voice.hold) / Math.max(1e-6, decayEnd - attack - voice.hold));
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
		return { wave: 'sawtooth', attack: 0.004, decay: 0.6, sustain: 0.15, release: 0.15, detune: 0, cutoff: 3000 };
	}
	if (program < 40) return { wave: 'triangle', attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.1, detune: 0 };
	if (program < 56) {
		return { wave: 'sawtooth', attack: 0.12, decay: 0.2, sustain: 0.8, release: 0.3, detune: 6, cutoff: 3500 };
	}
	if (program < 80) {
		return { wave: 'sawtooth', attack: 0.04, decay: 0.15, sustain: 0.75, release: 0.12, detune: 0, cutoff: 4500 };
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
	note: ScheduledNote,
	peak: number,
	startFrame: number,
	frameCount: number,
): void {
	if (note.channel === 9) {
		renderDrum(left, right, sampleRate, note, peak, startFrame, frameCount);
		return;
	}
	const recipe = recipeFor(note.program);
	const frequency = noteToFrequency(note.note) * 2 ** (recipe.detune / 1200);
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
