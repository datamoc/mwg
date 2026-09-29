import { Generator } from '../../core/Random.ts';
import type { MidiEvent, MidiFile, MidiNoteEvent } from '../Midi.ts';
import { assertGrooveTemplate, subdivisionCount, subdivisionTicks, type GrooveTemplate } from './Groove.ts';

/**
 * The two tiers share this file: the option and engine types, plus the one pass that
 * actually moves notes. The tiers differ only in what they hand it, which is the point -
 * a tier is a policy over the same pass, not a second implementation of it.
 *
 * Two rules shape everything below. The input `MidiFile` is never mutated: every event the
 * pass touches is a fresh object, so a caller can humanize a file and still play the
 * original. And only note-on/note-off events move: tempo, controller, program and pitch
 * bend events are copied through untouched, because shifting them would change what the
 * performance *means* rather than how it is played.
 */

/** which humanizer to run: the two shipped tiers plus the one the spec reserves for a model */
export type HumanizerTier = 'lite' | 'groove' | 'magenta';

/** musical styles scale the timing and velocity spread; they change how wide, not what shape */
export type HumanizeStyle = 'jazz' | 'rock' | 'classical' | 'funk';

export interface HumanizationOptions {
	/** 0 to 1: how much of the template and the noise to apply; 0 returns the file unchanged */
	intensity: number;
	/** standard deviation of the per-note timing noise, in milliseconds (default 8) */
	timingVarianceMs?: number;
	/** standard deviation of the per-note velocity noise, in MIDI velocity units (default 10) */
	velocityVariance?: number;
	/** per-slot deviations to replay; only `GrooveHumanizer` applies one */
	grooveTemplate?: GrooveTemplate;
	/** scales the two spreads: jazz runs looser, classical tighter (default: no scaling) */
	style?: HumanizeStyle;
	/** makes the noise reproducible; left out, the result differs on every call */
	seed?: number;
	/**
	 * Reports what a request needs saying out loud - today, a template whose tempo is far
	 * from the file's. Defaults to `console.warn`, so the signal is never silent by default.
	 */
	onWarn?: (message: string) => void;
}

export interface MidiHumanizerEngine {
	/** the tier this engine implements, as `HumanizerFactory.create` spells it */
	readonly tierName: string;
	/** roughly what the tier costs a bundle, in megabytes: lite is code, magenta is a model */
	readonly approximateSizeMb: number;
	/** loads anything heavy; idempotent, and already called for you by the factory */
	initialize(): Promise<void>;
	/** humanizes a file and returns the result, leaving `midi` untouched */
	process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile>;
}

/** how often the drift wanders, in cycles per quarter note: one cycle across four beats */
const DRIFT_SCALE = 0.25;
/** share of the timing spread the drift takes; the rest is the independent per-note draw */
const DRIFT_RATIO = 0.5;
/** how much a melody's local peaks are lifted, as a fraction of the intensity */
const PEAK_BOOST = 0.15;
/** a template this far from the file's tempo says so instead of silently rescaling */
const TEMPO_TOLERANCE_BPM = 1;
/** Tier 2 keeps kick and bass timing inside this, in milliseconds, however loose the run is */
const ANCHOR_TIMING_MS = 5;
/** General MIDI puts the kit on channel 10, which is channel 9 counted from zero */
const DRUM_CHANNEL = 9;
/** acoustic and bass drum */
const KICK_NOTES = [35, 36];
/** below C3 reads as the bass line rather than as the melody being ornamented */
const BASS_CEILING_NOTE = 48;

const DEFAULT_TIMING_VARIANCE_MS = 8;
const DEFAULT_VELOCITY_VARIANCE = 10;

const STYLE_FACTORS: Record<HumanizeStyle, { timing: number; velocity: number }> = {
	jazz: { timing: 1.3, velocity: 1.1 },
	rock: { timing: 0.8, velocity: 1.2 },
	classical: { timing: 0.6, velocity: 1.4 },
	funk: { timing: 1.0, velocity: 1.3 },
};

const IDENTITY_FACTORS = { timing: 1, velocity: 1 };

interface ResolvedOptions {
	intensity: number;
	timingMs: number;
	velocityVariance: number;
	timingScale: number;
	velocityScale: number;
	template: GrooveTemplate | null;
	warn: (message: string) => void;
}

function resolveOptions(options: HumanizationOptions): ResolvedOptions {
	const intensity = options.intensity;
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1)
		throw new Error(`humanization intensity must be between 0 and 1, got ${String(options.intensity)}`);

	const timingMs = options.timingVarianceMs ?? DEFAULT_TIMING_VARIANCE_MS;
	if (!Number.isFinite(timingMs) || timingMs < 0)
		throw new Error(
			`timingVarianceMs must be a finite number of at least 0, got ${String(options.timingVarianceMs)}`,
		);

	const velocityVariance = options.velocityVariance ?? DEFAULT_VELOCITY_VARIANCE;
	if (!Number.isFinite(velocityVariance) || velocityVariance < 0)
		throw new Error(
			`velocityVariance must be a finite number of at least 0, got ${String(options.velocityVariance)}`,
		);

	const style = options.style ? STYLE_FACTORS[options.style] : IDENTITY_FACTORS;
	const template = options.grooveTemplate ?? null;
	if (template) assertGrooveTemplate(template);

	return {
		intensity,
		timingMs,
		velocityVariance,
		timingScale: style.timing,
		velocityScale: style.velocity,
		template,
		warn: options.onWarn ?? ((message: string) => console.warn(message)),
	};
}

interface TempoSegment {
	tick: number;
	microsecondsPerQuarter: number;
}

/** the file's tempo changes in tick order, with the default tempo standing before the first */
function tempoSegments(events: readonly MidiEvent[]): TempoSegment[] {
	const changes: TempoSegment[] = [];
	for (const event of events) {
		if (event.type === 'tempo')
			changes.push({ tick: event.tick, microsecondsPerQuarter: event.microsecondsPerQuarter });
	}
	changes.sort((a, b) => a.tick - b.tick);

	const segments: TempoSegment[] = [{ tick: 0, microsecondsPerQuarter: 500000 }];
	for (const change of changes) {
		if (change.tick === segments[segments.length - 1].tick) segments[segments.length - 1] = change;
		else segments.push(change);
	}
	return segments;
}

/** beats per minute in effect at a tick, by the last tempo change at or before it */
function bpmAt(segments: readonly TempoSegment[], tick: number): number {
	let low = 0;
	let high = segments.length - 1;
	let found = 0;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (segments[middle].tick <= tick) {
			found = middle;
			low = middle + 1;
		} else high = middle - 1;
	}
	return 60_000_000 / segments[found].microsecondsPerQuarter;
}

function msToTicks(ms: number, ticksPerQuarter: number, bpm: number): number {
	return (ms * ticksPerQuarter * bpm) / 60_000;
}

function ticksToMs(ticks: number, ticksPerQuarter: number, bpm: number): number {
	return (ticks * 60_000) / (ticksPerQuarter * bpm);
}

/** Box-Muller over the seeded generator, keeping the second variate for the next call */
function createGaussian(rng: Generator): () => number {
	let spare: number | null = null;
	return () => {
		if (spare !== null) {
			const value = spare;
			spare = null;
			return value;
		}
		const radius = Math.sqrt(-2 * Math.log(1 - rng.float()));
		const angle = 2 * Math.PI * rng.float();
		spare = radius * Math.sin(angle);
		return radius * Math.cos(angle);
	};
}

/**
 * A seeded one-dimensional gradient (Perlin) noise, which is what the correlated drift in
 * the spec's `Gaussian + drift` is for: the second term is a slow wander that follows the
 * first rather than a second independent draw, the way a player speeds up across a phrase.
 */
function createDriftNoise(rng: Generator): (x: number) => number {
	const table = new Uint8Array(256);
	for (let i = 0; i < 256; i++) table[i] = i;
	for (let i = 255; i > 0; i--) {
		const j = rng.int(i + 1);
		const swap = table[i];
		table[i] = table[j];
		table[j] = swap;
	}
	const gradient = (hash: number, x: number): number => (hash & 1 ? x : -x);
	return (x: number): number => {
		const cell = Math.floor(x);
		const fraction = x - cell;
		const fade = fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
		const from = gradient(table[cell & 255], fraction);
		const to = gradient(table[(cell + 1) & 255], fraction - 1);
		return from + fade * (to - from);
	};
}

interface Slot {
	/** the slot's timing deviation in milliseconds at the tempo the template was measured at */
	ms: number;
	factor: number;
}

/** template offsets indexed by slot, already converted out of ticks and into milliseconds */
function slotTable(template: GrooveTemplate): Map<number, Slot> {
	const table = new Map<number, Slot>();
	for (const offset of template.offsets) {
		table.set(offset.subdivisionIndex, {
			ms: ticksToMs(offset.timeOffsetTicks, template.ppq, template.tempoBpm),
			factor: offset.velocityFactor,
		});
	}
	return table;
}

/** Tier 2's melody rule needs to see the whole line before it can spot a local peak */
function markMelodyPeaks(events: readonly MidiEvent[]): Uint8Array {
	const peaks = new Uint8Array(events.length);
	const byChannel = new Map<number, { index: number; note: number }[]>();

	for (let index = 0; index < events.length; index++) {
		const event = events[index];
		if (event.type !== 'noteOn' || event.channel === DRUM_CHANNEL) continue;
		const line = byChannel.get(event.channel);
		if (line) line.push({ index, note: event.note });
		else byChannel.set(event.channel, [{ index, note: event.note }]);
	}

	for (const line of byChannel.values()) {
		for (let i = 1; i < line.length - 1; i++) {
			if (line[i].note > line[i - 1].note && line[i].note > line[i + 1].note) peaks[line[i].index] = 1;
		}
	}
	return peaks;
}

/** kick and bass carry the pulse, so Tier 2 refuses to smear them as far as the rest */
function anchorsTiming(event: MidiNoteEvent): boolean {
	if (event.channel === DRUM_CHANNEL) return KICK_NOTES.includes(event.note);
	return event.note < BASS_CEILING_NOTE;
}

const noteKey = (event: MidiNoteEvent): string => `${event.channel}:${event.note}`;

/**
 * The pass both tiers run: pick a slot, build a timing delta from the template plus the
 * noise, clamp it so no note lands before tick 0, shake the velocity inside 1-127, and
 * carry the note's own delta onto its note-off so every duration survives intact.
 * Returns a fresh file sorted back into tick order; `midi` is only ever read.
 */
export function applyHumanization(midi: MidiFile, options: HumanizationOptions, tier: 'lite' | 'groove'): MidiFile {
	const resolved = resolveOptions(options);
	const rng = new Generator(options.seed);
	const gaussian = createGaussian(rng);
	const drift = createDriftNoise(rng);
	const ticksPerQuarter = midi.ticksPerQuarter;
	const tempos = tempoSegments(midi.events);

	const slots = resolved.template ? slotTable(resolved.template) : null;
	const gridTicks = resolved.template ? subdivisionTicks(ticksPerQuarter, resolved.template.subdivision) : 0;
	const slotCount = resolved.template
		? subdivisionCount(resolved.template.timeSignature, resolved.template.subdivision)
		: 0;
	const peaks = tier === 'groove' ? markMelodyPeaks(midi.events) : null;

	const events: MidiEvent[] = [];
	/** a note's delta, queued for the note-off that closes it; FIFO so overlaps stay paired */
	const openNotes = new Map<string, number[]>();
	let warnedTempo = false;

	for (let index = 0; index < midi.events.length; index++) {
		const event = midi.events[index];

		if (event.type === 'noteOff') {
			const queue = openNotes.get(noteKey(event));
			const delta = queue && queue.length > 0 ? (queue.shift() as number) : 0;
			events.push(delta === 0 ? { ...event } : { ...event, tick: event.tick + delta });
			continue;
		}
		if (event.type !== 'noteOn') {
			events.push({ ...event });
			continue;
		}

		const bpm = bpmAt(tempos, event.tick);
		if (resolved.template && !warnedTempo && Math.abs(bpm - resolved.template.tempoBpm) > TEMPO_TOLERANCE_BPM) {
			warnedTempo = true;
			resolved.warn(
				`groove template "${resolved.template.name}" is written at ${resolved.template.tempoBpm} BPM but this file is at ${bpm.toFixed(
					1,
				)} BPM by tick ${event.tick}: its offsets are rescaled to keep the same timing in milliseconds`,
			);
		}

		const sigma = msToTicks(resolved.timingMs * resolved.timingScale, ticksPerQuarter, bpm);
		let noise = gaussian() * sigma + drift((event.tick / ticksPerQuarter) * DRIFT_SCALE) * sigma * DRIFT_RATIO;
		if (tier === 'groove' && anchorsTiming(event)) {
			const limit = msToTicks(ANCHOR_TIMING_MS, ticksPerQuarter, bpm);
			noise = Math.min(limit, Math.max(-limit, noise));
		}

		let slot: Slot | undefined;
		if (slots) slot = slots.get(Math.floor(event.tick / gridTicks) % slotCount);

		let delta = Math.round(resolved.intensity * ((slot ? msToTicks(slot.ms, ticksPerQuarter, bpm) : 0) + noise));
		if (event.tick + delta < 0) delta = -event.tick;

		let velocity = Math.round(
			event.velocity * (1 + resolved.intensity * ((slot ? slot.factor : 1) - 1)) +
				resolved.intensity * gaussian() * resolved.velocityVariance * resolved.velocityScale,
		);
		if (peaks && peaks[index] === 1) velocity = Math.round(velocity * (1 + resolved.intensity * PEAK_BOOST));
		velocity = Math.min(127, Math.max(1, velocity));

		const key = noteKey(event);
		const queue = openNotes.get(key);
		if (queue) queue.push(delta);
		else openNotes.set(key, [delta]);

		events.push({ ...event, tick: event.tick + delta, velocity });
	}

	events.sort((a, b) => a.tick - b.tick);
	return { ticksPerQuarter, events, loopStartTick: midi.loopStartTick };
}
