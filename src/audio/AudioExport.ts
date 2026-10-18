import { spawn } from '../threads/spawn.ts';
import { encodeWav } from './Wav.ts';
import type { StereoFrames } from './Resample.ts';

export type ExportFormat = 'wav' | 'flac' | 'opus';

/**
 * The file extension and MIME type of each export format.
 *
 * @example
 * ```ts
 * import { AUDIO_FORMATS } from '@datamoc/mwg/audio';
 *
 * console.log(AUDIO_FORMATS.flac.extension, AUDIO_FORMATS.flac.mime); // 'flac' 'audio/flac'
 * ```
 */
export const AUDIO_FORMATS: Readonly<Record<ExportFormat, { extension: string; mime: string }>> = {
	wav: { extension: 'wav', mime: 'audio/wav' },
	flac: { extension: 'flac', mime: 'audio/flac' },
	opus: { extension: 'opus', mime: 'audio/ogg; codecs=opus' },
};

export interface ExportRequest {
	format: ExportFormat;
	/** Opus bit rate in kbit/s; 128 when omitted */
	bitrate?: number;
	/** FLAC depth; 16 when omitted */
	bitsPerSample?: 16 | 24;
	/** Vorbis-comment style tags (`title`, `album`, `license`, ...), merged over the service's defaults */
	tags?: Readonly<Record<string, string>>;
	signal?: AbortSignal;
	/** 0 to 1, for a progress bar */
	onProgress?: (fraction: number) => void;
}

/** what an encoder receives: the request with the default tags already merged in */
export type ExportEncoderRequest = ExportRequest & { tags: Readonly<Record<string, string>> };

/** turns frames into the bytes of one format; the retro-audio package's `exportAudio` fits */
export type ExportEncoder = (frames: StereoFrames, request: ExportEncoderRequest) => Uint8Array | Promise<Uint8Array>;

export interface AudioExportOptions {
	/**
	 * the encoders for the formats mwg does not write itself (`flac`, `opus`); WAV is built in. A
	 * format without an encoder is not offered by `formats()` and is refused by `export`.
	 */
	encoders?: Partial<Record<Exclude<ExportFormat, 'wav'>, ExportEncoder>>;
	/**
	 * run the FLAC and Opus encoders on a worker thread (`threads.spawn`) so a long export leaves
	 * the frame alone. Only for encoders that are **self-contained** (no closures, no imports: they
	 * are shipped to the worker as text); `onProgress` is not called from a worker. Where no worker
	 * exists the encoder runs on this thread instead. False when omitted.
	 */
	inWorker?: boolean;
	/** whether Opus encoding works here (a WebCodecs `AudioEncoder` exists); true when omitted */
	opusAvailable?: () => boolean;
	/** refuses an export whose estimated size is larger; 256 MiB when omitted */
	maxBytes?: number;
	/** tags every export carries unless the request overrides them */
	defaultTags?: Readonly<Record<string, string>>;
	/** puts a finished file where the player can reach it; `downloadSaver` when omitted */
	saver?: (blob: Blob, filename: string) => void | Promise<void>;
}

/**
 * An export whose estimated size is over the configured limit.
 *
 * @example
 * ```ts
 * import { AudioExport, ExportTooLargeError } from '@datamoc/mwg/audio';
 *
 * declare const frames: { sampleRate: number; left: Float32Array; right: Float32Array };
 *
 * try {
 * 	await new AudioExport({ maxBytes: 1_000_000 }).export(frames, { format: 'wav' });
 * } catch (error) {
 * 	if (error instanceof ExportTooLargeError) console.log(error.estimatedBytes, error.maxBytes);
 * }
 * ```
 */
export class ExportTooLargeError extends Error {
	readonly estimatedBytes: number;
	readonly maxBytes: number;

	constructor(estimatedBytes: number, maxBytes: number) {
		super(`the export would be about ${estimatedBytes} bytes, over the limit of ${maxBytes}`);
		this.name = 'ExportTooLargeError';
		this.estimatedBytes = estimatedBytes;
		this.maxBytes = maxBytes;
	}
}

const DEFAULT_OPUS_KBPS = 128;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

/** the usual tags of a game's track: the game as album, the track as title, the licence of its source */
export function exportTags(info: { game?: string; track?: string; license?: string }): Record<string, string> {
	const tags: Record<string, string> = {};
	if (info.game) tags.album = info.game;
	if (info.track) tags.title = info.track;
	if (info.license) tags.license = info.license;
	return tags;
}

/**
 * A rough size in bytes for an export, before spending the time on it: WAV is exact (about 10 MB a
 * minute in stereo at 44.1 kHz), Opus follows its bit rate, FLAC takes about 60 percent of the
 * 16-bit PCM it holds (a rule of thumb for synthesised music, not a promise).
 *
 * @example
 * ```ts
 * import { estimateExportBytes } from '@datamoc/mwg/audio';
 *
 * console.log(Math.round(estimateExportBytes({ format: 'wav' }, 60, 44100) / 1e6)); // 11
 * ```
 */
export function estimateExportBytes(
	request: Pick<ExportRequest, 'format' | 'bitrate' | 'bitsPerSample'>,
	seconds: number,
	sampleRate: number,
): number {
	const pcm = seconds * sampleRate * 2 * 2;
	if (request.format === 'wav') return Math.ceil(pcm) + 44;
	if (request.format === 'opus') return Math.ceil(((request.bitrate ?? DEFAULT_OPUS_KBPS) * 1000 * seconds) / 8);
	return Math.ceil(pcm * 0.6 * ((request.bitsPerSample ?? 16) / 16));
}

/**
 * Saves through a temporary link with the `download` attribute, the way every browser accepts.
 *
 * @example
 * ```ts
 * import { downloadSaver } from '@datamoc/mwg/audio';
 *
 * downloadSaver(new Blob([new Uint8Array(4)], { type: 'audio/wav' }), 'tune.wav');
 * ```
 */
export function downloadSaver(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The export service: renders already-synthesised frames to a WAV, FLAC or Opus file. It owns the
 * decisions around the encoding (which formats this device can offer, a size check before the time
 * is spent, default tags, cancellation, handing a file to the player); the bytes of FLAC and Opus
 * come from encoders the game injects, such as the retro-audio package's `exportAudio`, so mwg
 * carries no second copy of a codec. WAV is written here.
 *
 * @example
 * ```ts
 * import { AudioExport, exportTags } from '@datamoc/mwg/audio';
 *
 * declare const frames: { sampleRate: number; left: Float32Array; right: Float32Array };
 *
 * const service = new AudioExport({ defaultTags: exportTags({ game: 'Pontifex' }) });
 * const bytes = await service.export(frames, { format: 'wav', tags: exportTags({ track: 'Harbour' }) });
 * console.log(service.formats(), bytes.byteLength); // ['wav'] ...
 * ```
 */
export class AudioExport {
	private readonly options: AudioExportOptions;

	constructor(options: AudioExportOptions = {}) {
		this.options = options;
	}

	/** the formats this service can write on this device */
	formats(): ExportFormat[] {
		const formats: ExportFormat[] = ['wav'];
		if (this.options.encoders?.flac) formats.push('flac');
		if (this.options.encoders?.opus && (this.options.opusAvailable?.() ?? true)) formats.push('opus');
		return formats;
	}

	/** writes `frames` in the requested format; rejects when the format is unavailable, the size over the limit or the signal aborted */
	async export(frames: StereoFrames, request: ExportRequest): Promise<Uint8Array> {
		const { format, signal } = request;
		if (!this.formats().includes(format)) throw new Error(`the ${format} format is not available here`);
		if (frames.left.length === 0 || frames.left.length !== frames.right.length) {
			throw new Error('there is nothing to export: the channels are empty or of different lengths');
		}
		const estimate = estimateExportBytes(request, frames.left.length / frames.sampleRate, frames.sampleRate);
		const maxBytes = this.options.maxBytes ?? DEFAULT_MAX_BYTES;
		if (estimate > maxBytes) throw new ExportTooLargeError(estimate, maxBytes);
		throwIfAborted(signal);
		const tags = { ...this.options.defaultTags, ...request.tags };
		let bytes: Uint8Array;
		if (format === 'wav') {
			bytes = encodeWav(frames);
			request.onProgress?.(1);
		} else {
			const encoder = this.options.encoders![format]!;
			bytes = this.options.inWorker
				? await this.encodeInWorker(encoder, frames, { ...request, tags })
				: await encoder(frames, { ...request, tags });
		}
		throwIfAborted(signal);
		return bytes;
	}

	private async encodeInWorker(
		encoder: ExportEncoder,
		frames: StereoFrames,
		request: ExportEncoderRequest,
	): Promise<Uint8Array> {
		//a function cannot be cloned into a worker, and neither can a callback: the signal is spawn's own
		const { onProgress: _onProgress, signal, ...plain } = request;
		try {
			return await spawn(encoder, [frames, plain as ExportEncoderRequest], { signal });
		} catch (error) {
			if (!(error instanceof Error) || !error.message.startsWith('spawn() needs')) throw error;
			return encoder(frames, request);
		}
	}

	/** the same export as a `Blob` carrying the format's MIME type */
	async exportBlob(frames: StereoFrames, request: ExportRequest): Promise<Blob> {
		const bytes = await this.export(frames, request);
		return new Blob([bytes as BlobPart], { type: AUDIO_FORMATS[request.format].mime });
	}

	/** exports, then hands the file to the saver under `name` plus the format's extension; returns the file name used */
	async save(frames: StereoFrames, request: ExportRequest, name: string): Promise<string> {
		const blob = await this.exportBlob(frames, request);
		const filename = `${safeFileName(name)}.${AUDIO_FORMATS[request.format].extension}`;
		await (this.options.saver ?? downloadSaver)(blob, filename);
		return filename;
	}
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const error = new Error('the export was cancelled');
	error.name = 'AbortError';
	throw error;
}

/** a file name with no path separators or characters a file system refuses */
function safeFileName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
		.replace(/^\.+/, '')
		.trim();
	return cleaned.slice(0, 120) || 'audio';
}
