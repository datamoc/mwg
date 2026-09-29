import type { MidiFile, MidiNoteEvent } from '../Midi.ts';
import { subdivisionCount, subdivisionTicks, type GridSubdivision, type GrooveTemplate } from './Groove.ts';
import { detectOnsets } from './Onsets.ts';

/**
 * Builds `GrooveTemplate`s from three kinds of evidence, all reduced to the same shape by
 * the same last step: collect a pile of per-slot deviations, take the median of each, and
 * fill the slots nobody played with the neutral offsets (0, 1.0).
 *
 * The median is the whole reason a groove can be recovered from evidence this noisy. A
 * single flubbed note drags a mean off the grid; with medians it is one sample among
 * several and disappears. It also gives a slot with no evidence at all a defensible
 * answer: nothing was measured, so the slot keeps the grid position and the default
 * velocity, rather than inventing a deviation from an empty list.
 */

/** every extracted template carries the mode's name so a save can say where it came from */
const EXTRACTED_NAME = 'extracted';

/** extraction reads one bar of 4/4; a signature is written out and re-checked on import */
const EXTRACTED_SIGNATURE: [number, number] = [4, 4];

/** tempo assumed when the recorded file states none, which is the General MIDI default */
const DEFAULT_BPM = 120;

/** the tempo Mode C is measured against when the caller does not supply one */
const AUDIO_DEFAULT_BPM = 120;

/** ticks per quarter for audio-derived templates, chosen because nothing ties them to a file */
const AUDIO_PPQ = 480;

export interface GrooveExtractorEngine {
	/**
	 * Mode A: align two performances of the same material - one played straight, one
	 * played - and keep how far each played note sat from its quantized counterpart.
	 */
	extractFromMidiPair(
		quantizedMidi: MidiFile,
		recordedMidi: MidiFile,
		gridSubdivision?: GridSubdivision,
	): Promise<GrooveTemplate>;
	/**
	 * Mode B: one performance and no reference. The notes themselves are projected onto
	 * the nearest grid slot, so what comes back is the residual of a played file against
	 * its own implied grid - the deviations a straight quantization would remove.
	 */
	extractFromSingleMidi(recordedMidi: MidiFile, gridSubdivision?: GridSubdivision): Promise<GrooveTemplate>;
	/**
	 * Mode C: a recording instead of a file. The tempo is an argument rather than
	 * something read off the signal, because timing is meaningless without it.
	 */
	extractFromAudioBuffer(
		audioBuffer: AudioBuffer,
		gridSubdivision?: '8n' | '16n',
		tempoBpm?: number,
	): Promise<GrooveTemplate>;
}

interface Samples {
	time: number[];
	velocity: number[];
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundedMedian(values: readonly number[]): number {
	return Math.round(median(values));
}

/** the file's tempo in beats per minute: its first tempo event, or the General MIDI default */
function tempoOf(midi: MidiFile): number {
	for (const event of midi.events) {
		if (event.type === 'tempo') return Math.round((60_000_000 / event.microsecondsPerQuarter) * 100) / 100;
	}
	return DEFAULT_BPM;
}

function noteOns(midi: MidiFile): MidiNoteEvent[] {
	return midi.events.filter((event): event is MidiNoteEvent => event.type === 'noteOn');
}

/** the flat list of note velocities, which Mode B needs a typical value out of */
function velocitiesOf(midi: MidiFile): number[] {
	return noteOns(midi).map((event) => event.velocity);
}

function finish(
	slots: readonly Samples[],
	subdivision: GridSubdivision,
	ppq: number,
	tempoBpm: number,
	velocityFrom: (slot: Samples) => number,
): GrooveTemplate {
	const offsets = slots.map((slot, subdivisionIndex) => ({
		subdivisionIndex,
		timeOffsetTicks: slot.time.length > 0 ? roundedMedian(slot.time) : 0,
		velocityFactor: slot.velocity.length > 0 ? velocityFrom(slot) : 1,
	}));

	return {
		name: EXTRACTED_NAME,
		timeSignature: [...EXTRACTED_SIGNATURE],
		ppq,
		tempoBpm,
		subdivision,
		offsets,
	};
}

/**
 * Extracts a groove template from a pair of performances of the same material.
 *
 * Every note-on in `recordedMidi` is matched to the closest still-unused note-on of the
 * same channel and pitch in `quantizedMidi`. A match is only taken when it falls inside
 * half a slot, so a recorded part with notes the quantized one never plays is ignored
 * instead of being forced onto a neighbour, and a slot the pair never reaches keeps the
 * neutral offset rather than a value invented from no evidence at all.
 *
 * @example
 * ```ts
 * import { parseMidi, GrooveExtractor, type GrooveTemplate } from '@datamoc/mw_games/audio';
 *
 * declare const straightBytes: ArrayBuffer;
 * declare const playedBytes: ArrayBuffer;
 *
 * const straight = parseMidi(straightBytes);
 * const played = parseMidi(playedBytes);
 *
 * const template = await new GrooveExtractor().extractFromMidiPair(straight, played, '16n');
 * console.log(template.offsets[0].timeOffsetTicks, template.name); // 0 'extracted'
 * ```
 */
export class GrooveExtractor implements GrooveExtractorEngine {
	async extractFromMidiPair(
		quantizedMidi: MidiFile,
		recordedMidi: MidiFile,
		gridSubdivision: GridSubdivision = '16n',
	): Promise<GrooveTemplate> {
		const ppq = recordedMidi.ticksPerQuarter;
		const slotTicks = subdivisionTicks(ppq, gridSubdivision);
		const slots = subdivisionCount(EXTRACTED_SIGNATURE, gridSubdivision);
		//the reference may have been quantized against a different ppq: scale it into the
		//recorded file's ticks before any of the comparisons below mean anything
		const scale = ppq / quantizedMidi.ticksPerQuarter;

		const reference = noteOns(quantizedMidi).map((event) => ({
			channel: event.channel,
			note: event.note,
			tick: event.tick * scale,
			velocity: event.velocity,
		}));
		const used = new Set<number>();

		//each played note claims its nearest untouched reference of the same channel and
		//pitch; the ratio, not the difference, of the two velocities is what survives, so
		//the template scales a performance instead of reproducing its own absolute levels
		const matches: { slotTick: number; delta: number; factor: number | null }[] = [];
		for (const played of noteOns(recordedMidi)) {
			let bestIndex = -1;
			let bestDistance = Infinity;
			for (let i = 0; i < reference.length; i++) {
				const candidate = reference[i];
				if (used.has(i) || candidate.channel !== played.channel || candidate.note !== played.note) continue;
				const distance = Math.abs(candidate.tick - played.tick);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestIndex = i;
				}
			}
			if (bestIndex < 0 || bestDistance > slotTicks / 2) continue;
			used.add(bestIndex);
			matches.push({
				slotTick: reference[bestIndex].tick,
				delta: played.tick - reference[bestIndex].tick,
				factor: reference[bestIndex].velocity > 0 ? played.velocity / reference[bestIndex].velocity : null,
			});
		}

		const buckets: Samples[] = Array.from({ length: slots }, () => ({ time: [], velocity: [] }));
		for (const match of matches) {
			const index = ((Math.round(match.slotTick / slotTicks) % slots) + slots) % slots;
			buckets[index].time.push(match.delta);
			if (match.factor !== null) buckets[index].velocity.push(match.factor);
		}

		return finish(buckets, gridSubdivision, ppq, tempoOf(recordedMidi), (slot) => median(slot.velocity));
	}

	async extractFromSingleMidi(
		recordedMidi: MidiFile,
		gridSubdivision: GridSubdivision = '16n',
	): Promise<GrooveTemplate> {
		const ppq = recordedMidi.ticksPerQuarter;
		const slotTicks = subdivisionTicks(ppq, gridSubdivision);
		const slots = subdivisionCount(EXTRACTED_SIGNATURE, gridSubdivision);
		const buckets: Samples[] = Array.from({ length: slots }, () => ({ time: [], velocity: [] }));

		for (const event of noteOns(recordedMidi)) {
			//project onto the nearest slot: the residual is how far the performance sat
			//from its own implied grid, which is what a single file can actually show
			const nearest = Math.round(event.tick / slotTicks) * slotTicks;
			const index = ((Math.round(nearest / slotTicks) % slots) + slots) % slots;
			buckets[index].time.push(event.tick - nearest);
			buckets[index].velocity.push(event.velocity);
		}

		const typical = median(velocitiesOf(recordedMidi));
		return finish(buckets, gridSubdivision, ppq, tempoOf(recordedMidi), (slot) =>
			typical <= 0 ? 1 : median(slot.velocity) / typical,
		);
	}

	async extractFromAudioBuffer(
		audioBuffer: AudioBuffer,
		gridSubdivision: '8n' | '16n' = '16n',
		tempoBpm: number = AUDIO_DEFAULT_BPM,
	): Promise<GrooveTemplate> {
		if (!Number.isFinite(tempoBpm) || tempoBpm <= 0)
			throw new Error(`tempoBpm must be greater than 0, got ${String(tempoBpm)}`);

		const channelData: Float32Array[] = [];
		for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++)
			channelData.push(audioBuffer.getChannelData(channel));

		const mono = new Float32Array(audioBuffer.length);
		for (const data of channelData) for (let i = 0; i < data.length; i++) mono[i] += data[i] / channelData.length;

		const onsets = detectOnsets(mono, audioBuffer.sampleRate);
		if (onsets.length === 0)
			throw new Error(
				'no onsets detected in the buffer - a groove needs audible attacks, and this audio has none',
			);

		const ppq = AUDIO_PPQ;
		const slotTicks = subdivisionTicks(ppq, gridSubdivision);
		const slots = subdivisionCount(EXTRACTED_SIGNATURE, gridSubdivision);
		const ticksPerSecond = (tempoBpm * ppq) / 60;
		const buckets: Samples[] = Array.from({ length: slots }, () => ({ time: [], velocity: [] }));

		for (const seconds of onsets) {
			const tick = seconds * ticksPerSecond;
			const nearest = Math.round(tick / slotTicks) * slotTicks;
			const index = ((Math.round(nearest / slotTicks) % slots) + slots) % slots;
			buckets[index].time.push(tick - nearest);
		}

		//audio carries no velocity to recover, so every slot stays at the neutral factor
		return finish(buckets, gridSubdivision, ppq, tempoBpm, () => 1);
	}
}
