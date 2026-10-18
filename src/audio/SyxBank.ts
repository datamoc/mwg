import type { MidiSynth } from './MidiSynth.ts';
import type { RenderedMidi } from './MidiRender.ts';

/**
 * The system-exclusive messages of a `.syx` file, in file order, each framed by its 0xF0
 * and 0xF7. Bytes before the first 0xF0 and an unterminated final message are not
 * messages and are left out, because a bank file a player dropped is likelier truncated
 * or padded than malicious, and the messages that are whole are still usable.
 *
 * @example
 * ```ts
 * import { splitSysex } from '@datamoc/mwg/audio';
 *
 * const messages = splitSysex(new Uint8Array([0xf0, 0x41, 0xf7, 0xf0, 0x42, 0xf7]));
 * console.log(messages.length); // 2
 * ```
 */
export function splitSysex(bytes: Uint8Array): Uint8Array[] {
	const messages: Uint8Array[] = [];
	let start = -1;
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i] === 0xf0) start = i;
		else if (bytes[i] === 0xf7 && start >= 0) {
			messages.push(bytes.slice(start, i + 1));
			start = -1;
		}
	}
	return messages;
}

/** what a DX7 voice says about its own build, read from the packed bytes (no synth needed) */
export interface Dx7VoiceInfo {
	/** the FM algorithm, 1 to 32: how the six operators are wired */
	algorithm: number;
	/** operator 6's feedback, 0 to 7 */
	feedback: number;
	lfoWave: 'triangle' | 'saw down' | 'saw up' | 'square' | 'sine' | 'sample and hold';
	/** the voice's transposition in semitones from middle C, -24 to 24 */
	transpose: number;
}

const DX7_LFO_WAVES: Dx7VoiceInfo['lfoWave'][] = [
	'triangle',
	'saw down',
	'saw up',
	'square',
	'sine',
	'sample and hold',
];

/**
 * The algorithm, feedback, LFO wave and transposition of one packed 128-byte DX7 voice (the bytes
 * after the six 17-byte operator blocks and the pitch envelope).
 *
 * @example
 * ```ts
 * import { dx7VoiceInfo } from '@datamoc/mwg/audio';
 *
 * const voice = new Uint8Array(128);
 * voice[110] = 4; //algorithm 5
 * voice[111] = 6; //feedback 6
 * console.log(dx7VoiceInfo(voice).algorithm, dx7VoiceInfo(voice).feedback); // 5 6
 * ```
 */
export function dx7VoiceInfo(voice: Uint8Array): Dx7VoiceInfo {
	return {
		algorithm: (voice[110] & 0x1f) + 1,
		feedback: voice[111] & 0x07,
		lfoWave: DX7_LFO_WAVES[(voice[116] >> 1) & 0x07] ?? 'triangle',
		transpose: Math.min(24, Math.max(-24, (voice[117] & 0x3f) - 24)),
	};
}

/** a patch `SyxBank.audit` flagged, with the loudest sample it rendered */
export interface SyxPatchFinding {
	patch: SyxPatch;
	kind: 'silent' | 'clipping';
	peak: number;
}

/** what a reader left out of a `.syx` file, so a tolerant read can say so instead of refusing the file */
export interface SyxSkip {
	kind: 'leading-bytes' | 'unterminated' | 'bad-checksum' | 'unrecognised';
	/** index into `splitSysex(bytes)` of the message concerned, absent for bytes outside any message */
	message?: number;
	/** how many bytes were left out */
	bytes: number;
}

/**
 * Splits a `.syx` file like `splitSysex` and also says what it left out: bytes before the first
 * 0xF0 (`leading-bytes`), an unterminated final message (`unterminated`), a DX7-shaped bank whose
 * checksum fails (`bad-checksum`), and whole messages that are no DX7 bank (`unrecognised`, which
 * is normal for another maker's data and for a single-voice dump). A file with several banks, a
 * corrupt message or another model in it is therefore read for what is usable and reported for
 * the rest.
 *
 * @example
 * ```ts
 * import { readSyx } from '@datamoc/mwg/audio';
 *
 * const { messages, skipped } = readSyx(new Uint8Array([1, 2, 0xf0, 0x41, 0xf7]));
 * console.log(messages.length, skipped); // 1 [{ kind: 'leading-bytes', bytes: 2 }, ...]
 * ```
 */
export function readSyx(bytes: Uint8Array): { messages: Uint8Array[]; skipped: SyxSkip[] } {
	const messages = splitSysex(bytes);
	const skipped: SyxSkip[] = [];
	const first = bytes.indexOf(0xf0);
	if (first !== 0) skipped.push({ kind: 'leading-bytes', bytes: first === -1 ? bytes.length : first });
	const last = bytes.lastIndexOf(0xf0);
	if (last !== -1 && bytes.indexOf(0xf7, last) === -1) {
		skipped.push({ kind: 'unterminated', bytes: bytes.length - last });
	}
	messages.forEach((message, index) => {
		if (dx7BankData(message)) return;
		const looksLikeBank =
			message.length === 6 + DX7_BULK_DATA + 2 &&
			message[1] === 0x43 &&
			message[3] === 0x09 &&
			message[4] === 0x20;
		skipped.push({ kind: looksLikeBank ? 'bad-checksum' : 'unrecognised', message: index, bytes: message.length });
	});
	return { messages, skipped };
}

/** a 64-bit FNV-1a of `bytes` as 16 hex digits: a content fingerprint, not a security hash */
function fingerprint(bytes: Uint8Array): string {
	let hash = 0xcbf29ce484222325n;
	for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
	return hash.toString(16).padStart(16, '0');
}

/** one named patch inside a bank: which message carries it and where its voice sits in it */
export interface SyxPatch {
	/**
	 * `source`, the slot and the content: `<source>#<message>.<voice>@<fingerprint of the voice's bytes>`.
	 * A name is not enough to tell patches apart (many banks reuse a handful of names), and this is
	 * what a save should hold; the fingerprint changes when the voice is edited, the slot when it is moved.
	 */
	id: string;
	name: string;
	/** how the voice is built, for a list of choices; present for a DX7 voice */
	info?: Dx7VoiceInfo;
	/** index into `splitSysex(bytes)` of the message the patch belongs to */
	message: number;
	/** the voice's number inside that message's bank, 0-based */
	voice: number;
}

const DX7_BULK_DATA = 4096;
const DX7_VOICES = 32;
const DX7_PACKED_VOICE = 128;

/**
 * Whether a message is a DX7 32-voice bulk dump, and its data checked: the header names
 * Yamaha and the bulk format, the length is one whole bank, and the checksum (the data
 * bytes and the checksum together summing to a multiple of 128) holds. A bank whose
 * checksum fails is not a bank whose names can be trusted.
 */
function dx7BankData(message: Uint8Array): Uint8Array | null {
	//F0 43 0n 09 20 00, then the data, a checksum and F7
	if (message.length !== 6 + DX7_BULK_DATA + 2) return null;
	if (message[0] !== 0xf0 || message[1] !== 0x43 || (message[2] & 0xf0) !== 0x00) return null;
	if (message[3] !== 0x09 || message[4] !== 0x20 || message[5] !== 0x00) return null;
	const data = message.subarray(6, 6 + DX7_BULK_DATA);
	let sum = message[6 + DX7_BULK_DATA];
	for (const byte of data) sum += byte;
	return sum % 128 === 0 ? data : null;
}

/**
 * The patch names of a `.syx` bank: every DX7 32-voice bulk dump in it contributes its
 * 32 voices, whose names are the last ten bytes of each packed voice. Messages that are
 * not whole, checksummed DX7 banks contribute nothing (their names would be guesses).
 *
 * @example
 * ```ts
 * import { dx7PatchNames } from '@datamoc/mwg/audio';
 *
 * declare const bankBytes: Uint8Array;
 *
 * console.log(dx7PatchNames(bankBytes)); // ['BRASS1', 'STRINGS', ...] or [] for another maker's bank
 * ```
 */
export function dx7PatchNames(bytes: Uint8Array, source = 'bank'): SyxPatch[] {
	const patches: SyxPatch[] = [];
	splitSysex(bytes).forEach((message, index) => {
		const data = dx7BankData(message);
		if (!data) return;
		for (let voice = 0; voice < DX7_VOICES; voice++) {
			const at = voice * DX7_PACKED_VOICE + 118;
			const name = String.fromCharCode(...data.subarray(at, at + 10))
				.replaceAll('\0', ' ')
				.trim();
			const packed = data.subarray(voice * DX7_PACKED_VOICE, (voice + 1) * DX7_PACKED_VOICE);
			const id = `${source}#${index}.${voice}@${fingerprint(packed)}`;
			patches.push({ id, name, message: index, voice, info: dx7VoiceInfo(packed) });
		}
	});
	return patches;
}

/**
 * A `.syx` bank a player dropped: its messages, the DX7 patch names in it, and an
 * audition that loads a patch into a `MidiSynth` and renders one note through it, so a
 * settings screen can show the names and let the player hear one before committing.
 * Auditioning sends the whole bank message (a DX7 loads voices as a bank, and the synth
 * owns which voice it then plays), then a single note for `seconds` plus a short tail.
 *
 * @example
 * ```ts
 * import { SyxBank, type MidiSynth } from '@datamoc/mwg/audio';
 *
 * declare const bankBytes: Uint8Array;
 * declare const synth: MidiSynth;
 *
 * const bank = new SyxBank(bankBytes);
 * console.log(bank.patches.map((patch) => patch.name));
 * const heard = bank.audition(synth, bank.patches[0]);
 * console.log(heard.duration > 0); // true
 * ```
 */
export class SyxBank {
	/** every whole sysex message in the file, in order */
	readonly messages: Uint8Array[];
	/** the DX7 patches in it, in bank order; empty for another maker's bank */
	readonly patches: SyxPatch[];
	/** what the read left out and why; empty for a clean DX7 bank file */
	readonly skipped: SyxSkip[];

	/** `source` names the file in each patch's `id` (a file name, a package asset id); `bank` when omitted */
	constructor(bytes: Uint8Array, source = 'bank') {
		const read = readSyx(bytes);
		this.messages = read.messages;
		this.skipped = read.skipped;
		this.patches = dx7PatchNames(bytes, source);
	}

	/**
	 * Renders one note of every patch through `synth` and reports the ones that come out silent
	 * (peak under `silentBelow`, 0.002 when omitted) or clipped (a peak at full scale), so an author
	 * knows before publishing a bank. A screen: it says a patch makes no sound or too much, not that
	 * it sounds right.
	 */
	audit(synth: MidiSynth, options: { note?: number; silentBelow?: number } = {}): SyxPatchFinding[] {
		const findings: SyxPatchFinding[] = [];
		const silentBelow = options.silentBelow ?? 0.002;
		for (const patch of this.patches) {
			const heard = this.audition(synth, patch, options.note ?? 60, 0.4);
			let peak = 0;
			for (let i = 0; i < heard.left.length; i++)
				peak = Math.max(peak, Math.abs(heard.left[i]), Math.abs(heard.right[i]));
			if (peak < silentBelow) findings.push({ patch, kind: 'silent', peak });
			else if (peak >= 0.9999) findings.push({ patch, kind: 'clipping', peak });
		}
		return findings;
	}

	/**
	 * Renders one note with `patch` loaded into `synth`: the patch's bank message goes to
	 * the synth as sysex, then the note sounds for `seconds` and decays over a short tail.
	 */
	audition(synth: MidiSynth, patch: SyxPatch, note = 60, seconds = 0.5): RenderedMidi {
		const sampleRate = synth.sampleRate;
		const tail = 0.25;
		const frames = Math.max(1, Math.ceil((seconds + tail) * sampleRate));
		const left = new Float32Array(frames);
		const right = new Float32Array(frames);
		synth.reset();
		const message = this.messages[patch.message];
		if (message) synth.sysex(message);
		//a loaded bank answers a program change by selecting its voice, so each patch is heard on its own
		synth.event(0xc0, patch.voice, 0);
		synth.event(0x90, note, 96);
		const sounding = Math.min(frames, Math.ceil(seconds * sampleRate));
		synth.render(left, right, 0, sounding);
		synth.event(0x80, note, 0);
		if (frames > sounding) synth.render(left, right, sounding, frames - sounding);
		synth.reset();
		return { sampleRate, left, right, loopStart: 0, loopEnd: seconds + tail, duration: seconds + tail };
	}
}
