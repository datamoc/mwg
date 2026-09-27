import { scheduleMidi, type MidiFile } from './Midi.ts';

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
 *
 * `subsetSoundFont` answers the shipping side: a game that plays five instruments
 * should not carry all 128. It takes the programs the game's MIDI files actually use
 * (see `collectSoundFontUsage`) and writes a smaller, valid SoundFont 2 file with the
 * same voices for those programs: zones, ranges, tuning, envelopes and sample loops
 * survive byte-identical, while unused presets, instruments and samples are gone and
 * the library, genre and morphology metadata is zeroed.
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

/** one used program: the voice a game's MIDI files actually request */
export interface SoundFontProgram {
	bank: number;
	program: number;
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

interface RawPreset {
	name: string;
	preset: number;
	bank: number;
	bag: number;
}

interface RawInstrument {
	name: string;
	bag: number;
}

interface RawSample {
	name: string;
	start: number;
	end: number;
	loopStart: number;
	loopEnd: number;
	rate: number;
	rootKey: number;
	correction: number;
	link: number;
	type: number;
}

/** every table a SoundFont 2 file carries, kept raw so a subset writes them back */
interface SoundTables {
	bytes: Uint8Array;
	presets: RawPreset[];
	presetBags: number[];
	presetGens: Generator[];
	instruments: RawInstrument[];
	instBags: number[];
	instGens: Generator[];
	samples: RawSample[];
	smpl: Int16Array;
	/** the verbatim INFO list, carried into a subset untouched when present */
	info: Uint8Array | null;
}

/** seconds for a SoundFont timecents value */
function timecents(value: number): number {
	return 2 ** (value / 1200);
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
	return data instanceof ArrayBuffer
		? new Uint8Array(data)
		: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function decodeName(bytes: Uint8Array, at: number): string {
	let name = '';
	for (let i = 0; i < 20; i++) {
		const code = bytes[at + i];
		if (code === 0) break;
		name += String.fromCharCode(code);
	}
	return name;
}

function readTables(bytes: Uint8Array): SoundTables {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const fourcc = (at: number): string => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
	if (fourcc(0) !== 'RIFF' || fourcc(8) !== 'sfbk') throw new Error('not a SoundFont 2 file');

	const chunks = new Map<string, { at: number; size: number }>();
	const lists = new Map<string, { at: number; size: number }>();
	const walk = (start: number, end: number): void => {
		let at = start;
		while (at + 8 <= end) {
			const id = fourcc(at);
			const size = view.getUint32(at + 4, true);
			if (id === 'LIST') {
				lists.set(fourcc(at + 8), { at, size });
				walk(at + 12, at + 8 + size);
			} else chunks.set(id, { at: at + 8, size });
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
	const presets = records('phdr', 38, (at) => ({
		name: decodeName(bytes, at),
		preset: view.getUint16(at + 20, true),
		bank: view.getUint16(at + 22, true),
		bag: view.getUint16(at + 24, true),
	}));
	const instruments = records('inst', 22, (at) => ({
		name: decodeName(bytes, at),
		bag: view.getUint16(at + 20, true),
	}));
	const samples = records('shdr', 46, (at) => ({
		name: decodeName(bytes, at),
		start: view.getUint32(at + 20, true),
		end: view.getUint32(at + 24, true),
		loopStart: view.getUint32(at + 28, true),
		loopEnd: view.getUint32(at + 32, true),
		rate: view.getUint32(at + 36, true),
		rootKey: bytes[at + 40],
		correction: view.getInt8(at + 41),
		link: view.getUint16(at + 42, true),
		type: view.getUint16(at + 44, true),
	}));

	const smplChunk = chunks.get('smpl')!;
	const smpl = new Int16Array(
		bytes.buffer.slice(
			bytes.byteOffset + smplChunk.at,
			bytes.byteOffset + smplChunk.at + smplChunk.size - (smplChunk.size & 1),
		),
	);
	const info = lists.get('INFO') ?? null;
	return {
		bytes,
		presets,
		presetBags: bags('pbag'),
		presetGens: generators('pgen'),
		instruments,
		instBags: bags('ibag'),
		instGens: generators('igen'),
		samples,
		smpl,
		info: info ? bytes.slice(info.at, info.at + 8 + info.size + (info.size & 1)) : null,
	};
}

/** the generators of one bag, in file order */
function bagGens(bagList: readonly number[], gens: readonly Generator[], bag: number): Generator[] {
	return gens.slice(bagList[bag], bagList[bag + 1] ?? gens.length);
}

//Zones of one header entry: [{ gens: Map(oper -> generator) }...]; a first zone lacking the terminal generator is global.
function zonesOf(
	headers: readonly { bag: number }[],
	bagList: readonly number[],
	gens: readonly Generator[],
	index: number,
	terminal: number,
): Zone[] {
	const first = headers[index].bag;
	const last = headers[index + 1]?.bag ?? bagList.length - 1;
	const zones: Zone[] = [];
	let global: Map<number, Generator> | null = null;
	for (let bag = first; bag < last; bag++) {
		const slice = bagGens(bagList, gens, bag);
		const map = new Map<number, Generator>();
		for (const generator of slice) map.set(generator.oper, generator);
		if (!map.has(terminal)) {
			if (bag === first) global = map;
			continue;
		}
		zones.push({ gens: map, global });
	}
	return zones;
}

function generatorOf(zone: Zone, oper: number): Generator | null {
	return zone.gens.get(oper) ?? zone.global?.get(oper) ?? null;
}

function presetIndexOf(presets: Map<string, number>, bank: number, program: number): number | undefined {
	return (
		presets.get(`${bank}:${program}`) ??
		presets.get(`0:${program}`) ??
		(bank === 128 ? presets.get('128:0') : undefined) ??
		presets.get('0:0')
	);
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
	const tables = readTables(toBytes(data));

	const sampleCache = new Map<number, SoundFontSample | null>();
	const tuning = new Map<number, { rootKey: number; correction: number }>();
	const sampleOf = (id: number): SoundFontSample | null => {
		if (sampleCache.has(id)) return sampleCache.get(id)!;
		const header = tables.samples[id];
		if (!header || header.end <= header.start || header.type & 0x8000) {
			sampleCache.set(id, null); //ROM samples live outside the file and cannot play
			return null;
		}
		const frames = new Float32Array(header.end - header.start);
		for (let index = 0; index < frames.length; index++) {
			frames[index] = tables.smpl[header.start + index] / 32768;
		}
		const sample: SoundFontSample = {
			data: frames,
			rate: header.rate || 22050,
			loopStart: header.loopStart - header.start,
			loopEnd: header.loopEnd - header.start,
		};
		sampleCache.set(id, sample);
		tuning.set(id, {
			rootKey: header.rootKey === 255 ? 60 : header.rootKey,
			correction: header.correction,
		});
		return sample;
	};

	const presets = new Map<string, number>();
	for (let index = 0; index < tables.presets.length - 1; index++) {
		presets.set(`${tables.presets[index].bank}:${tables.presets[index].preset}`, index);
	}

	//Zones that sound for (bank, program, key, velocity), each with the resolved playback recipe.
	function voices(bank: number, program: number, key: number, velocity: number): SoundFontVoice[] {
		const presetIndex = presetIndexOf(presets, bank, program);
		if (presetIndex === undefined) return [];
		const out: SoundFontVoice[] = [];
		const within = (zone: Zone, oper: number, value: number): boolean => {
			const generator = generatorOf(zone, oper);
			return !generator || (value >= generator.lo && value <= generator.hi);
		};
		for (const presetZone of zonesOf(
			tables.presets,
			tables.presetBags,
			tables.presetGens,
			presetIndex,
			GENERATORS.instrument,
		)) {
			if (!within(presetZone, GENERATORS.keyRange, key) || !within(presetZone, GENERATORS.velRange, velocity)) {
				continue;
			}
			const instrument = generatorOf(presetZone, GENERATORS.instrument)!.amount;
			if (!tables.instruments[instrument + 1]) continue;
			for (const zone of zonesOf(
				tables.instruments,
				tables.instBags,
				tables.instGens,
				instrument,
				GENERATORS.sampleId,
			)) {
				if (!within(zone, GENERATORS.keyRange, key) || !within(zone, GENERATORS.velRange, velocity)) {
					continue;
				}
				const sampleId = generatorOf(zone, GENERATORS.sampleId)!.amount;
				const sample = sampleOf(sampleId);
				if (!sample) continue;
				const both = (oper: number, fallback = 0): number =>
					(generatorOf(zone, oper)?.amount ?? fallback) + (generatorOf(presetZone, oper)?.amount ?? 0);
				const root = generatorOf(zone, GENERATORS.rootKey)?.amount;
				const modes = generatorOf(zone, GENERATORS.sampleModes)?.amount ?? 0;
				const native = tuning.get(sampleId)!;
				out.push({
					sample,
					rootKey: root !== undefined && root >= 0 ? root : native.rootKey,
					cents: both(GENERATORS.coarseTune) * 100 + both(GENERATORS.fineTune) + native.correction,
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

/**
 * Every sampled voice the given MIDI files can request, as (bank, program) pairs:
 * the channel voice in effect at each scheduled note, with drums mapped to bank 128
 * the same way the renderer maps them. A game's compile step feeds this straight
 * into `subsetSoundFont` so the shipped font carries only these programs.
 *
 * @example
 * ```ts
 * import { parseMidi, collectSoundFontUsage } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 *
 * const usage = collectSoundFontUsage([parseMidi(midiBytes)]);
 * console.log(usage.length);
 * ```
 */
export function collectSoundFontUsage(files: readonly MidiFile[]): SoundFontProgram[] {
	const seen = new Set<string>();
	const out: SoundFontProgram[] = [];
	for (const file of files) {
		for (const note of scheduleMidi(file)) {
			const bank = note.channel === 9 ? 128 : note.bank;
			const key = `${bank}:${note.program}`;
			if (!seen.has(key)) {
				seen.add(key);
				out.push({ bank, program: note.program });
			}
		}
	}
	return out;
}

function u16le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff];
}

function u32le(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function encodeName(name: string): number[] {
	const codes = [...name].map((char) => char.charCodeAt(0) & 0xff).slice(0, 20);
	return [...codes, ...new Array(20 - codes.length).fill(0)];
}

function asciiBytes(text: string): number[] {
	return [...text].map((char) => char.charCodeAt(0));
}

/** one chunk as bytes: kept samples run to megabytes, so this allocates instead of spreading */
function chunkBytes(id: string, payload: ArrayLike<number>): Uint8Array {
	const out = new Uint8Array(8 + payload.length + (payload.length & 1));
	out.set(asciiBytes(id), 0);
	new DataView(out.buffer).setUint32(4, payload.length, true);
	out.set(payload, 8);
	return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
	let length = 0;
	for (const part of parts) length += part.length;
	const out = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

function listBytes(type: string, subs: Uint8Array[]): Uint8Array {
	const body = concat([new Uint8Array(asciiBytes(type)), ...subs]);
	return concat([new Uint8Array(asciiBytes('LIST')), new Uint8Array(u32le(body.length)), body]);
}

/**
 * Writes a smaller, valid SoundFont 2 file carrying only the used programs: their
 * presets (names kept), instruments and samples, with zones, ranges, tuning,
 * envelopes and sample loops copied verbatim and every index remapped. Zones that
 * reference samples missing from the file (ROM samples) are dropped, matching what
 * the reader voices for the full font; the library, genre and morphology metadata
 * is zeroed and the INFO list, when present, rides along untouched. Modulator lists
 * are emptied and 24-bit upper bits are dropped: the reader voices neither, so what
 * it plays is unchanged, while a third-party player would miss those.
 *
 * @example
 * ```ts
 * import { parseMidi, collectSoundFontUsage, subsetSoundFont } from '@datamoc/mw_games/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 * declare const soundfontBytes: ArrayBuffer;
 *
 * const usage = collectSoundFontUsage([parseMidi(midiBytes)]);
 * const pruned = subsetSoundFont(soundfontBytes, usage);
 * console.log(usage.length, pruned.byteLength);
 * ```
 */
export function subsetSoundFont(data: ArrayBuffer | ArrayBufferView, usage: readonly SoundFontProgram[]): ArrayBuffer {
	const tables = readTables(toBytes(data));
	const presetIndex = new Map<string, number>();
	for (let index = 0; index < tables.presets.length - 1; index++) {
		presetIndex.set(`${tables.presets[index].bank}:${tables.presets[index].preset}`, index);
	}

	//Used presets in file order, resolved through the same fallback the reader voices.
	const seenPresets = new Set<number>();
	const usedPresets: number[] = [];
	for (const { bank, program } of usage) {
		const index = presetIndexOf(presetIndex, bank, program);
		if (index !== undefined && !seenPresets.has(index)) {
			seenPresets.add(index);
			usedPresets.push(index);
		}
	}
	usedPresets.sort((a, b) => a - b);

	const usableSample = (id: number): boolean => {
		const header = tables.samples[id];
		return !!header && header.end > header.start && !(header.type & 0x8000);
	};

	//A bag's generators verbatim, except instrument and sample ids are remapped.
	const remapIds = (gens: readonly Generator[], oper: number, ids: Map<number, number>): Generator[] =>
		gens.map((generator) =>
			generator.oper === oper
				? {
						oper,
						lo: ids.get(generator.amount)! & 0xff,
						hi: (ids.get(generator.amount)! >> 8) & 0xff,
						amount: ids.get(generator.amount)!,
					}
				: generator,
		);

	//Instruments in first-use order, with zones that lost their sample dropped.
	const instrumentOrder: number[] = [];
	const instrumentZones = new Map<number, Generator[][]>();
	{
		const seen = new Set<number>();
		for (const preset of usedPresets) {
			const first = tables.presets[preset].bag;
			const last = tables.presets[preset + 1]?.bag ?? tables.presetBags.length - 1;
			for (let bag = first; bag < last; bag++) {
				const gens = bagGens(tables.presetBags, tables.presetGens, bag);
				if (!gens.some((generator) => generator.oper === GENERATORS.instrument)) continue;
				const instrument = gens.find((generator) => generator.oper === GENERATORS.instrument)!.amount;
				if (!tables.instruments[instrument + 1]) continue; // same guard the reader voices with
				if (!seen.has(instrument)) {
					seen.add(instrument);
					instrumentOrder.push(instrument);
				}
			}
		}
	}
	const instrumentNew = new Map(instrumentOrder.map((old, index) => [old, index] as const));
	for (const instrument of instrumentOrder) {
		const first = tables.instruments[instrument].bag;
		const last = tables.instruments[instrument + 1]?.bag ?? tables.instBags.length - 1;
		const zones: Generator[][] = [];
		for (let bag = first; bag < last; bag++) {
			const gens = bagGens(tables.instBags, tables.instGens, bag);
			if (!gens.some((generator) => generator.oper === GENERATORS.sampleId)) continue;
			const sample = gens.find((generator) => generator.oper === GENERATORS.sampleId)!.amount;
			if (!usableSample(sample)) continue;
			zones.push(gens);
		}
		instrumentZones.set(instrument, zones);
	}

	//Samples in first-use order, chasing stereo links one hop so none dangles.
	const sampleOrder: number[] = [];
	{
		const seen = new Set<number>();
		const keep = (id: number): void => {
			if (seen.has(id) || !usableSample(id)) return;
			seen.add(id);
			sampleOrder.push(id);
			const link = tables.samples[id].link;
			if (link !== id) keep(link);
		};
		for (const instrument of instrumentOrder) {
			for (const zone of instrumentZones.get(instrument)!) {
				keep(zone.find((generator) => generator.oper === GENERATORS.sampleId)!.amount);
			}
		}
	}
	const sampleNew = new Map(sampleOrder.map((old, index) => [old, index] as const));

	const genRecord = (generator: Generator): number[] => [...u16le(generator.oper), generator.lo, generator.hi];
	const bagRecord = (genIndex: number): number[] => [...u16le(genIndex), ...u16le(0)];

	//Presets: global zone first when the source has one, then its instrument zones.
	const newPresetBags: number[] = [];
	const newPresetGens: Generator[] = [];
	const newPresets: { name: string; preset: number; bank: number; bag: number }[] = [];
	for (const preset of usedPresets) {
		const source = tables.presets[preset];
		const bagStart = newPresetBags.length;
		const first = source.bag;
		const last = tables.presets[preset + 1]?.bag ?? tables.presetBags.length - 1;
		for (let bag = first; bag < last; bag++) {
			const gens = bagGens(tables.presetBags, tables.presetGens, bag);
			const isGlobal = bag === first && !gens.some((generator) => generator.oper === GENERATORS.instrument);
			if (!isGlobal && !gens.some((generator) => generator.oper === GENERATORS.instrument)) continue;
			newPresetBags.push(newPresetGens.length);
			newPresetGens.push(...remapIds(gens, GENERATORS.instrument, instrumentNew));
		}
		newPresets.push({ name: source.name, preset: source.preset, bank: source.bank, bag: bagStart });
	}
	newPresetBags.push(newPresetGens.length);

	//Instruments: same shape, sample ids remapped, sample zones already pruned above.
	const newInstBags: number[] = [];
	const newInstGens: Generator[] = [];
	const newInstruments: { name: string; bag: number }[] = [];
	for (const instrument of instrumentOrder) {
		const bagStart = newInstBags.length;
		const zones = instrumentZones.get(instrument)!;
		//An instrument whose zones all lost their samples keeps its header with no
		//bags: it voices nothing, exactly like the full font did.
		//A global zone (first bag without a sample id) rides along when present.
		const first = tables.instruments[instrument].bag;
		const last = tables.instruments[instrument + 1]?.bag ?? tables.instBags.length - 1;
		for (let bag = first; bag < last; bag++) {
			const gens = bagGens(tables.instBags, tables.instGens, bag);
			if (bag === first && !gens.some((generator) => generator.oper === GENERATORS.sampleId)) {
				newInstBags.push(newInstGens.length);
				newInstGens.push(...gens);
			}
		}
		for (const zone of zones) {
			newInstBags.push(newInstGens.length);
			newInstGens.push(...remapIds(zone, GENERATORS.sampleId, sampleNew));
		}
		newInstruments.push({ name: tables.instruments[instrument].name, bag: bagStart });
	}
	newInstBags.push(newInstGens.length);

	//Samples: data concatenated, offsets and links remapped, headers otherwise intact.
	const newSamples: RawSample[] = [];
	const sampleData: number[] = [];
	for (const old of sampleOrder) {
		const header = tables.samples[old];
		const start = sampleData.length / 2;
		for (let index = header.start; index < header.end; index++) {
			const word = tables.smpl[index];
			sampleData.push(word & 0xff, (word >> 8) & 0xff);
		}
		const self = sampleNew.get(old)!;
		newSamples.push({
			...header,
			start,
			end: start + (header.end - header.start),
			loopStart: start + (header.loopStart - header.start),
			loopEnd: start + (header.loopEnd - header.start),
			link: sampleNew.get(header.link) ?? self,
		});
	}

	const presetRecords = (entry: { name: string; preset: number; bank: number; bag: number }): number[] => [
		...encodeName(entry.name),
		...u16le(entry.preset),
		...u16le(entry.bank),
		...u16le(entry.bag),
		...new Array(12).fill(0),
	];
	const terminalPreset = tables.presets[tables.presets.length - 1];
	const phdr = chunkBytes('phdr', [
		...newPresets.flatMap(presetRecords),
		...presetRecords({
			name: terminalPreset?.name ?? 'EOS',
			preset: 0,
			bank: 0,
			bag: newPresetBags.length - 1,
		}),
	]);
	const pbag = chunkBytes('pbag', newPresetBags.flatMap(bagRecord));
	const pgen = chunkBytes('pgen', newPresetGens.flatMap(genRecord));
	const pmod = chunkBytes('pmod', new Array(10).fill(0));
	const instRecords = (entry: { name: string; bag: number }): number[] => [
		...encodeName(entry.name),
		...u16le(entry.bag),
	];
	const terminalInst = tables.instruments[tables.instruments.length - 1];
	const inst = chunkBytes('inst', [
		...newInstruments.flatMap(instRecords),
		...instRecords({ name: terminalInst?.name ?? 'EOS', bag: newInstBags.length - 1 }),
	]);
	const ibag = chunkBytes('ibag', newInstBags.flatMap(bagRecord));
	const igen = chunkBytes('igen', newInstGens.flatMap(genRecord));
	const imod = chunkBytes('imod', new Array(10).fill(0));
	const sampleRecords = (header: RawSample): number[] => [
		...encodeName(header.name),
		...u32le(header.start),
		...u32le(header.end),
		...u32le(header.loopStart),
		...u32le(header.loopEnd),
		...u32le(header.rate),
		header.rootKey,
		header.correction & 0xff,
		...u16le(header.link),
		...u16le(header.type),
	];
	const terminalSample: RawSample = {
		name: '',
		start: 0,
		end: 0,
		loopStart: 0,
		loopEnd: 0,
		rate: 0,
		rootKey: 0,
		correction: 0,
		link: 0,
		type: 0,
	};
	const shdr = chunkBytes('shdr', [...newSamples.flatMap(sampleRecords), ...sampleRecords(terminalSample)]);
	const smpl = chunkBytes('smpl', sampleData);
	const sdta = listBytes('sdta', [smpl]);
	const pdta = listBytes('pdta', [phdr, pbag, pmod, pgen, inst, ibag, imod, igen, shdr]);
	const body = concat([new Uint8Array(asciiBytes('sfbk')), ...(tables.info ? [tables.info] : []), sdta, pdta]);
	const bytes = concat([new Uint8Array(asciiBytes('RIFF')), new Uint8Array(u32le(body.length)), body]);
	return bytes.buffer as ArrayBuffer;
}
