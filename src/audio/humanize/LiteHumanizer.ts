import type { MidiFile } from '../Midi.ts';
import { applyHumanization, type HumanizationOptions, type MidiHumanizerEngine } from './Humanize.ts';

/**
 * Tier 1: every note gets a seeded gaussian nudge plus a slow correlated drift, and
 * nothing else. No grid, no model, no I/O - which is exactly why it is the tier a shipped
 * game can afford to call, and why it has to refuse a groove template rather than quietly
 * ignore one: a template passed here is a caller who picked the wrong tier.
 *
 * @example
 * ```ts
 * import { parseMidi, LiteHumanizer } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const file = parseMidi(midiBytes);
 * const humanized = await new LiteHumanizer().process(file, {
 *   intensity: 0.6,
 *   timingVarianceMs: 6,
 *   seed: 42, // the same seed gives back the same performance every time
 * });
 * ```
 */
export class LiteHumanizer implements MidiHumanizerEngine {
	readonly tierName = 'lite';
	readonly approximateSizeMb = 0.05;

	/** nothing heavy to load: the tier is the pass, already in the bundle */
	async initialize(): Promise<void> {}

	async process(midi: MidiFile, options: HumanizationOptions): Promise<MidiFile> {
		if (options.grooveTemplate)
			throw new Error(
				'the lite tier applies no groove grid: ask HumanizerFactory for "groove" when a template is in play',
			);
		return applyHumanization(midi, options, 'lite');
	}
}
