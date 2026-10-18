import { getBinary, loadBinary } from '../assets/binary.ts';
import { TrackCache, type BusBudgetPolicy } from './BusBudget.ts';
import type { BusLoadContext, BusLoader, LoadedTrack } from './Channels.ts';
import { renderMidiToBufferAsync, toAudioBuffer, type RenderMidiAsyncOptions } from './MidiRender.ts';
import { fitToBudget } from './Resample.ts';

export interface AudioLoaderOptions {
	/** MIDI rendering settings, including optional SoundFont bytes. */
	midi?: RenderMidiAsyncOptions;
	/** Reads embedded assets by default; inject a byte source for a custom archive or a test. */
	read?: (path: string) => Promise<ArrayBuffer>;
	/** keeps decoded tracks inside a memory budget, evicting the least recently used; every track stays cached when omitted */
	budget?: BusBudgetPolicy;
}

/**
 * One loader for `AudioBus` music, jingles and effects: MIDI is rendered on a worker,
 * other formats use the browser's audio decoder. MIDI detection uses the file header,
 * so an archive alias does not need a filename extension. Results are cached by path
 * (under `budget` when one is given, which also caps and shrinks rendered MIDI); a failed
 * load can be retried. A load reports 0, 0.5 and 1 through the bus's progress context, and
 * skips its render when the request was replaced before the bytes arrived. Returned buffers can also be used by a `MusicPlayer`.
 *
 * @example
 * ```ts
 * import { AudioBus, createAudioLoader } from '@datamoc/mwg/audio';
 * declare const context: AudioContext;
 * declare const soundFontBytes: ArrayBuffer;
 * const bus = new AudioBus(context, {
 *   load: createAudioLoader(context, { midi: { soundFontBytes, missingProgram: 'synth' } }),
 * });
 * await bus.playBgm({ name: 'music/theme.mid', volume: 80, pitch: 100, pan: 0 });
 * await bus.playSe({ name: 'sounds/hit.wav', volume: 80, pitch: 110, pan: 20 });
 * ```
 */
export function createAudioLoader(context: BaseAudioContext, options: AudioLoaderOptions = {}): BusLoader {
	const cache = new TrackCache(options.budget);
	const read = options.read ?? readAsset;
	async function decode(path: string, loadContext?: BusLoadContext): Promise<LoadedTrack | null> {
		loadContext?.progress(0);
		const bytes = await read(path);
		if (loadContext?.signal.aborted) return null;
		loadContext?.progress(0.5);
		const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
		let loaded: LoadedTrack;
		if (header[0] === 77 && header[1] === 84 && header[2] === 104 && header[3] === 100) {
			let rendered = await renderMidiToBufferAsync(bytes, options.midi);
			if (options.budget?.render) rendered = fitToBudget(rendered, options.budget.render);
			loaded = {
				buffer: toAudioBuffer(context, rendered),
				loop: { start: rendered.loopStart, end: rendered.loopEnd },
			};
		} else {
			// decodeAudioData can detach its input; the asset cache still owns the original bytes.
			loaded = { buffer: await context.decodeAudioData(bytes.slice(0)) };
		}
		loadContext?.progress(1);
		return loaded;
	}
	return (_kind, path, loadContext) => cache.load(path, () => decode(path, loadContext));
}

async function readAsset(path: string): Promise<ArrayBuffer> {
	await loadBinary([path]);
	return getBinary(path);
}
