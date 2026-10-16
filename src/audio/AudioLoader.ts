import { getBinary, loadBinary } from '../assets/binary.ts';
import type { BusLoader, LoadedTrack } from './Channels.ts';
import { renderMidiToBufferAsync, toAudioBuffer, type RenderMidiAsyncOptions } from './MidiRender.ts';

export interface AudioLoaderOptions {
	/** MIDI rendering settings, including optional SoundFont bytes. */
	midi?: RenderMidiAsyncOptions;
	/** Reads embedded assets by default; inject a byte source for a custom archive or a test. */
	read?: (path: string) => Promise<ArrayBuffer>;
}

/**
 * One loader for `AudioBus` music, jingles and effects: MIDI is rendered on a worker,
 * other formats use the browser's audio decoder. MIDI detection uses the file header,
 * so an archive alias does not need a filename extension. Results are cached by path;
 * a failed load can be retried. Returned buffers can also be used by a `MusicPlayer`.
 *
 * @example
 * ```ts
 * import { AudioBus, createAudioLoader } from '@datamoc/mw_games/audio';
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
	const pending = new Map<string, Promise<LoadedTrack>>();
	const read = options.read ?? readAsset;
	async function decode(path: string): Promise<LoadedTrack> {
		const bytes = await read(path);
		const header = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
		if (header[0] === 77 && header[1] === 84 && header[2] === 104 && header[3] === 100) {
			const rendered = await renderMidiToBufferAsync(bytes, options.midi);
			return {
				buffer: toAudioBuffer(context, rendered),
				loop: { start: rendered.loopStart, end: rendered.loopEnd },
			};
		}
		// decodeAudioData can detach its input; the asset cache still owns the original bytes.
		return { buffer: await context.decodeAudioData(bytes.slice(0)) };
	}
	return (_kind, path) => {
		let loaded = pending.get(path);
		if (!loaded) {
			loaded = decode(path).catch((error: unknown) => {
				pending.delete(path);
				throw error;
			});
			pending.set(path, loaded);
		}
		return loaded;
	};
}

async function readAsset(path: string): Promise<ArrayBuffer> {
	await loadBinary([path]);
	return getBinary(path);
}
