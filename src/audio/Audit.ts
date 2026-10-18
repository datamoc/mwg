import { fft } from './Fft.ts';
import { parseMidi } from './Midi.ts';
import { renderMidiToBuffer, type RenderedMidi } from './MidiRender.ts';
import { onMidiSynthFallback, type MidiSynthFallback } from './MidiSynth.ts';

export type AuditKind = 'fallback' | 'silent' | 'clipping' | 'pitch' | 'dc-offset' | 'failed';

export interface AuditFinding {
	engine: string;
	kind: AuditKind;
	/** the General MIDI program that was played, absent for a finding about the whole engine */
	program?: number;
	note?: number;
	detail: string;
}

export interface AuditOptions {
	/** the engines to try, by registered name (or `gm-soundfont` / `builtin` for the internal path) */
	engines: readonly string[];
	/** programs (0 to 127) played on channel 0; a spread across the families when omitted */
	programs?: readonly number[];
	/** MIDI notes played for each program; 48, 69 and 84 when omitted */
	notes?: readonly number[];
	sampleRate?: number;
	/** programs whose sound has no pitch to check (sound effects, percussion); 112 to 127 when omitted */
	unpitchedPrograms?: readonly number[];
	/** a note whose peak stays under this is silent; 0.002 when omitted */
	silentBelow?: number;
	/** the share of samples at full scale that counts as clipping; 0.001 when omitted */
	clipFraction?: number;
	/** how far the strongest partial may sit from a harmonic of the note, in cents; 50 when omitted */
	toleranceCents?: number;
}

export interface AuditReport {
	/** how many notes were rendered */
	rendered: number;
	findings: AuditFinding[];
}

const DEFAULT_PROGRAMS = [0, 4, 19, 24, 33, 40, 48, 56, 65, 73, 80, 88];
const DEFAULT_NOTES = [48, 69, 84];
const FFT_SIZE = 16384;

/** a format 0 Standard MIDI File of one track at 96 ticks per quarter, 120 bpm unless the track says otherwise */
function midiFile(track: readonly number[]): Uint8Array {
	return new Uint8Array([
		...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
		...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
		...track,
	]);
}

/** a file that plays one note of one program on channel 0 for half a second */
function calibrationMidi(program: number, note: number): Uint8Array {
	return midiFile([0, 0xc0, program, 0, 0x90, note, 100, 96, 0x80, note, 0, 0, 0xff, 0x2f, 0]);
}

/**
 * The strongest partial of the middle of a note, in hertz, found by an FFT over a Hann window and
 * refined by parabolic interpolation between the bins around the peak. Null when the segment is
 * too short or silent.
 */
function strongestPartial(left: Float32Array, sampleRate: number): number | null {
	const from = Math.floor(0.1 * sampleRate);
	const length = Math.min(FFT_SIZE, left.length - from);
	if (length < 2048) return null;
	const real = new Float64Array(FFT_SIZE);
	const imaginary = new Float64Array(FFT_SIZE);
	for (let i = 0; i < length; i++)
		real[i] = left[from + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1)));
	fft(real, imaginary);
	let best = 1;
	let bestPower = 0;
	for (let bin = 1; bin < FFT_SIZE / 2 - 1; bin++) {
		const power = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
		if (power > bestPower) {
			bestPower = power;
			best = bin;
		}
	}
	if (bestPower <= 0) return null;
	const magnitude = (bin: number): number => Math.log(Math.hypot(real[bin], imaginary[bin]) + 1e-12);
	const a = magnitude(best - 1);
	const b = magnitude(best);
	const c = magnitude(best + 1);
	const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
	return ((best + Math.max(-0.5, Math.min(0.5, shift))) * sampleRate) / FFT_SIZE;
}

/** the distance in cents from `partial` to the nearest of the first eight harmonics or subharmonics of `fundamental` */
function centsFromHarmonics(partial: number, fundamental: number): number {
	let best = Infinity;
	for (let n = 1; n <= 8; n++) {
		best = Math.min(best, Math.abs(1200 * Math.log2(partial / (n * fundamental))));
		best = Math.min(best, Math.abs(1200 * Math.log2(partial / (fundamental / n))));
	}
	return best;
}

function measure(rendered: RenderedMidi): { peak: number; clipped: number; dc: number } {
	let peak = 0;
	let clipped = 0;
	let sum = 0;
	const count = rendered.left.length;
	for (let i = 0; i < count; i++) {
		const value = Math.max(Math.abs(rendered.left[i]), Math.abs(rendered.right[i]));
		peak = Math.max(peak, value);
		if (value >= 0.9999) clipped++;
		sum += rendered.left[i];
	}
	return { peak, clipped: count ? clipped / count : 0, dc: count ? Math.abs(sum / count) : 0 };
}

/** a MIDI variable-length quantity: seven bits a byte, the high bit set on all but the last */
function variableLength(value: number): number[] {
	const bytes = [value & 0x7f];
	for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
	return bytes;
}

export interface EngineBenchmark {
	engine: string;
	voices: number;
	/** seconds of audio rendered */
	audioSeconds: number;
	/** wall-clock seconds the render took */
	renderSeconds: number;
	/** render time over audio time: 1 is exactly real time, under 0.5 leaves a frame its room on one thread */
	ratio: number;
}

/**
 * Times an engine on `voices` notes held at once for `seconds` of audio (a chord spread across the
 * keyboard, one channel each), and reports how much of real time the synthesis uses. This is the
 * measurement behind "does it fit the main thread, or does it need the audio core host": run it on
 * the target machine with the engine registered, since the number belongs to that pair. A ratio
 * near or over 1 means a dropout on the main thread; `playMidiHosted` is the way out.
 *
 * @example
 * ```ts
 * import { benchEngine } from '@datamoc/mwg/audio';
 *
 * const result = benchEngine({ engine: 'builtin', voices: 16, seconds: 5 });
 * console.log(result.ratio < 1 ? 'keeps up' : 'does not keep up');
 * ```
 */
export function benchEngine(options: {
	engine: string;
	voices?: number;
	seconds?: number;
	sampleRate?: number;
}): EngineBenchmark {
	const voices = Math.max(1, Math.min(16, Math.round(options.voices ?? 16)));
	const seconds = Math.max(1, options.seconds ?? 10);
	//one held note per voice, at 120 bpm: each tick of 96 per quarter is 1/192 of a second
	const ticks = Math.round(seconds * 192);
	const track: number[] = [];
	for (let voice = 0; voice < voices; voice++) {
		const channel = voice % 9; //channel 9 is the drum kit, which is not a held voice
		track.push(0, 0x90 | channel, 36 + voice * 3, 100);
	}
	for (let voice = 0; voice < voices; voice++) {
		track.push(...(voice === 0 ? variableLength(ticks) : [0]), 0x80 | (voice % 9), 36 + voice * 3, 0);
	}
	track.push(0, 0xff, 0x2f, 0);
	const midi = midiFile(track);
	const began = performance.now();
	//the render drops every message past its duration cap (480 s by default), which would lose the note-offs of a long run
	const rendered = renderMidiToBuffer(parseMidi(midi), {
		synth: options.engine,
		sampleRate: options.sampleRate,
		maxDuration: seconds + 10,
	});
	const renderSeconds = (performance.now() - began) / 1000;
	return {
		engine: options.engine,
		voices,
		audioSeconds: rendered.duration,
		renderSeconds,
		ratio: renderSeconds / rendered.duration,
	};
}

/**
 * Renders a calibration note per program through each engine and reports what a listener would
 * call broken before anyone listens: an engine that was not used (the fallback told through
 * `onMidiSynthFallback`), a note that comes out silent, samples pinned at full scale, a constant
 * offset, and a strongest partial that is no harmonic of the note (a wrong pitch). The numbers are
 * screening, not a verdict: a flagged note is one to listen to, an unflagged one is not proof.
 *
 * @example
 * ```ts
 * import { auditEngines } from '@datamoc/mwg/audio';
 *
 * const report = auditEngines({ engines: ['builtin'], programs: [0], notes: [69] });
 * console.log(report.rendered, report.findings.length);
 * ```
 */
export function auditEngines(options: AuditOptions): AuditReport {
	const report: AuditReport = { rendered: 0, findings: [] };
	for (const engine of options.engines) auditEngine(engine, options, report);
	return report;
}

function auditEngine(engine: string, options: AuditOptions, report: AuditReport): void {
	const programs = options.programs ?? DEFAULT_PROGRAMS;
	const notes = options.notes ?? DEFAULT_NOTES;
	const unpitched = new Set(options.unpitchedPrograms ?? Array.from({ length: 16 }, (_, i) => 112 + i));
	const silentBelow = options.silentBelow ?? 0.002;
	const clipFraction = options.clipFraction ?? 0.001;
	const tolerance = options.toleranceCents ?? 50;
	const seen: { fellBack: { kind: AuditKind; detail: string } | null } = { fellBack: null };
	//a synth that fails mid-render is announced as 'custom', since the render no longer knows the name it was asked for
	const listener = ({ requested, used, reason, message }: MidiSynthFallback): void => {
		if (requested !== engine && requested !== 'custom') return;
		seen.fellBack =
			reason === 'failed'
				? { kind: 'failed', detail: message ?? 'the engine failed' }
				: { kind: 'fallback', detail: `${used} voiced the file instead${message ? ` (${message})` : ''}` };
	};
	onMidiSynthFallback.add(listener);
	try {
		for (const program of programs) {
			for (const note of notes) {
				let result: RenderedMidi;
				try {
					result = renderMidiToBuffer(parseMidi(calibrationMidi(program, note)), {
						synth: engine,
						sampleRate: options.sampleRate,
					});
				} catch (error) {
					report.findings.push({
						engine,
						kind: 'failed',
						program,
						note,
						detail: error instanceof Error ? error.message : String(error),
					});
					continue;
				}
				report.rendered++;
				if (seen.fellBack) {
					//every further note would say the same, so the engine gets one finding and no more notes
					report.findings.push({ engine, ...seen.fellBack });
					return;
				}
				const { peak, clipped, dc } = measure(result);
				if (peak < silentBelow) {
					report.findings.push({ engine, kind: 'silent', program, note, detail: `peak ${peak.toFixed(5)}` });
					continue;
				}
				if (clipped > clipFraction) {
					report.findings.push({
						engine,
						kind: 'clipping',
						program,
						note,
						detail: `${(clipped * 100).toFixed(2)}% of samples at full scale`,
					});
				}
				if (dc > 0.05)
					report.findings.push({ engine, kind: 'dc-offset', program, note, detail: `mean ${dc.toFixed(3)}` });
				if (unpitched.has(program)) continue;
				const frequency = 440 * 2 ** ((note - 69) / 12);
				const partial = strongestPartial(result.left, result.sampleRate);
				if (partial === null) continue;
				const cents = centsFromHarmonics(partial, frequency);
				if (cents > tolerance) {
					report.findings.push({
						engine,
						kind: 'pitch',
						program,
						note,
						detail: `strongest partial ${partial.toFixed(1)} Hz is ${cents.toFixed(0)} cents from any harmonic of ${frequency.toFixed(1)} Hz`,
					});
				}
			}
		}
	} finally {
		onMidiSynthFallback.remove(listener);
	}
}
