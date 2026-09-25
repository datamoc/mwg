import { playTone, type ToneOptions, type Waveform } from './Synth.ts';
import type { Playable } from './Playable.ts';

/**
 * A Standard MIDI File (SMF) reader plus a player that voices each note through
 * `audio.synthesizeTone` - `.mid` is a small, patent-free, well-documented event format,
 * so reading one is ordinary format engineering, and playback needed exactly the
 * instrument item 120's waveform synth already supplies: a crude but real,
 * entirely generated-not-borrowed one, closer to a chiptune cover than a sampled
 * orchestra.
 *
 * Beyond notes and tempo the reader keeps program changes, bank select and channel
 * controllers (volume, expression, pan, sustain, the RPG Maker loop marker) and pitch
 * bend, and each scheduled note carries the channel voice in effect when it starts,
 * so a sampled renderer can pick the right instrument at the right level.
 */

export interface MidiNoteEvent {
	tick: number;
	type: 'noteOn' | 'noteOff';
	note: number;
	velocity: number;
	channel: number;
}

export interface MidiTempoEvent {
	tick: number;
	type: 'tempo';
	/** microseconds per quarter note */
	microsecondsPerQuarter: number;
}

export interface MidiProgramEvent {
	tick: number;
	type: 'program';
	channel: number;
	/** General MIDI program number, 0 to 127 */
	program: number;
}

export interface MidiControlEvent {
	tick: number;
	type: 'control';
	channel: number;
	/** controller number, 0 to 127: 0 is bank select, 7 volume, 10 pan, 11 expression, 64 sustain, 111 the RPG Maker loop marker */
	controller: number;
	/** controller value, 0 to 127 */
	value: number;
}

export interface MidiPitchBendEvent {
	tick: number;
	type: 'pitchBend';
	channel: number;
	/** signed bend amount, -8192 to 8191, 0 is centered */
	value: number;
}

/** the channel voice in effect when a scheduled note starts */
export interface MidiVoice {
	/** General MIDI program number, 0 to 127 */
	program: number;
	/** bank select (CC0) */
	bank: number;
	/** combined channel volume (CC7) and expression (CC11), 0 to 1 */
	gain: number;
	/** channel pan (CC10), -1 (left) to 1 (right), 0 centered */
	pan: number;
}

export type MidiEvent = MidiNoteEvent | MidiTempoEvent | MidiProgramEvent | MidiControlEvent | MidiPitchBendEvent;

export interface MidiFile {
	ticksPerQuarter: number;
	/** every kept event from every track, merged and sorted by tick */
	events: readonly MidiEvent[];
	/**
	 * Tick of the first controller-111 event (the RPG Maker XP/VX/Ace loop marker),
	 * or null when the file carries none and loops from the start instead.
	 */
	loopStartTick: number | null;
}

const DEFAULT_TEMPO = 500000; // 120 BPM

/** RPG Maker XP/VX/Ace loop a MIDI from this controller to the end (whole file when absent) */
const LOOP_CONTROLLER = 111;

/**
 * Reads format 0/1 Standard MIDI File bytes into a flat, tick-ordered event list.
 *
 * @example
 * ```ts
 * import { parseMidi, scheduleMidi, noteToFrequency, MidiPlayer } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const file = parseMidi(midiBytes);
 * const notes = scheduleMidi(file); // absolute-time notes, ready to voice
 * console.log(noteToFrequency(69)); // 440 - A4
 *
 * const player = new MidiPlayer(file, { waveform: 'triangle' });
 * player.play();
 * // in the game loop:
 * player.update(1 / 60);
 * ```
 */
export function parseMidi(data: ArrayBuffer | ArrayBufferView): MidiFile {
	const bytes =
		data instanceof ArrayBuffer
			? new Uint8Array(data)
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	let offset = 0;
	const readAscii = (length: number): string => {
		let text = '';
		for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[offset + i]);
		offset += length;
		return text;
	};
	const readUint32 = (): number => {
		const v = view.getUint32(offset, false);
		offset += 4;
		return v;
	};
	const readUint16 = (): number => {
		const v = view.getUint16(offset, false);
		offset += 2;
		return v;
	};
	const readVLQ = (): number => {
		let value = 0;
		for (;;) {
			const byte = bytes[offset++];
			value = (value << 7) | (byte & 0x7f);
			if (!(byte & 0x80)) return value;
		}
	};

	if (readAscii(4) !== 'MThd' || readUint32() !== 6) throw new Error('invalid MIDI header chunk');
	const format = readUint16();
	const trackCount = readUint16();
	const division = readUint16();
	if (format !== 0 && format !== 1) throw new Error(`unsupported MIDI format ${format}`);
	if (division & 0x8000) throw new Error('SMPTE-based MIDI timing is not supported');
	const ticksPerQuarter = division;

	const events: MidiEvent[] = [];
	let loopStartTick: number | null = null;
	for (let t = 0; t < trackCount; t++) {
		const chunkId = readAscii(4);
		const chunkLength = readUint32();
		if (chunkId !== 'MTrk') {
			offset += chunkLength; //an unknown chunk type is skipped, not an error
			continue;
		}

		const end = offset + chunkLength;
		let tick = 0;
		let runningStatus = 0;
		while (offset < end) {
			tick += readVLQ();
			let statusByte = bytes[offset];
			if (statusByte < 0x80) {
				statusByte = runningStatus; //this byte is actually the first data byte
			} else {
				offset++;
				if (statusByte < 0xf0) runningStatus = statusByte; //meta/sysex never become running status
			}

			if (statusByte === 0xff) {
				const metaType = bytes[offset++];
				const length = readVLQ();
				if (metaType === 0x51 && length === 3) {
					const microsecondsPerQuarter = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
					events.push({ tick, type: 'tempo', microsecondsPerQuarter });
				}
				offset += length;
			} else if (statusByte === 0xf0 || statusByte === 0xf7) {
				offset += readVLQ();
			} else {
				const type = statusByte & 0xf0;
				const channel = statusByte & 0x0f;
				if (type === 0x80 || type === 0x90) {
					const note = bytes[offset++];
					const velocity = bytes[offset++];
					const isNoteOn = type === 0x90 && velocity > 0;
					events.push({ tick, type: isNoteOn ? 'noteOn' : 'noteOff', note, velocity, channel });
				} else if (type === 0xb0) {
					const controller = bytes[offset++];
					const value = bytes[offset++];
					events.push({ tick, type: 'control', channel, controller, value });
					if (controller === LOOP_CONTROLLER && loopStartTick === null) loopStartTick = tick;
				} else if (type === 0xc0) {
					const program = bytes[offset++];
					events.push({ tick, type: 'program', channel, program });
				} else if (type === 0xe0) {
					const lsb = bytes[offset++];
					const msb = bytes[offset++];
					events.push({ tick, type: 'pitchBend', channel, value: ((msb << 7) | lsb) - 8192 });
				} else if (type === 0xa0 || type === 0xd0) {
					offset += type === 0xa0 ? 2 : 1; //key and channel pressure: timing only, never voiced
				} else {
					throw new Error(`unsupported MIDI status byte 0x${statusByte.toString(16)}`);
				}
			}
		}
	}

	events.sort((a, b) => a.tick - b.tick);
	return { ticksPerQuarter, events, loopStartTick };
}

export interface ScheduledNote extends MidiVoice {
	/** seconds from the start of playback */
	time: number;
	duration: number;
	note: number;
	velocity: number;
	channel: number;
}

interface TempoSegment {
	tick: number;
	time: number;
	microsecondsPerQuarter: number;
}

/** the file's tempo map: each entry gives the playback time at its tick */
function tempoMap(file: MidiFile): TempoSegment[] {
	const map: TempoSegment[] = [{ tick: 0, time: 0, microsecondsPerQuarter: DEFAULT_TEMPO }];
	for (const event of file.events) {
		if (event.type !== 'tempo') continue;
		const last = map[map.length - 1];
		map.push({
			tick: event.tick,
			time:
				last.time + ((event.tick - last.tick) * last.microsecondsPerQuarter) / file.ticksPerQuarter / 1_000_000,
			microsecondsPerQuarter: event.microsecondsPerQuarter,
		});
	}
	return map;
}

/** playback seconds at a tick, honouring every tempo change up to it */
function tickToSeconds(map: readonly TempoSegment[], ticksPerQuarter: number, tick: number): number {
	let entry = map[0];
	for (const candidate of map) {
		if (candidate.tick <= tick) entry = candidate;
		else break;
	}
	return entry.time + ((tick - entry.tick) * entry.microsecondsPerQuarter) / ticksPerQuarter / 1_000_000;
}

/**
 * Seconds from the start of playback at which the file loops (its controller-111
 * marker through the file's own tempo map), or null when the file carries no marker
 * and loops from the start instead.
 *
 * @example
 * ```ts
 * import { parseMidi, midiLoopStart } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const file = parseMidi(midiBytes);
 * console.log(midiLoopStart(file)); // seconds, or null with no loop marker
 * ```
 */
export function midiLoopStart(file: MidiFile): number | null {
	if (file.loopStartTick === null) return null;
	return tickToSeconds(tempoMap(file), file.ticksPerQuarter, file.loopStartTick);
}

/**
 * Resolves a parsed file's tick-based events into real-time seconds, honouring tempo
 * changes and pairing each note-on with its matching note-off to find a duration. A
 * note-on with no matching note-off (a malformed or truncated file) still sounds, for a
 * short default duration, rather than being dropped silently. Each note carries the
 * channel voice in effect when it starts (program, bank, combined volume/expression
 * gain, pan), so a sampled renderer can voice it without re-reading the events.
 */
export function scheduleMidi(file: MidiFile): ScheduledNote[] {
	const map = tempoMap(file);
	const channels = Array.from({ length: 16 }, () => ({
		program: 0,
		bank: 0,
		volume: 100,
		expression: 127,
		pan: 64,
	}));
	const voiceOf = (channel: number): MidiVoice => {
		const state = channels[channel] ?? channels[0];
		return {
			program: state.program,
			bank: state.bank,
			gain: (state.volume / 127) * (state.expression / 127),
			pan: (state.pan - 64) / 64,
		};
	};

	const notes: ScheduledNote[] = [];
	const active = new Map<string, { time: number; velocity: number; voice: MidiVoice }>();

	for (const event of file.events) {
		if (event.type === 'tempo' || event.type === 'pitchBend') continue;
		if (event.type === 'program') {
			(channels[event.channel] ?? channels[0]).program = event.program;
			continue;
		}
		if (event.type === 'control') {
			const state = channels[event.channel] ?? channels[0];
			if (event.controller === 0) state.bank = event.value;
			else if (event.controller === 7) state.volume = event.value;
			else if (event.controller === 10) state.pan = event.value;
			else if (event.controller === 11) state.expression = event.value;
			continue;
		}

		const time = tickToSeconds(map, file.ticksPerQuarter, event.tick);
		const key = `${event.channel}:${event.note}`;
		if (event.type === 'noteOn') {
			active.set(key, { time, velocity: event.velocity, voice: voiceOf(event.channel) });
		} else {
			const start = active.get(key);
			if (start) {
				notes.push({
					time: start.time,
					duration: Math.max(0.01, time - start.time),
					note: event.note,
					velocity: start.velocity,
					channel: event.channel,
					...start.voice,
				});
				active.delete(key);
			}
		}
	}

	for (const [key, start] of active) {
		const [channel, note] = key.split(':').map(Number);
		notes.push({ time: start.time, duration: 0.3, note, velocity: start.velocity, channel, ...start.voice });
	}

	return notes.sort((a, b) => a.time - b.time);
}

/** MIDI note 69 (A4) is 440 Hz; each semitone is a twelfth root of two step */
export function noteToFrequency(note: number): number {
	return 440 * 2 ** ((note - 69) / 12);
}

export interface MidiPlayerOptions {
	waveform?: Waveform;
	/** peak volume; scaled per note by that note's own MIDI velocity */
	volume?: number;
	/** voices one scheduled note; defaults to `audio.playTone` */
	play?: (options: ToneOptions) => Playable;
}

/** Plays a parsed `MidiFile` back through `mwg/audio`'s waveform synth, one tone per note, driven by `update(dt)` like every other dt-driven piece of `mwg/core`. */
export class MidiPlayer {
	private readonly notes: readonly ScheduledNote[];
	private readonly playFn: (options: ToneOptions) => Playable;
	private readonly waveform: Waveform;
	private readonly volume: number;

	private elapsed = 0;
	private index = 0;
	private playing = false;

	constructor(file: MidiFile, options: MidiPlayerOptions = {}) {
		this.notes = scheduleMidi(file);
		this.playFn = options.play ?? playTone;
		this.waveform = options.waveform ?? 'square';
		this.volume = options.volume ?? 0.2;
	}

	play(): void {
		this.playing = this.index < this.notes.length;
	}

	pause(): void {
		this.playing = false;
	}

	/** stops and rewinds to the beginning */
	stop(): void {
		this.playing = false;
		this.elapsed = 0;
		this.index = 0;
	}

	update(dt: number): void {
		if (!this.playing) return;
		this.elapsed += dt;

		while (this.index < this.notes.length && this.notes[this.index].time <= this.elapsed) {
			const note = this.notes[this.index];
			this.playFn({
				waveform: this.waveform,
				frequency: noteToFrequency(note.note),
				duration: note.duration,
				volume: this.volume * (note.velocity / 127),
			});
			this.index++;
		}

		if (this.index >= this.notes.length) this.playing = false;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	/** total playback length in seconds, from the last scheduled note's own end */
	get duration(): number {
		const last = this.notes.at(-1);
		return last ? last.time + last.duration : 0;
	}
}
