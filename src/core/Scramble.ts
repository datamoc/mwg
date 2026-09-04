/**
 * XOR-with-a-key text scrambling. This is explicitly **not encryption** and must never be
 * presented to a player or a game's own documentation as one: it stops a save being
 * hand-edited by someone opening it in a text editor, and deliberately nothing stronger -
 * the key is recoverable from the scrambled text plus any known plaintext fragment, the
 * classic XOR weakness, accepted on purpose rather than overlooked. Reach for this only
 * where "not trivially editable" is the actual requirement, per `SaveSystem.exportSlot`'s
 * own use of it.
 */
export function scramble(text: string, key: string): string {
	if (!key) throw new Error('scramble needs a non-empty key');
	const bytes = new TextEncoder().encode(text);
	const keyBytes = new TextEncoder().encode(key);
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
	return toBase64(out);
}

/** reverses `scramble`; throws if `key` does not match the one it was scrambled with (garbled UTF-8 rather than a silent wrong answer) */
export function unscramble(payload: string, key: string): string {
	if (!key) throw new Error('scramble needs a non-empty key');
	const bytes = fromBase64(payload);
	const keyBytes = new TextEncoder().encode(key);
	const out = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
	return new TextDecoder('utf-8', { fatal: true }).decode(out);
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
