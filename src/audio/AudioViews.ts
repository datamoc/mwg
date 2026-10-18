import { timedMidiMessages, type MidiFile, type MidiNoteEvent } from './Midi.ts';

/** one bucket of a waveform view: the lowest and highest sample it covers */
export interface WaveformBucket {
	min: number;
	max: number;
}

/**
 * A waveform reduced to `buckets` min/max pairs, what an oscilloscope or overview strip
 * draws: each bucket covers an equal span of the samples (the last may be shorter), so a
 * peak that lasts one sample still shows, which a plain average would erase.
 *
 * @example
 * ```ts
 * import { waveformEnvelope } from '@datamoc/mwg/audio';
 *
 * const view = waveformEnvelope(new Float32Array([0, 1, -1, 0.5]), 2);
 * console.log(view); // [{ min: 0, max: 1 }, { min: -1, max: 0.5 }]
 * ```
 */
export function waveformEnvelope(samples: Float32Array, buckets: number): WaveformBucket[] {
	if (buckets < 1 || samples.length === 0) return [];
	const out: WaveformBucket[] = [];
	for (let bucket = 0; bucket < buckets; bucket++) {
		const from = Math.floor((bucket * samples.length) / buckets);
		const to = Math.max(from + 1, Math.floor(((bucket + 1) * samples.length) / buckets));
		let min = Infinity;
		let max = -Infinity;
		for (let i = from; i < Math.min(to, samples.length); i++) {
			if (samples[i] < min) min = samples[i];
			if (samples[i] > max) max = samples[i];
		}
		out.push({ min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max });
	}
	return out;
}

/**
 * Per-channel waveform envelopes of stereo frames: channel 0 is the left, 1 the right,
 * and a view asks each channel for the same number of buckets.
 *
 * @example
 * ```ts
 * import { channelEnvelopes } from '@datamoc/mwg/audio';
 *
 * const [left] = channelEnvelopes(new Float32Array([1, -1]), new Float32Array([0.5, -0.5]), 1);
 * console.log(left); // [{ min: -1, max: 1 }]
 * ```
 */
export function channelEnvelopes(
	left: Float32Array,
	right: Float32Array,
	buckets: number,
): [WaveformBucket[], WaveformBucket[]] {
	return [waveformEnvelope(left, buckets), waveformEnvelope(right, buckets)];
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * A MIDI note number as a tracker spells it: name and octave, middle C as C4.
 *
 * @example
 * ```ts
 * import { trackerNoteName } from '@datamoc/mwg/audio';
 *
 * console.log(trackerNoteName(60)); // 'C4'
 * console.log(trackerNoteName(61)); // 'C#4'
 * ```
 */
export function trackerNoteName(note: number): string {
	return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

/** one row of a tracker pattern: its step, and the note each channel starts on it (null for none) */
export interface TrackerRow {
	step: number;
	/** seconds from the start, of the first note on the row (the previous note's time for an empty row) */
	time: number;
	notes: (string | null)[];
}

/**
 * A MIDI file as tracker pattern rows: `stepsPerQuarter` rows per quarter note, one
 * column per channel that plays, and a cell naming the note that starts on that row
 * (the highest when a channel starts several at once, as a tracker cell holds one).
 * Steps are counted in the file's own ticks, and a row's time follows its tempo map.
 *
 * @example
 * ```ts
 * import { trackerPattern, type MidiFile } from '@datamoc/mwg/audio';
 *
 * declare const file: MidiFile;
 *
 * const rows = trackerPattern(file);
 * console.log(rows[0].notes); // the first step's notes by channel, or nulls
 * ```
 */
export function trackerPattern(file: MidiFile, stepsPerQuarter = 4): TrackerRow[] {
	const starts: MidiNoteEvent[] = [];
	for (const event of file.events) if (event.type === 'noteOn' && event.velocity > 0) starts.push(event);
	if (starts.length === 0) return [];
	//note-on times in file order, from the same walk a synth is driven by
	const times = timedMidiMessages(file)
		.filter((message) => (message.status & 0xf0) === 0x90 && message.data2 > 0)
		.map((message) => message.time);
	const channelCount = Math.max(...starts.map((event) => event.channel)) + 1;
	const stepTicks = file.ticksPerQuarter / stepsPerQuarter;
	const cells = new Map<number, Map<number, number>>();
	let lastStep = 0;
	const stepTime = new Map<number, number>();
	starts.forEach((event, index) => {
		const step = Math.floor(event.tick / stepTicks);
		lastStep = Math.max(lastStep, step);
		if (!cells.has(step)) cells.set(step, new Map());
		const row = cells.get(step)!;
		if (event.note > (row.get(event.channel) ?? -1)) row.set(event.channel, event.note);
		if (!stepTime.has(step)) stepTime.set(step, times[index] ?? 0);
	});
	const rows: TrackerRow[] = [];
	let lastTime = 0;
	for (let step = 0; step <= lastStep; step++) {
		if (stepTime.has(step)) lastTime = stepTime.get(step)!;
		const notes = Array<string | null>(channelCount).fill(null);
		for (const [channel, note] of cells.get(step) ?? []) notes[channel] = trackerNoteName(note);
		rows.push({ step, time: lastTime, notes });
	}
	return rows;
}
