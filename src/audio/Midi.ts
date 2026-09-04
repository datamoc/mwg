import { playTone, type ToneOptions, type Waveform } from './Synth.ts';
import type { Playable } from './Playable.ts';

/**
 * A Standard MIDI File (SMF) reader plus a player that voices each note through
 * `audio.synthesizeTone` - `.mid` is a small, patent-free, well-documented event format
 * (timing and note-on/note-off, not audio), so reading one is ordinary format engineering,
 * and playback needed exactly the instrument item 120's waveform synth already supplies: a
 * crude but real, entirely generated-not-borrowed one, closer to a chiptune cover than a
 * sampled orchestra.
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

export type MidiEvent = MidiNoteEvent | MidiTempoEvent;

export interface MidiFile {
	ticksPerQuarter: number;
	/** every note-on/note-off and tempo-change event from every track, merged and sorted by tick */
	events: readonly MidiEvent[];
}

const DEFAULT_TEMPO = 500000; // 120 BPM

/** Reads format 0/1 Standard MIDI File bytes into a flat, tick-ordered event list. */
export function parseMidi(data: ArrayBuffer | ArrayBufferView): MidiFile {
	const bytes = data instanceof ArrayBuffer
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
	const readUint32 = (): number => { const v = view.getUint32(offset, false); offset += 4; return v; };
	const readUint16 = (): number => { const v = view.getUint16(offset, false); offset += 2; return v; };
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
				} else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
					offset += 2;
				} else if (type === 0xc0 || type === 0xd0) {
					offset += 1;
				} else {
					throw new Error(`unsupported MIDI status byte 0x${statusByte.toString(16)}`);
				}
			}
		}
	}

	events.sort((a, b) => a.tick - b.tick);
	return { ticksPerQuarter, events };
}

export interface ScheduledNote {
	/** seconds from the start of playback */
	time: number;
	duration: number;
	note: number;
	velocity: number;
	channel: number;
}

/**
 * Resolves a parsed file's tick-based events into real-time seconds, honouring tempo
 * changes and pairing each note-on with its matching note-off to find a duration. A
 * note-on with no matching note-off (a malformed or truncated file) still sounds, for a
 * short default duration, rather than being dropped silently.
 */
export function scheduleMidi(file: MidiFile): ScheduledNote[] {
	const notes: ScheduledNote[] = [];
	const active = new Map<string, { time: number; velocity: number }>();

	let tempo = DEFAULT_TEMPO;
	let lastTick = 0;
	let time = 0;

	for (const event of file.events) {
		time += ((event.tick - lastTick) * tempo) / file.ticksPerQuarter / 1_000_000;
		lastTick = event.tick;

		if (event.type === 'tempo') {
			tempo = event.microsecondsPerQuarter;
			continue;
		}

		const key = `${event.channel}:${event.note}`;
		if (event.type === 'noteOn') {
			active.set(key, { time, velocity: event.velocity });
		} else {
			const start = active.get(key);
			if (start) {
				notes.push({ time: start.time, duration: Math.max(0.01, time - start.time), note: event.note, velocity: start.velocity, channel: event.channel });
				active.delete(key);
			}
		}
	}

	for (const [key, start] of active) {
		const [channel, note] = key.split(':').map(Number);
		notes.push({ time: start.time, duration: 0.3, note, velocity: start.velocity, channel });
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
