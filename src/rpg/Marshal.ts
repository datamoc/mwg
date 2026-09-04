/**
 * Ruby's `Marshal` binary serialisation format (version 4.8, unchanged since Ruby 1.8) -
 * the container `Game.rxdata` and every other RPG Maker XP/VX save are written in. This is
 * format engineering, not RPG Maker's own code or content: the byte layout below is Ruby's
 * own standard-library format, learned the ordinary way any undocumented format is, by
 * reading real files in it. Nothing here knows what an RPG Maker save's own classes
 * (`Game_Party`, `Game_Actor`) mean; it only turns the container's bytes into a faithful,
 * generic JS shape a game can then interpret however it needs to. See CLAUDE.md's licence
 * convention and ROADMAP.md item 100 for where this line sits.
 *
 * What decodes: nil, true, false, Fixnum, Bignum, Float, String, Symbol, Array, Hash
 * (including one with a default value, read separately via `hashDefaultOf` rather than as a
 * fake entry - a real Hash key equal to any string sentinel would otherwise collide with
 * it), and Object (`o`, a class name plus its instance variables) - everything a plain-data
 * save file actually needs. `_dump`/`_load` values
 * (`u`) decode to their class name plus the opaque bytes their own `_load` would need,
 * since that per-class binary layout is a second, undocumented format nested inside this
 * one and out of scope the same way a container format never explains the media it holds.
 * `marshal_dump`/`marshal_load` values (`U`) decode fully, since their payload is an
 * ordinary Marshal value. Backreferences (`@`, `;`) resolve against the same link tables a
 * real Ruby `Marshal.load` keeps, so a value referenced twice decodes to the same object
 * twice rather than being duplicated.
 */

/** an RPG Maker (or any other) object: its class name and every instance variable, by name */
export interface RubyObject {
	class: string;
	ivars: Record<string, unknown>;
}

/** a value only `_dump`/`_load` on its own class could decode further - see the module doc */
export interface RubyUserDefined {
	class: string;
	raw: Uint8Array;
}

/**
 * Marks a JS string as a Ruby Symbol rather than a String when encoding - `decodeMarshal`
 * maps both to a plain JS string (the distinction rarely matters for reading a save back),
 * but writing needs to know which one to produce. `RubyObject.ivars`' keys are always
 * written as symbols regardless, since that half of the format has no other option.
 */
export class RubySymbol {
	readonly name: string;

	constructor(name: string) {
		this.name = name;
	}
}

const MARSHAL_MAJOR = 4;
const MARSHAL_MINOR = 8;

//a Hash.new(default)'s default value, keyed by the decoded Map itself rather than a fake
//entry - a real Hash key equal to any string sentinel would otherwise be overwritten
const hashDefaults = new WeakMap<Map<unknown, unknown>, unknown>();

/** the default value of a Hash decoded from `Hash.new(default)` (Marshal's `}` tag), if any */
export function hashDefaultOf(hash: Map<unknown, unknown>): unknown {
	return hashDefaults.get(hash);
}

/** marks a Map for `encodeMarshal` to write back out as a `Hash.new(default)`, tag `}` */
export function withHashDefault(hash: Map<unknown, unknown>, defaultValue: unknown): Map<unknown, unknown> {
	hashDefaults.set(hash, defaultValue);
	return hash;
}

class Reader {
	private pos = 0;
	private symbols: string[] = [];
	private objects: unknown[] = [];
	private bytes: Uint8Array;

	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	private byte(): number {
		if (this.pos >= this.bytes.length) throw new Error('Marshal: unexpected end of input');
		return this.bytes[this.pos++];
	}

	private take(count: number): Uint8Array {
		//a negative count (a corrupt length-prefixed field) would otherwise pass the length
		//check below silently, since subarray(pos, pos + count) with count < 0 clamps to an
		//empty slice rather than throwing, and rewind pos backward instead of erroring
		if (count < 0) throw new Error('Marshal: negative length');
		const slice = this.bytes.subarray(this.pos, this.pos + count);
		if (slice.length < count) throw new Error('Marshal: unexpected end of input');
		this.pos += count;
		return slice;
	}

	/** Ruby's variable-length integer encoding - see the module doc for the byte layout */
	private readFixnum(): number {
		const c = this.byte() << 24 >> 24; // reinterpret as signed 8-bit
		if (c === 0) return 0;
		if (c >= 5 && c <= 127) return c - 5;
		if (c <= -5 && c >= -128) return c + 5;

		if (c > 0) {
			let value = 0;
			for (let i = 0; i < c; i++) value |= this.byte() << (8 * i);
			return value >>> 0;
		}

		const n = -c;
		let value = 0;
		for (let i = 0; i < n; i++) value |= this.byte() << (8 * i);
		return (value >>> 0) - 2 ** (8 * n);
	}

	private readBytes(): Uint8Array {
		return this.take(this.readFixnum());
	}

	private readSymbol(): string {
		const name = new TextDecoder().decode(this.readBytes());
		this.symbols.push(name);
		return name;
	}

	private readSymbolLink(): string {
		const index = this.readFixnum();
		const name = this.symbols[index];
		if (name === undefined) throw new Error(`Marshal: symbol link ${index} out of range`);
		return name;
	}

	/** reads whichever of `:` (a new symbol) or `;` (a link to one already seen) comes next */
	private readSymbolValue(): string {
		const tag = String.fromCharCode(this.byte());
		if (tag === ':') return this.readSymbol();
		if (tag === ';') return this.readSymbolLink();
		throw new Error(`Marshal: expected a symbol, got tag "${tag}"`);
	}

	private link<T>(value: T): T {
		this.objects.push(value);
		return value;
	}

	/**
	 * A Bignum decodes to a plain JS `number`, not a `bigint` - correct up to
	 * `Number.MAX_SAFE_INTEGER` (2^53), silently imprecise past it, the same rounding a plain
	 * `JSON.parse` of a huge integer already has. RPG Maker save data has no legitimate use
	 * for an integer that large (`Game_Party`'s gold, item counts, switch/variable ids are
	 * all ordinary Fixnum range), so this stays a `number` for a uniform return type rather
	 * than `number | bigint` for a case no real `.rxdata` file exercises.
	 */
	private readBignum(): number {
		const sign = String.fromCharCode(this.byte()) === '-' ? -1 : 1;
		const words = this.readFixnum();
		let value = 0;
		let multiplier = 1;
		for (let i = 0; i < words; i++) {
			value += (this.byte() | (this.byte() << 8)) * multiplier;
			multiplier *= 65536;
		}
		return sign * value;
	}

	private readFloat(): number {
		const text = new TextDecoder().decode(this.readBytes());
		if (text === 'inf') return Infinity;
		if (text === '-inf') return -Infinity;
		if (text === 'nan') return NaN;
		return Number(text);
	}

	private readArray(): unknown[] {
		const array: unknown[] = [];
		this.link(array);
		const length = this.readFixnum();
		for (let i = 0; i < length; i++) array.push(this.readValue());
		return array;
	}

	private readHash(withDefault: boolean): Map<unknown, unknown> {
		const map = new Map<unknown, unknown>();
		this.link(map);
		const length = this.readFixnum();
		for (let i = 0; i < length; i++) map.set(this.readValue(), this.readValue());
		//a Hash.new(default)'s default lives out of band, in hashDefaults - never as a fake
		//entry, which a real key equal to that sentinel would silently collide with
		if (withDefault) hashDefaults.set(map, this.readValue());
		return map;
	}

	private readIvars(count: number): Record<string, unknown> {
		const ivars: Record<string, unknown> = {};
		for (let i = 0; i < count; i++) ivars[this.readSymbolValue()] = this.readValue();
		return ivars;
	}

	private readObject(): RubyObject {
		const object: RubyObject = { class: '', ivars: {} };
		this.link(object);
		object.class = this.readSymbolValue();
		object.ivars = this.readIvars(this.readFixnum());
		return object;
	}

	/** a string, possibly wrapped in `I` (instance-variable) metadata such as its encoding */
	private readIvarWrapped(): unknown {
		const value = this.readValue();
		this.readIvars(this.readFixnum()); // encoding/other ivars are metadata this reader does not expose
		return value;
	}

	private readUserDefined(): RubyUserDefined {
		const value: RubyUserDefined = { class: '', raw: new Uint8Array() };
		this.link(value);
		value.class = this.readSymbolValue();
		value.raw = this.readBytes().slice();
		return value;
	}

	private readUserMarshal(): { class: string; value: unknown } {
		const wrapper: { class: string; value: unknown } = { class: '', value: null };
		this.link(wrapper);
		wrapper.class = this.readSymbolValue();
		wrapper.value = this.readValue();
		return wrapper;
	}

	readValue(): unknown {
		const tag = String.fromCharCode(this.byte());
		switch (tag) {
			case '0':
				return null;
			case 'T':
				return true;
			case 'F':
				return false;
			case 'i':
				return this.readFixnum();
			case 'l':
				return this.link(this.readBignum());
			case 'f':
				return this.link(this.readFloat());
			case ':':
				return this.readSymbol();
			case ';':
				return this.readSymbolLink();
			case '"':
				return this.link(new TextDecoder().decode(this.readBytes()));
			case '[':
				return this.readArray();
			case '{':
				return this.readHash(false);
			case '}':
				return this.readHash(true);
			case 'o':
				return this.readObject();
			case 'I':
				return this.readIvarWrapped();
			case 'u':
				return this.readUserDefined();
			case 'U':
				return this.readUserMarshal();
			case '@': {
				const index = this.readFixnum();
				const value = this.objects[index];
				if (value === undefined) throw new Error(`Marshal: object link ${index} out of range`);
				return value;
			}
			default:
				throw new Error(`Marshal: unsupported tag "${tag}" (0x${tag.charCodeAt(0).toString(16)})`);
		}
	}

	readDocument(): unknown {
		const major = this.byte();
		const minor = this.byte();
		if (major !== MARSHAL_MAJOR || minor > MARSHAL_MINOR) {
			throw new Error(`Marshal: unsupported version ${major}.${minor} (expected ${MARSHAL_MAJOR}.${MARSHAL_MINOR} or lower)`);
		}
		return this.readValue();
	}
}

/** decodes one Marshal document (a whole `.rxdata` file, or any other Marshal dump) */
export function decodeMarshal(bytes: Uint8Array): unknown {
	return new Reader(bytes).readDocument();
}

function isRubyObject(value: unknown): value is RubyObject {
	return typeof value === 'object' && value !== null && 'class' in value && 'ivars' in value;
}

/**
 * Encodes one Marshal document from the same shapes `decodeMarshal` produces: `null`,
 * `boolean`, `number` (written as a Fixnum when it is a safe integer, a Float otherwise),
 * `string` (a Marshal String, unless wrapped in `RubySymbol`), `Array`, `Map` (a Hash, key
 * order preserved), and `RubyObject`.
 *
 * Every value is written fresh rather than reusing Ruby's own backreference scheme for a
 * repeated string, symbol or object - valid Marshal either way, since backreferences are an
 * optional size optimisation, not something a reader is required to produce. A save written
 * this way is larger than Ruby's own `Marshal.dump` would make it, never incorrect.
 * `RubyUserDefined` (a `_dump`/`_load` value) cannot be re-encoded at all, for the same
 * reason `decodeMarshal` cannot interpret its bytes: that per-class binary layout is a
 * second format this module was never taught.
 */
export function encodeMarshal(value: unknown): Uint8Array {
	const chunks: number[] = [MARSHAL_MAJOR, MARSHAL_MINOR];
	writeValue(chunks, value);
	return new Uint8Array(chunks);
}

function writeValue(out: number[], value: unknown): void {
	if (value === null || value === undefined) {
		out.push(char('0'));
	} else if (value === true) {
		out.push(char('T'));
	} else if (value === false) {
		out.push(char('F'));
	} else if (value instanceof RubySymbol) {
		out.push(char(':'));
		writeByteString(out, value.name);
	} else if (typeof value === 'number') {
		if (Number.isInteger(value) && Math.abs(value) < 2 ** 30) {
			out.push(char('i'));
			writeFixnum(out, value);
		} else {
			out.push(char('f'));
			writeByteString(out, Number.isFinite(value) ? String(value) : value > 0 ? 'inf' : value < 0 ? '-inf' : 'nan');
		}
	} else if (typeof value === 'string') {
		out.push(char('"'));
		writeByteString(out, value);
	} else if (Array.isArray(value)) {
		out.push(char('['));
		writeFixnum(out, value.length);
		for (const item of value) writeValue(out, item);
	} else if (value instanceof Map) {
		const hasDefault = hashDefaults.has(value);
		out.push(char(hasDefault ? '}' : '{'));
		writeFixnum(out, value.size);
		for (const [key, entry] of value) {
			writeValue(out, key);
			writeValue(out, entry);
		}
		if (hasDefault) writeValue(out, hashDefaults.get(value));
	} else if (isRubyObject(value)) {
		out.push(char('o'));
		out.push(char(':'));
		writeByteString(out, value.class);
		const entries = Object.entries(value.ivars);
		writeFixnum(out, entries.length);
		for (const [name, ivarValue] of entries) {
			out.push(char(':'));
			writeByteString(out, name);
			writeValue(out, ivarValue);
		}
	} else {
		throw new Error(`Marshal: cannot encode a value of type ${typeof value}`);
	}
}

function char(c: string): number {
	return c.charCodeAt(0);
}

function writeByteString(out: number[], text: string): void {
	const bytes = new TextEncoder().encode(text);
	writeFixnum(out, bytes.length);
	for (const byte of bytes) out.push(byte);
}

/** the inverse of `Reader`'s `readFixnum` - see the module doc for the encoding this mirrors */
function writeFixnum(out: number[], value: number): void {
	if (value === 0) {
		out.push(0);
		return;
	}
	if (value > 0 && value <= 122) {
		out.push(value + 5);
		return;
	}
	if (value < 0 && value >= -123) {
		out.push((value - 5) & 0xff);
		return;
	}

	//falls back to the smallest byte count (1-4) that round-trips through readFixnum
	if (value > 0) {
		for (let n = 1; n <= 4; n++) {
			if (value < 2 ** (8 * n)) {
				out.push(n);
				for (let i = 0; i < n; i++) out.push((value >>> (8 * i)) & 0xff);
				return;
			}
		}
	} else {
		for (let n = 1; n <= 4; n++) {
			if (value >= -(2 ** (8 * n))) {
				out.push((-n) & 0xff);
				const unsigned = value + 2 ** (8 * n);
				for (let i = 0; i < n; i++) out.push((unsigned >>> (8 * i)) & 0xff);
				return;
			}
		}
	}
	throw new Error(`Marshal: integer ${value} is out of range for a Fixnum`);
}
