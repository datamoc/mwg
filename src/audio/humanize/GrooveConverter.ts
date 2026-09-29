import {
	assertGrooveTemplate,
	subdivisionCount,
	subdivisionTicks,
	type GridSubdivision,
	type GrooveOffset,
	type GrooveTemplate,
} from './Groove.ts';

/**
 * Moving a `GrooveTemplate` in and out of the two formats that can actually carry one:
 * JSON, which carries every field exactly, and a Standard MIDI File, which cannot hold a
 * fractional slot or an unbounded velocity and says so instead of rounding quietly.
 *
 * The MIDI encoding is one note per slot, with a note one subdivision ahead of slot 0 as
 * an anchor. That anchor is why the writer demands `|timeOffsetTicks| < slotTicks`: the
 * reader recovers each offset as *its own grid position*, so an offset a full slot long
 * would be indistinguishable from a slot shift. Velocity rides on the note-on velocity at
 * 1/64 per unit of `velocityFactor`, which fixes the valid factor range to
 * `[1/64, 127/64]` - both ends are enforced rather than clamped.
 *
 * `.agr` and `.reaper-groove` are names in the format union, not shipped readers: both
 * are undocumented proprietary containers, and a half-working guess would silently load
 * the wrong groove rather than fail.
 */

/** what a template can be written to and read back from */
export type GrooveFormat = 'json' | 'midi' | 'ableton-agr' | 'reaper-groove';

export interface GrooveConverterEngine {
	/** `json` and `midi` return bytes only where the format needs them (MIDI); JSON is text */
	exportFormat(template: GrooveTemplate, format: GrooveFormat): Promise<Uint8Array | string>;
	importFormat(data: Uint8Array | string, format: GrooveFormat): Promise<GrooveTemplate>;
}

/** every text field in a groove MIDI starts with this, so a stray song cannot impersonate one */
const GROOVE_PREFIX = 'mwg-groove:';

/** General MIDI's bass drum, chosen as the first slot's pitch so slots run up from it */
const FIRST_SLOT_PITCH = 36;

/** how many velocity units one unit of velocityFactor buys; fixes the whole valid range */
const VELOCITY_SCALE = 64;

const GRIDS: readonly GridSubdivision[] = ['8n', '16n', '32n'];

const encoder = new TextEncoder();

function notShipped(format: GrooveFormat): never {
	throw new Error(
		`the ${format} format is not shipped: it is an undocumented proprietary container, and a guessed reader could load a different groove than the file holds`,
	);
}

function ascii(text: string): number[] {
	return [...text].map((character) => character.charCodeAt(0) & 0x7f);
}

/** MIDI variable-length quantity: seven bits per byte, high bit set while more follow */
function vlq(value: number): number[] {
	const bytes = [value & 0x7f];
	let rest = value >>> 7;
	while (rest > 0) {
		bytes.unshift((rest & 0x7f) | 0x80);
		rest >>>= 7;
	}
	return bytes;
}

function metaEvent(type: number, body: number[]): number[] {
	return [0xff, type, ...vlq(body.length), ...body];
}

function writeGrooveMidi(template: GrooveTemplate): Uint8Array {
	assertGrooveTemplate(template);
	const { name, timeSignature, ppq, subdivision, offsets } = template;

	const slots = subdivisionCount(timeSignature, subdivision);
	const slotTicks = subdivisionTicks(ppq, subdivision);
	if (ppq > 0x7fff) throw new Error(`groove template "${name}": ppq ${ppq} does not fit MIDI's 15-bit division`);
	if (FIRST_SLOT_PITCH + slots - 1 > 127)
		throw new Error(
			`groove template "${name}": ${slots} slots need pitches up to ${FIRST_SLOT_PITCH + slots - 1}, past MIDI's top note of 127`,
		);

	const microseconds = Math.round(60_000_000 / template.tempoBpm);
	if (microseconds < 1 || microseconds > 0xffffff)
		throw new Error(
			`groove template "${name}": tempoBpm ${template.tempoBpm} does not fit MIDI's three-byte tempo (${microseconds} microseconds)`,
		);

	offsets.forEach((offset, index) => {
		if (Math.abs(offset.timeOffsetTicks) >= slotTicks)
			throw new Error(
				`groove template "${name}": slot ${index} is offset by ${offset.timeOffsetTicks} ticks, outside the +/-${slotTicks} the MIDI encoding's one-slot anchor can tell from a slot shift`,
			);
		const velocity = Math.round(VELOCITY_SCALE * offset.velocityFactor);
		if (velocity < 1 || velocity > 127)
			throw new Error(
				`groove template "${name}": slot ${index} has velocityFactor ${offset.velocityFactor}, outside the ${1 / VELOCITY_SCALE} to ${127 / VELOCITY_SCALE} the MIDI encoding can store at ${1 / VELOCITY_SCALE} per velocity unit`,
			);
	});

	const wires: { tick: number; bytes: number[] }[] = [
		{
			tick: 0,
			bytes: metaEvent(0x51, [(microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff]),
		},
		{ tick: 0, bytes: metaEvent(0x58, [timeSignature[0], Math.log2(timeSignature[1]), 24, 8]) },
		{ tick: 0, bytes: metaEvent(0x01, [...encoder.encode(GROOVE_PREFIX + name)]) },
	];

	offsets.forEach((offset, index) => {
		//the anchor occupies the first subdivision, so slot i's grid position is one slot
		//later than the anchor plus i more; the offset is measured from that position
		const on = slotTicks * (index + 1) + offset.timeOffsetTicks;
		const off = on + Math.max(1, Math.floor(slotTicks / 4));
		wires.push({
			tick: on,
			bytes: [0x90, FIRST_SLOT_PITCH + index, Math.round(VELOCITY_SCALE * offset.velocityFactor)],
		});
		wires.push({ tick: off, bytes: [0x80, FIRST_SLOT_PITCH + index, 0] });
	});

	wires.sort((a, b) => a.tick - b.tick);

	const track: number[] = [];
	let previous = 0;
	for (const wire of wires) {
		track.push(...vlq(wire.tick - previous), ...wire.bytes);
		previous = wire.tick;
	}
	track.push(0, 0xff, 0x2f, 0x00);

	return new Uint8Array([
		...ascii('MThd'),
		0,
		0,
		0,
		6,
		0,
		0,
		0,
		1,
		(ppq >> 8) & 0xff,
		ppq & 0xff,
		...ascii('MTrk'),
		(track.length >>> 24) & 0xff,
		(track.length >>> 16) & 0xff,
		(track.length >>> 8) & 0xff,
		track.length & 0xff,
		...track,
	]);
}

/** which grid gives a bar of this signature exactly this many slots */
function subdivisionFor(timeSignature: [number, number], slots: number): GridSubdivision {
	for (const candidate of GRIDS) {
		try {
			if (subdivisionCount(timeSignature, candidate) === slots) return candidate;
		} catch {
			//a grid that does not tile this bar cannot be the answer
		}
	}
	throw new Error(
		`a ${slots}-slot groove in ${timeSignature[0]}/${timeSignature[1]} is not one of the 8n, 16n or 32n grids`,
	);
}

/**
 * Reads a groove back out of Standard MIDI File bytes.
 *
 * This is a dedicated reader rather than `parseMidi` over the same bytes: a round trip
 * needs the tempo, time-signature and name metas, which `parseMidi` deliberately drops
 * when it flattens a file into gameplay events.
 */
function readGrooveMidi(data: Uint8Array | string): GrooveTemplate {
	const bytes = typeof data === 'string' ? encoder.encode(data) : data;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let cursor = 0;

	const need = (count: number, what: string): void => {
		if (cursor + count > bytes.length) throw new Error(`truncated MIDI file while reading ${what}`);
	};
	const readAscii = (length: number, what: string): string => {
		need(length, what);
		let text = '';
		for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[cursor + i]);
		cursor += length;
		return text;
	};
	const readU8 = (what: string): number => {
		need(1, what);
		return bytes[cursor++];
	};
	const readU16 = (what: string): number => {
		need(2, what);
		const value = view.getUint16(cursor);
		cursor += 2;
		return value;
	};
	const readU32 = (what: string): number => {
		need(4, what);
		const value = view.getUint32(cursor);
		cursor += 4;
		return value;
	};
	const readVlq = (what: string): number => {
		let value = 0;
		for (let i = 0; i < 4; i++) {
			const byte = readU8(what);
			value = (value << 7) | (byte & 0x7f);
			if ((byte & 0x80) === 0) return value;
		}
		throw new Error(`a variable-length quantity in ${what} runs past four bytes`);
	};

	if (readAscii(4, 'the file header') !== 'MThd')
		throw new Error('not a Standard MIDI File: the MThd header is missing');
	const headerLength = readU32('the header length');
	if (headerLength < 6) throw new Error(`MThd is ${headerLength} bytes, expected at least 6`);
	const format = readU16('the format');
	const trackCount = readU16('the track count');
	const division = readU16('the division');
	cursor += headerLength - 6;
	if (format > 1) throw new Error(`MIDI format ${format} is not a file this reader understands`);
	if ((division & 0x8000) !== 0)
		throw new Error('SMPTE time in the division carries no tick grid to read a groove from');
	if (trackCount !== 1) throw new Error(`an mwg groove file holds one track, this one has ${trackCount}`);
	if (readAscii(4, 'the track header') !== 'MTrk') throw new Error('the MTrk track header is missing');
	const trackLength = readU32('the track length');
	const trackEnd = cursor + trackLength;
	if (trackEnd > bytes.length) throw new Error('truncated MIDI file: the track runs past the end of the data');

	let tick = 0;
	let running = 0;
	let microseconds: number | null = null;
	let timeSignature: [number, number] | null = null;
	let grooveName: string | null = null;
	let sawEnd = false;
	const onsets = new Map<number, { tick: number; velocity: number }>();

	while (cursor < trackEnd) {
		tick += readVlq('a delta time');
		let status = bytes[cursor];
		if (status < 0x80) {
			if (running === 0)
				throw new Error(`data at tick ${tick} follows a delta time with no running status to read it under`);
			//the byte is data, not a status: the channel message still stands from before
			status = running;
		} else {
			cursor++;
			if (status < 0xf0) running = status;
		}

		if (status === 0xff) {
			const type = readU8('a meta type');
			const length = readVlq('a meta length');
			need(length, 'a meta event');
			const body = cursor;
			if (type === 0x51 && length === 3)
				microseconds = (bytes[body] << 16) | (bytes[body + 1] << 8) | bytes[body + 2];
			else if (type === 0x58 && length >= 2) timeSignature = [bytes[body], 2 ** bytes[body + 1]];
			else if ((type === 0x01 || type === 0x03) && length > 0) {
				let text = '';
				for (let i = 0; i < length; i++) text += String.fromCharCode(bytes[body + i]);
				if (text.startsWith(GROOVE_PREFIX)) grooveName = text.slice(GROOVE_PREFIX.length);
			}
			cursor += length;
			if (type === 0x2f) sawEnd = true;
			running = 0;
			continue;
		}

		if (status === 0xf0 || status === 0xf7) {
			cursor += readVlq('a sysex length');
			running = 0;
			continue;
		}

		const kind = status & 0xf0;
		if (kind === 0x90 || kind === 0x80) {
			const note = readU8('a note number');
			const velocity = readU8('a note velocity');
			if (kind === 0x90 && velocity > 0) {
				if (onsets.has(note))
					throw new Error(`pitch ${note} carries more than one note-on, which no groove encodes`);
				onsets.set(note, { tick, velocity });
			}
		} else if (kind === 0xb0 || kind === 0xe0) {
			need(2, 'a controller or bend event');
			cursor += 2;
		} else if (kind === 0xc0 || kind === 0xd0) {
			need(1, 'a program or channel-aftertouch event');
			cursor += 1;
		} else throw new Error(`unexpected status byte 0x${status.toString(16)} at tick ${tick}`);
	}

	if (!sawEnd) throw new Error('the track has no end-of-track meta, so the file is incomplete');
	if (grooveName === null) throw new Error(`no ${GROOVE_PREFIX} text meta: this file was not written as a groove`);
	if (timeSignature === null) throw new Error('no time-signature meta: an mwg groove file always carries one');

	const ppq = division;
	const slots = onsets.size;
	const subdivision = subdivisionFor(timeSignature, slots);
	const slotTicks = subdivisionTicks(ppq, subdivision);

	const offsets: GrooveOffset[] = [];
	for (let index = 0; index < slots; index++) {
		const onset = onsets.get(FIRST_SLOT_PITCH + index);
		if (!onset) throw new Error(`slot ${index} is missing: expected a note on pitch ${FIRST_SLOT_PITCH + index}`);
		offsets.push({
			subdivisionIndex: index,
			//slot i's grid position is the anchor plus i subdivisions: the anchor itself
			//is what makes an offset a whole slot long unreadable, hence the writer's bound
			timeOffsetTicks: onset.tick - slotTicks * (index + 1),
			velocityFactor: onset.velocity / VELOCITY_SCALE,
		});
	}

	const template: GrooveTemplate = {
		name: grooveName,
		timeSignature,
		ppq,
		tempoBpm: microseconds === null ? 120 : Math.round((60_000_000 / microseconds) * 100) / 100,
		subdivision,
		offsets,
	};
	assertGrooveTemplate(template);
	return template;
}

function readGrooveJson(data: Uint8Array | string): GrooveTemplate {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new Error(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error('a groove JSON export must be an object');
	assertGrooveTemplate(parsed as GrooveTemplate);
	return parsed as GrooveTemplate;
}

/**
 * Writes a template out and reads one back, through JSON (exact) or MIDI (encoded, with
 * the bounds above enforced on the way in). Asking for `.agr` or `.reaper-groove` throws
 * naming what is missing rather than returning something that merely resembles them.
 *
 * @example
 * ```ts
 * import { GrooveConverter, type GrooveTemplate } from '@datamoc/mw_games/audio';
 *
 * declare const template: GrooveTemplate;
 *
 * const converter = new GrooveConverter();
 * const text = await converter.exportFormat(template, 'json');
 * const copy = await converter.importFormat(text, 'json'); // same offsets, same name
 *
 * const bytes = await converter.exportFormat(template, 'midi');
 * const fromMidi = await converter.importFormat(bytes, 'midi');
 * console.log(fromMidi.tempoBpm === template.tempoBpm); // true: tempo travels as microseconds
 * ```
 */
export class GrooveConverter implements GrooveConverterEngine {
	async exportFormat(template: GrooveTemplate, format: GrooveFormat): Promise<Uint8Array | string> {
		switch (format) {
			case 'json':
				assertGrooveTemplate(template);
				return JSON.stringify(template, null, 2);
			case 'midi':
				return writeGrooveMidi(template);
			case 'ableton-agr':
			case 'reaper-groove':
				return notShipped(format);
			default:
				throw new Error(`unknown groove format: ${String(format)}`);
		}
	}

	async importFormat(data: Uint8Array | string, format: GrooveFormat): Promise<GrooveTemplate> {
		switch (format) {
			case 'json':
				return readGrooveJson(data);
			case 'midi':
				return readGrooveMidi(data);
			case 'ableton-agr':
			case 'reaper-groove':
				return notShipped(format);
			default:
				throw new Error(`unknown groove format: ${String(format)}`);
		}
	}
}
