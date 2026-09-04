import type { Playable } from './Playable.ts';

/**
 * A small runtime waveform generator - the licence-avoiding synthesis
 * `tools/make-example-assets.mjs` already does offline for this project's own example
 * sounds, exposed here as something a running game can call itself to generate a tone or a
 * procedural SFX on the fly, rather than only ever play a pre-baked clip.
 */
export type Waveform = 'square' | 'triangle' | 'sine' | 'noise';

export interface ToneOptions {
	waveform?: Waveform;
	/** Hz; ignored for `'noise'` */
	frequency?: number;
	/** seconds */
	duration?: number;
	/** peak sample amplitude, 0 to 1 */
	volume?: number;
	/** exponential envelope rate over the tone's duration; 0 disables the fade-out */
	decay?: number;
	sampleRate?: number;
	/** seeds `'noise'`, so the same options reproduce the same waveform */
	seed?: number;
}

/**
 * Renders a short tone to a `data:audio/wav` URI, ready to hand to an `Audio` element (or
 * any other `Playable` source) without touching the network or `mwg/assets` - nothing here
 * is loaded, only computed.
 */
export function synthesizeTone(options: ToneOptions = {}): string {
	const waveform = options.waveform ?? 'square';
	const frequency = options.frequency ?? 440;
	const duration = options.duration ?? 0.15;
	const volume = options.volume ?? 0.3;
	const decay = options.decay ?? 8;
	const sampleRate = options.sampleRate ?? 22050;
	const seed = options.seed ?? 1;

	if (!(duration > 0)) throw new Error('tone duration must be positive');
	if (waveform !== 'noise' && !(frequency > 0)) throw new Error('tone frequency must be positive');
	if (!(sampleRate > 0)) throw new Error('tone sample rate must be positive');

	const count = Math.max(1, Math.round(duration * sampleRate));
	const samples = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const t = i / sampleRate;
		const envelope = decay > 0 ? Math.exp((-decay * i) / count) : 1;
		const phase = 2 * Math.PI * frequency * t;
		samples[i] = volume * envelope * waveSample(waveform, phase, seed, i);
	}
	return encodeWav(samples, sampleRate);
}

/**
 * Synthesizes a tone and plays it once, fire-and-forget - the runtime counterpart to
 * `Sound.play`, generating instead of loading. `create` is injectable the same way
 * `Sound`/`Music` already are, so a test never needs a real `Audio` element.
 */
export function playTone(options: ToneOptions = {}, create: (dataUri: string) => Playable = (uri) => new Audio(uri)): Playable {
	const playable = create(synthesizeTone(options));
	void playable.play();
	return playable;
}

function waveSample(waveform: Waveform, phase: number, seed: number, index: number): number {
	switch (waveform) {
		case 'sine':
			return Math.sin(phase);
		case 'square':
			return Math.sin(phase) >= 0 ? 1 : -1;
		case 'triangle': {
			const cycles = phase / (2 * Math.PI);
			const f = cycles - Math.floor(cycles);
			return 4 * Math.abs(f - 0.5) - 1;
		}
		case 'noise':
			return noiseSample(seed, index);
	}
}

/** a deterministic hash-based pseudo-random sample in [-1, 1], so a given seed always reproduces the same noise */
function noiseSample(seed: number, index: number): number {
	let h = Math.imul(seed ^ index, 2654435761) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
	h ^= h >>> 16;
	return (h >>> 0) / 4294967295 * 2 - 1;
}

function encodeWav(samples: Float32Array, sampleRate: number): string {
	const dataSize = samples.length * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // fmt chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (const sample of samples) {
		const clamped = Math.max(-1, Math.min(1, sample));
		view.setInt16(offset, Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff)), true);
		offset += 2;
	}

	let binary = '';
	const bytes = new Uint8Array(buffer);
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
