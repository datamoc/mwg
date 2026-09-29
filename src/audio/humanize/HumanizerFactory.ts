import type { MidiFile } from '../Midi.ts';
import { type HumanizationOptions, type HumanizerTier, type MidiHumanizerEngine } from './Humanize.ts';

/**
 * One entry point for "humanize this file", so a game never names the class that does the
 * work. The tier decides the engine; everything else about the request is the same for
 * both shipped tiers, which is why the request extends the options rather than wrapping
 * them.
 *
 * The engines load on demand through dynamic import. That is a size decision, not a
 * style one: `GrooveHumanizer`, the extractor and the converter are all reachable from a
 * game that only ever wanted the lite tier, and none of them should be in the bundle
 * merely for living in the same module. The magenta tier is the case where loading would
 * never succeed at all: it needs `@magenta/music` and a PerformanceRNN checkpoint, and a
 * `file://` build can fetch neither, so asking for it fails by name instead of hanging on
 * a request that cannot resolve.
 *
 * @example
 * ```ts
 * import { HumanizerFactory, humanizeMidi, parseMidi } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const file = parseMidi(midiBytes);
 *
 * //the convenience path: the tier follows from the request
 * const lite = await humanizeMidi(file, { intensity: 0.5, seed: 1 });
 *
 * //or hold the engine, when several files go through the same one
 * const engine = await HumanizerFactory.create('lite');
 * const again = await engine.process(lite, { intensity: 0.5, seed: 2 });
 *
 * console.log(engine.tierName, engine.approximateSizeMb); // 'lite' 0.05
 * ```
 */
export class HumanizerFactory {
	/** resolves the engine for a tier and initializes it, so `process` can be called at once */
	static async create(tier: HumanizerTier): Promise<MidiHumanizerEngine> {
		const engine = await HumanizerFactory.load(tier);
		await engine.initialize();
		return engine;
	}

	private static async load(tier: HumanizerTier): Promise<MidiHumanizerEngine> {
		switch (tier) {
			case 'lite': {
				const module = await import('./LiteHumanizer.ts');
				return new module.LiteHumanizer();
			}
			case 'groove': {
				const module = await import('./GrooveHumanizer.ts');
				return new module.GrooveHumanizer();
			}
			case 'magenta':
				throw new Error(
					"the 'magenta' tier is not shipped: it needs @magenta/music and a PerformanceRNN checkpoint, and neither can be fetched from a file:// build",
				);
			default:
				throw new Error(`unknown humanizer tier: ${String(tier)}`);
		}
	}
}

export interface HumanizeRequest extends HumanizationOptions {
	/**
	 * Which engine runs the request. Omitted, a request carrying a groove template picks
	 * `'groove'` and anything else picks `'lite'`, so the common case needs no tier at all.
	 */
	tier?: HumanizerTier;
}

/**
 * Humanizes in one call: resolves the tier, runs it, returns the new file.
 *
 * @example
 * ```ts
 * import { humanizeMidi, parseMidi, type GrooveTemplate } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 * declare const template: GrooveTemplate;
 *
 * const file = parseMidi(midiBytes);
 * const swung = await humanizeMidi(file, {
 *   tier: 'groove',
 *   intensity: 0.7,
 *   grooveTemplate: template,
 *   seed: 99,
 *   onWarn: (message) => console.log(message), // a template from another tempo says so
 * });
 * ```
 */
export async function humanizeMidi(midi: MidiFile, request: HumanizeRequest): Promise<MidiFile> {
	const { tier, ...options } = request;
	const chosen = tier ?? (options.grooveTemplate ? 'groove' : 'lite');
	const engine = await HumanizerFactory.create(chosen);
	return engine.process(midi, options);
}
