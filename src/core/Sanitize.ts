/**
 * Cheap, structural checks over inbound data - a save imported from another device or
 * server (`SaveSystem.importSlot`), a news feed response (`NewsClient`), an external save
 * format (`rpg.decodeMarshal`) - run before any of it is parsed or handed to a game as
 * trusted state. Deliberately narrow: a size cap and a control-character check catch a
 * truncated, corrupted, or hostile payload cheaply, ahead of and distinct from validating
 * that a parsed value's own fields have the shape a game actually expects (`validateSchema`,
 * below), which is a separate, deeper pass over already-parsed data.
 */

export interface SizeLimitOptions {
	/** bytes; defaults to 10 MB */
	maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** throws once `data`'s size (UTF-8 byte length for a string, byte length for a buffer) exceeds the cap */
export function checkSize(data: string | Uint8Array, options: SizeLimitOptions = {}): void {
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const size = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
	if (size > maxBytes) throw new Error(`inbound data exceeds the ${maxBytes}-byte limit (${size} bytes)`);
}

/**
 * Throws on an embedded NUL byte or a control character outside ordinary whitespace
 * (tab, newline, carriage return) - the kind of byte a well-formed save or news response
 * never legitimately contains, and a cheap tell that a payload was truncated, corrupted, or
 * deliberately malformed before it ever reaches `JSON.parse`.
 */
export function checkNoControlCharacters(text: string): void {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code === 0x09 || code === 0x0a || code === 0x0d) continue; //tab, LF, CR
		if (code <= 0x1f || code === 0x7f) {
			throw new Error(`inbound data contains a control character (0x${code.toString(16).padStart(2, '0')}) at index ${i}`);
		}
	}
}

/** `checkSize` then `checkNoControlCharacters` - the minimum bar before any inbound text is parsed */
export function sanitizeInboundText(text: string, options: SizeLimitOptions = {}): string {
	checkSize(text, options);
	checkNoControlCharacters(text);
	return text;
}

/**
 * A small schema for validating an already-parsed value's shape - deliberately not a full
 * JSON Schema implementation, only what `SaveSystem`/`NewsClient`-shaped data actually needs:
 * primitives, arrays, and objects, with `__proto__`/`constructor`/`prototype` keys always
 * rejected regardless of what a schema itself asks for, since no legitimate save or feed
 * payload ever needs to set one and a parsed JSON object having one is exactly the
 * prototype-pollution shape this exists to catch.
 */
export type Schema =
	| { type: 'string'; optional?: boolean }
	| { type: 'number'; optional?: boolean; min?: number; max?: number }
	| { type: 'boolean'; optional?: boolean }
	| { type: 'object'; optional?: boolean; fields: Record<string, Schema> }
	| { type: 'array'; optional?: boolean; items: Schema; maxLength?: number };

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** throws with a path-qualified message at the first field that does not match `schema` */
export function validateSchema(value: unknown, schema: Schema, path = '$'): void {
	if (value === undefined) {
		if (schema.optional) return;
		throw new Error(`${path} is required`);
	}

	switch (schema.type) {
		case 'string':
			if (typeof value !== 'string') throw new Error(`${path} must be a string`);
			return;
		case 'number':
			if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
			if (schema.min !== undefined && value < schema.min) throw new Error(`${path} must be >= ${schema.min}`);
			if (schema.max !== undefined && value > schema.max) throw new Error(`${path} must be <= ${schema.max}`);
			return;
		case 'boolean':
			if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
			return;
		case 'array':
			if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
			if (schema.maxLength !== undefined && value.length > schema.maxLength) {
				throw new Error(`${path} exceeds its maximum length of ${schema.maxLength}`);
			}
			value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
			return;
		case 'object': {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
			for (const key of Object.keys(value)) {
				if (FORBIDDEN_KEYS.has(key)) throw new Error(`${path} contains a forbidden key "${key}"`);
			}
			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				validateSchema((value as Record<string, unknown>)[key], fieldSchema, `${path}.${key}`);
			}
			return;
		}
	}
}
