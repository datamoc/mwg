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
 * import { splitSysex } from '@datamoc/mw_games/audio';
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

/** one named patch inside a bank: which message carries it and where its voice sits in it */
export interface SyxPatch {
	name: string;
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
 * import { dx7PatchNames } from '@datamoc/mw_games/audio';
 *
 * declare const bankBytes: Uint8Array;
 *
 * console.log(dx7PatchNames(bankBytes)); // ['BRASS1', 'STRINGS', ...] or [] for another maker's bank
 * ```
 */
export function dx7PatchNames(bytes: Uint8Array): SyxPatch[] {
	const patches: SyxPatch[] = [];
	splitSysex(bytes).forEach((message, index) => {
		const data = dx7BankData(message);
		if (!data) return;
		for (let voice = 0; voice < DX7_VOICES; voice++) {
			const at = voice * DX7_PACKED_VOICE + 118;
			const name = String.fromCharCode(...data.subarray(at, at + 10))
				.replaceAll('\0', ' ')
				.trim();
			patches.push({ name, message: index, voice });
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
 * import { SyxBank, type MidiSynth } from '@datamoc/mw_games/audio';
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

	constructor(bytes: Uint8Array) {
		this.messages = splitSysex(bytes);
		this.patches = dx7PatchNames(bytes);
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
		synth.event(0x90, note, 96);
		const sounding = Math.min(frames, Math.ceil(seconds * sampleRate));
		synth.render(left, right, 0, sounding);
		synth.event(0x80, note, 0);
		if (frames > sounding) synth.render(left, right, sounding, frames - sounding);
		synth.reset();
		return { sampleRate, left, right, loopStart: 0, loopEnd: seconds + tail, duration: seconds + tail };
	}
}
