import { Signal } from '../core/Signal.ts';
import { midiLoopStart, timedMidiMessages, type MidiFile } from './Midi.ts';
import type { RenderedMidi } from './MidiRender.ts';

/**
 * A synthesiser that voices MIDI messages: the seam that lets something other than a
 * `SoundFont` or the built-in approximation be the sound bank of a MIDI file. mwg owns the
 * contract so the core never depends on whoever implements it; a retro-instrument package
 * satisfies it from the outside and registers its engines by name.
 */
export interface MidiSynth {
	/** rate the synth renders at; a render of a file through it comes out at this rate */
	readonly sampleRate: number;
	/** a channel message as the three bytes a hardware synth would receive (the second data byte is 0 for a program change) */
	event(status: number, data1: number, data2: number): void;
	/** a system-exclusive message, with or without the leading 0xF0 and trailing 0xF7 */
	sysex(bytes: Uint8Array): void;
	/** adds `count` frames of stereo output at `start` of both buffers, advancing the synth by that many samples */
	render(left: Float32Array, right: Float32Array, start: number, count: number): void;
	/** silences every voice and returns the synth to its power-on state */
	reset(): void;
}

/** builds a synth for an output rate; may throw, which the resolver turns into a fallback */
export type MidiSynthFactory = (sampleRate: number) => MidiSynth;

/** a registered engine name, a factory, or an ordered list of either tried until one works */
export type MidiSynthRequest = string | MidiSynthFactory | readonly (string | MidiSynthFactory)[];

/**
 * The two engine names that are not synths: they mean "the internal path", SoundFont when
 * one is given, else the built-in approximation.
 *
 * @example
 * ```ts
 * import { INTERNAL_MIDI_ENGINES } from '@datamoc/mwg/audio';
 *
 * console.log(INTERNAL_MIDI_ENGINES.includes('builtin')); // true
 * ```
 */
export const INTERNAL_MIDI_ENGINES: readonly string[] = ['gm-soundfont', 'builtin'];

/** told when a requested engine could not be used and another voiced the file instead */
export interface MidiSynthFallback {
	/** what was asked for first */
	requested: string;
	/** what voiced the file instead */
	used: string;
	reason: 'unknown' | 'failed';
	message?: string;
}

/**
 * Fires on every fallback, so a game can show "MT-32 unavailable, using the SoundFont"
 * instead of a silent change of sound.
 *
 * @example
 * ```ts
 * import { onMidiSynthFallback } from '@datamoc/mwg/audio';
 *
 * onMidiSynthFallback.add(({ requested, used }) => console.log(requested, '->', used));
 * ```
 */
export const onMidiSynthFallback = new Signal<MidiSynthFallback>();

const engines = new Map<string, MidiSynthFactory>();

/**
 * Registers a named engine so content can say `synth: "retro:mt32"`. A name that is already
 * registered is replaced, and the two internal names are reserved.
 *
 * @example
 * ```ts
 * import { registerMidiSynth, type MidiSynth } from '@datamoc/mwg/audio';
 *
 * declare function createMt32(sampleRate: number): MidiSynth;
 *
 * registerMidiSynth('retro:mt32', createMt32);
 * ```
 */
export function registerMidiSynth(name: string, factory: MidiSynthFactory): void {
	if (INTERNAL_MIDI_ENGINES.includes(name)) throw new Error(`"${name}" is a reserved MIDI engine name`);
	engines.set(name, factory);
}

/**
 * Forgets a named engine; returns whether it was registered.
 *
 * @example
 * ```ts
 * import { unregisterMidiSynth } from '@datamoc/mwg/audio';
 *
 * console.log(unregisterMidiSynth('retro:mt32')); // true when it was registered
 * ```
 */
export function unregisterMidiSynth(name: string): boolean {
	return engines.delete(name);
}

/**
 * Every name a request can use: the registered engines and the two internal ones.
 *
 * @example
 * ```ts
 * import { midiSynthNames } from '@datamoc/mwg/audio';
 *
 * console.log(midiSynthNames()); // ['gm-soundfont', 'builtin', ...registered engines]
 * ```
 */
export function midiSynthNames(): string[] {
	return [...INTERNAL_MIDI_ENGINES, ...engines.keys()];
}

export interface ResolvedMidiSynth {
	/** null when the internal path voices the file */
	synth: MidiSynth | null;
	/** the engine that was settled on: a registered name, `'custom'` for a bare factory, or the internal name */
	name: string;
}

/**
 * Walks a request in order and settles on the first engine that works: a registered name is
 * looked up, a factory is called, an internal name ends the walk. An unknown name, a factory
 * that throws or a synth with a bad shape is skipped, and when something other than the first
 * choice ends up voicing the file `onMidiSynthFallback` says so. Never throws: running out of
 * choices lands on the internal path.
 *
 * @example
 * ```ts
 * import { resolveMidiSynth } from '@datamoc/mwg/audio';
 *
 * const { synth, name } = resolveMidiSynth(['retro:mt32', 'retro:opl2'], 44100, 'gm-soundfont');
 * console.log(name, synth === null ? 'internal path' : synth.sampleRate);
 * ```
 */
export function resolveMidiSynth(
	request: MidiSynthRequest,
	sampleRate: number,
	internalName: 'gm-soundfont' | 'builtin',
): ResolvedMidiSynth {
	const choices = typeof request === 'string' || typeof request === 'function' ? [request] : request;
	const label = (choice: string | MidiSynthFactory): string => (typeof choice === 'string' ? choice : 'custom');
	let requested = '';
	let reason: MidiSynthFallback['reason'] = 'unknown';
	let message: string | undefined;
	let settled: ResolvedMidiSynth | null = null;
	for (const choice of choices) {
		requested ||= label(choice);
		if (typeof choice === 'string' && INTERNAL_MIDI_ENGINES.includes(choice)) break;
		const factory = typeof choice === 'string' ? engines.get(choice) : choice;
		if (!factory) {
			reason = 'unknown';
			message = `no MIDI engine named "${String(choice)}" is registered`;
			continue;
		}
		try {
			const synth = factory(sampleRate);
			if (!isMidiSynth(synth)) throw new Error('the factory did not return a MidiSynth');
			settled = { synth, name: label(choice) };
			break;
		} catch (error) {
			reason = 'failed';
			message = error instanceof Error ? error.message : String(error);
		}
	}
	const result = settled ?? { synth: null, name: internalName };
	if (requested && result.name !== requested) notifyFallback(requested, result.name, reason, message);
	return result;
}

function notifyFallback(requested: string, used: string, reason: MidiSynthFallback['reason'], message?: string): void {
	onMidiSynthFallback.dispatch({ requested, used, reason, ...(message ? { message } : {}) });
}

function isMidiSynth(value: unknown): value is MidiSynth {
	const synth = value as Partial<MidiSynth> | null;
	return (
		!!synth &&
		typeof synth.event === 'function' &&
		typeof synth.render === 'function' &&
		typeof synth.reset === 'function' &&
		typeof synth.sysex === 'function' &&
		typeof synth.sampleRate === 'number' &&
		synth.sampleRate > 0
	);
}

export interface RenderThroughSynthOptions {
	/** hard cap on rendered seconds; longer tails are cut */
	maxDuration?: number;
	/** seconds of release left after the last message; 1.5 when omitted */
	tail?: number;
	/** master level, 0 to 1; 1 when omitted since a synth owns its own output level */
	gain?: number;
	/** channels (0 to 15) whose messages are dropped, for stems and adaptive mixes */
	mutedChannels?: Iterable<number>;
	/** frames rendered per call into the synth; 1024 when omitted */
	blockSize?: number;
}

const DEFAULT_TAIL = 1.5;
const DEFAULT_MAX_DURATION = 8 * 60;
const DEFAULT_BLOCK = 1024;

/**
 * Renders a MIDI file through a `MidiSynth` to stereo frames, the same `RenderedMidi` the
 * SoundFont path produces, so it plays, loops and seeks like any other track. Messages are
 * delivered at their exact sample, not rounded to a block, so a synth sees the timing the file
 * wrote. The synth is reset first and again afterwards, which leaves it reusable.
 *
 * @example
 * ```ts
 * import { parseMidi, renderMidiThroughSynth, type MidiSynth } from '@datamoc/mwg/audio';
 *
 * declare const synth: MidiSynth;
 * declare const midiBytes: ArrayBuffer;
 *
 * const rendered = renderMidiThroughSynth(parseMidi(midiBytes), synth);
 * console.log(rendered.sampleRate, rendered.duration);
 * ```
 */
export function renderMidiThroughSynth(
	file: MidiFile,
	synth: MidiSynth,
	options: RenderThroughSynthOptions = {},
): RenderedMidi {
	const tail = options.tail ?? DEFAULT_TAIL;
	const maxDuration = options.maxDuration ?? DEFAULT_MAX_DURATION;
	const gain = options.gain ?? 1;
	const block = Math.max(1, Math.floor(options.blockSize ?? DEFAULT_BLOCK));
	if (!(maxDuration > 0)) throw new Error('render max duration must be positive');
	if (!(gain >= 0)) throw new Error('render gain must not be negative');
	const muted = new Set(options.mutedChannels ?? []);

	const messages = timedMidiMessages(file).filter(
		(message) => message.time < maxDuration && !muted.has(message.status & 0x0f),
	);
	if (!messages.some((message) => (message.status & 0xf0) === 0x90 && message.data2 > 0)) {
		throw new Error('MIDI file has no notes');
	}
	const sampleRate = synth.sampleRate;
	const end = messages.reduce((latest, message) => Math.max(latest, message.time), 0);
	const duration = Math.min(maxDuration, end + tail);
	const frames = Math.max(1, Math.ceil(duration * sampleRate));
	const left = new Float32Array(frames);
	const right = new Float32Array(frames);

	synth.reset();
	try {
		let frame = 0;
		for (const message of messages) {
			const target = Math.min(frames, Math.floor(message.time * sampleRate));
			frame = advance(synth, left, right, frame, target, block);
			synth.event(message.status, message.data1, message.data2);
		}
		advance(synth, left, right, frame, frames, block);
	} finally {
		synth.reset();
	}

	if (gain !== 1) {
		for (let i = 0; i < frames; i++) {
			left[i] *= gain;
			right[i] *= gain;
		}
	}
	const loopStart = Math.min(midiLoopStart(file) ?? 0, Math.max(0, duration - 0.1));
	return { sampleRate, left, right, loopStart, loopEnd: duration, duration };
}

function advance(
	synth: MidiSynth,
	left: Float32Array,
	right: Float32Array,
	from: number,
	to: number,
	block: number,
): number {
	let frame = from;
	while (frame < to) {
		const count = Math.min(block, to - frame);
		synth.render(left, right, frame, count);
		frame += count;
	}
	return frame;
}
