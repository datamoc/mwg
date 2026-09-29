import type { MidiFile } from '../Midi.ts';
import { applyHumanization, type HumanizationOptions, type MidiHumanizerEngine } from './Humanize.ts';

/**
 * Tier 2: the lite pass plus the groove grid and two musical rules the lite tier has no
 * opinion about. The template supplies the per-slot deviations, rescaled from the tempo it
 * was measured at to the tempo of the file being played, so a groove stays the same shape
 * in time rather than the same number of ticks.
 *
 * The two rules are what keep a groove musical instead of merely uneven: kick and bass
 * carry the pulse and stay inside 5 ms however loose the run, while a melody's local peaks
 * are lifted a little so the line still speaks. Without a template the slot term is empty
 * and the run is those rules over the same noise the lite tier uses - this tier is a
 * superset of it, never a different pass.
 *
 * @example
 * ```ts
 * import { parseMidi, GrooveHumanizer, type GrooveTemplate } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 * declare const template: GrooveTemplate;
 *
 * const file = parseMidi(midiBytes);
 * const engine = new GrooveHumanizer();
 * await engine.initialize(); // idempotent; the factory already does this for you
 * const swung = await engine.process(file, { intensity: 0.8, grooveTemplate: template, seed: 7 });
 * ```
 */
export class GrooveHumanizer implements MidiHumanizerEngine {
	readonly tierName = 'groove';
	readonly approximateSizeMb = 0.5;

	async initialize(): Promise<void> {}

	async process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile> {
		return applyHumanization(midi, options, 'groove');
	}
}
