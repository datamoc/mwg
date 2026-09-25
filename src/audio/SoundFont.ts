/**
 * A SoundFont 2 reader: presets to instruments to sample zones, enough to play
 * General MIDI music with real samples. Supported: key and velocity ranges, root key
 * and tuning, sample loop modes, the volume envelope (attack, hold, decay, sustain,
 * release), pan and attenuation, with the global-zone and preset-plus-instrument
 * layering rules. Not supported: modulators, filters and LFOs, 24-bit samples, or
 * stereo-linked sample pairs beyond playing each side as its own mono voice.
 *
 * A SoundFont file is only data (recorded samples plus preset tables), so reading one
 * is ordinary format engineering; the licence that matters is the font's own, checked
 * before it ships, never here.
 */

const GENERATORS = {
	keyRange: 43,
	velRange: 44,
	instrument: 41,
	sampleId: 53,
	rootKey: 58,
	coarseTune: 51,
	fineTune: 52,
	sampleModes: 54,
	attenuation: 48,
	pan: 17,
	attack: 34,
	hold: 35,
	decay: 36,
	sustain: 37,
	release: 38,
} as const;

/** one mono sample: raw frames plus its loop region in frames and native rate */
export interface SoundFontSample {
	data: Float32Array;
	rate: number;
	loopStart: number;
	loopEnd: number;
}

/** the parsed sample with its native tuning, before layering resolves the voice */
interface RawSample extends SoundFontSample {
	rootKey: number;
	correction: number;
}

/** how one layered voice plays its sample for a note */
export interface SoundFontVoice {
	sample: SoundFontSample;
	rootKey: number;
	/** tuning offset in cents, applied on top of the root key */
	cents: number;
	loop: boolean;
	/** linear level multiplier from attenuation layering */
	gain: number;
	/** stereo position, -1 (left) to 1 (right) */
	pan: number;
	/** envelope stages in seconds, except sustain which is a level multiplier */
	attack: number;
	hold: number;
	decay: number;
	sustain: number;
	release: number;
}

/**
 * The samples behind a SoundFont file: one call per note returns the layered voices
 * for its bank, program, key and velocity. A game ships its own file (parsed here)
 * and hands the result wherever samples are needed; nothing here fetches or picks one.
 */
export interface SoundFont {
	voices(bank: number, program: number, key: number, velocity: number): SoundFontVoice[];
	hasPreset(bank: number, program: number): boolean;
	readonly presetCount: number;
}

interface Generator {
	oper: number;
	lo: number;
	hi: number;
	amount: number;
}

interface Zone {
	gens: Map<number, Generator>;
	global: Map<number, Generator> | null;
}

/** seconds for a SoundFont timecents value */
function timecents(value: number): number {
	return 2 ** (value / 1200);
}

/**
 * Reads SoundFont 2 bytes into layered preset voices.
 *
 * @example
 * ```ts
 * import { parseSoundFont, parseMidi, renderMidiToBuffer } from '@datamoc/mw_games/audio';
 *
 * declare const soundfontBytes: ArrayBuffer;
 * declare const midiBytes: ArrayBuffer;
 *
 * const font = parseSoundFont(soundfontBytes);
 * const rendered = renderMidiToBuffer(parseMidi(midiBytes), { soundfont: font });
 * console.log(font.presetCount, rendered.duration);
 * ```
 */
export function parseSoundFont(data: ArrayBuffer | ArrayBufferView): SoundFont {
	const bytes =
		data instanceof ArrayBuffer
			? new Uint8Array(data)
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const fourcc = (at: number): string => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
	if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');

	const chunks = new Map<string, { at: number; size: number }>();
	const walk = (start: number, end: number): void => {
		let at = start;
		while (at + 8 <= end) {
			const id = fourcc(at);
			const size = view.getUint32(at + 4, true);
			if (id === 'LIST') walk(at + 12, at + 8 + size);
			else chunks.set(id, { at: at + 8, size });
			at += 8 + size + (size & 1);
		}
	};
	walk(12, bytes.length);
	for (const required of ['phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr', 'smpl']) {
		if (!chunks.has(required)) throw new Error(`SoundFont is missing "${required}"`);
	}

	const records = <T>(name: string, size: number, read: (at: number) => T): T[] => {
		const chunk = chunks.get(name)!;
		const out: T[] = [];
		for (let at = chunk.at; at + size <= chunk.at + chunk.size; at += size) out.push(read(at));
		return out;
	};
	const generators = (name: string): Generator[] =>
		records(name, 4, (at) => ({
			oper: view.getUint16(at, true),
			lo: bytes[at + 2],
			hi: bytes[at + 3],
			amount: view.getInt16(at + 2, true),
		}));
	const bags = (name: string): number[] => records(name, 4, (at) => view.getUint16(at, true));
	const presetHeaders = records('phdr', 38, (at) => ({
		preset: view.getUint16(at + 20, true),
		bank: view.getUint16(at + 22, true),
		bag: view.getUint16(at + 24, true),
	}));
	const instrumentHeaders = records('inst', 22, (at) => ({ bag: view.getUint16(at + 20, true) }));
	const sampleHeaders = records('shdr', 46, (at) => ({
		start: view.getUint32(at + 20, true),
		end: view.getUint32(at + 24, true),
		loopStart: view.getUint32(at + 28, true),
		loopEnd: view.getUint32(at + 32, true),
		rate: view.getUint32(at + 36, true),
		rootKey: bytes[at + 40],
		correction: view.getInt8(at + 41),
		type: view.getUint16(at + 44, true),
	}));
	const presetBags = bags('pbag');
	const instrumentBags = bags('ibag');
	const presetGens = generators('pgen');
	const instrumentGens = generators('igen');

	//Zones of one header entry; a first zone lacking the terminal generator is global.
	const zonesOf = (
		headers: readonly { bag: number }[],
		bagList: readonly number[],
		gens: readonly Generator[],
		index: number,
		terminal: number,
	): Zone[] => {
		const first = headers[index].bag;
		const last = headers[index + 1]?.bag ?? bagList.length - 1;
		const zones: Zone[] = [];
		let global: Map<number, Generator> | null = null;
		for (let bag = first; bag < last; bag++) {
			const map = new Map<number, Generator>();
			for (let g = bagList[bag]; g < (bagList[bag + 1] ?? gens.length); g++) {
				map.set(gens[g].oper, gens[g]);
			}
			if (!map.has(terminal)) {
				if (bag === first) global = map;
				continue;
			}
			zones.push({ gens: map, global });
		}
		return zones;
	};
	const generatorOf = (zone: Zone, oper: number): Generator | null =>
		zone.gens.get(oper) ?? zone.global?.get(oper) ?? null;

	const smplChunk = chunks.get('smpl')!;
	const smpl = new Int16Array(
		bytes.buffer.slice(
			bytes.byteOffset + smplChunk.at,
			bytes.byteOffset + smplChunk.at + smplChunk.size - (smplChunk.size & 1),
		),
	);
	const sampleCache = new Map<number, RawSample | null>();
	const sampleOf = (id: number): RawSample | null => {
		if (sampleCache.has(id)) return sampleCache.get(id)!;
		const header = sampleHeaders[id];
		//ROM samples live outside the file and cannot play
		if (!header || header.end <= header.start || header.type & 0x8000) {
			sampleCache.set(id, null);
			return null;
		}
		const data = new Float32Array(header.end - header.start);
		for (let index = 0; index < data.length; index++) {
			data[index] = smpl[header.start + index] / 32768;
		}
		const sample: RawSample = {
			data,
			rate: header.rate || 22050,
			loopStart: header.loopStart - header.start,
			loopEnd: header.loopEnd - header.start,
			rootKey: header.rootKey === 255 ? 60 : header.rootKey,
			correction: header.correction,
		};
		sampleCache.set(id, sample);
		return sample;
	};

	const presets = new Map<string, number>();
	for (let index = 0; index < presetHeaders.length - 1; index++) {
		presets.set(`${presetHeaders[index].bank}:${presetHeaders[index].preset}`, index);
	}

	//Zones that sound for (bank, program, key, velocity), each with its playback recipe.
	function voices(bank: number, program: number, key: number, velocity: number): SoundFontVoice[] {
		const presetIndex =
			presets.get(`${bank}:${program}`) ??
			presets.get(`0:${program}`) ??
			(bank === 128 ? presets.get('128:0') : undefined) ??
			presets.get('0:0');
		if (presetIndex === undefined) return [];
		const out: SoundFontVoice[] = [];
		const within = (zone: Zone, oper: number, value: number): boolean => {
			const generator = generatorOf(zone, oper);
			return !generator || (value >= generator.lo && value <= generator.hi);
		};
		for (const presetZone of zonesOf(presetHeaders, presetBags, presetGens, presetIndex, GENERATORS.instrument)) {
			if (!within(presetZone, GENERATORS.keyRange, key) || !within(presetZone, GENERATORS.velRange, velocity)) {
				continue;
			}
			const instrument = generatorOf(presetZone, GENERATORS.instrument)!.amount;
			if (!instrumentHeaders[instrument + 1]) continue;
			for (const zone of zonesOf(
				instrumentHeaders,
				instrumentBags,
				instrumentGens,
				instrument,
				GENERATORS.sampleId,
			)) {
				if (!within(zone, GENERATORS.keyRange, key) || !within(zone, GENERATORS.velRange, velocity)) {
					continue;
				}
				const sample = sampleOf(generatorOf(zone, GENERATORS.sampleId)!.amount);
				if (!sample) continue;
				const both = (oper: number, fallback = 0): number =>
					(generatorOf(zone, oper)?.amount ?? fallback) + (generatorOf(presetZone, oper)?.amount ?? 0);
				const root = generatorOf(zone, GENERATORS.rootKey)?.amount;
				const modes = generatorOf(zone, GENERATORS.sampleModes)?.amount ?? 0;
				out.push({
					sample: {
						data: sample.data,
						rate: sample.rate,
						loopStart: sample.loopStart,
						loopEnd: sample.loopEnd,
					},
					rootKey: root !== undefined && root >= 0 ? root : sample.rootKey,
					cents: both(GENERATORS.coarseTune) * 100 + both(GENERATORS.fineTune) + sample.correction,
					loop: (modes & 3) === 1 || (modes & 3) === 3,
					gain: 10 ** (-Math.max(0, both(GENERATORS.attenuation)) / 200),
					pan: Math.max(-1, Math.min(1, both(GENERATORS.pan) / 500)),
					attack: timecents(both(GENERATORS.attack, -12000)),
					hold: timecents(both(GENERATORS.hold, -12000)),
					decay: timecents(both(GENERATORS.decay, -12000)),
					sustain: 10 ** (-Math.max(0, both(GENERATORS.sustain)) / 200),
					release: timecents(both(GENERATORS.release, -12000)),
				});
			}
		}
		return out;
	}

	return {
		voices,
		hasPreset: (bank: number, program: number): boolean =>
			presets.has(`${bank}:${program}`) || presets.has(`0:${program}`),
		presetCount: presets.size,
	};
}
