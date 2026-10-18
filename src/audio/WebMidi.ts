import type { MidiSynth } from './MidiSynth.ts';

/** one live input port, the part of `MIDIInput` this adapter reads */
export interface WebMidiInputPort {
	readonly name?: string | null;
	onmidimessage: ((event: { data: Uint8Array | null }) => void) | null;
}

/** the part of `MIDIAccess` this adapter reads: its input ports, by id */
export interface WebMidiAccess {
	readonly inputs: ReadonlyMap<string, WebMidiInputPort>;
}

/** a live Web MIDI connection: how many ports feed the synth, and how to stop them */
export interface WebMidiConnection {
	/** how many input ports are wired to the synth */
	readonly ports: number;
	/** detaches every port; a port wired again afterwards is a new connection */
	disconnect(): void;
}

/**
 * Wires every input of a Web MIDI access to a `MidiSynth`: channel messages go to
 * `event`, system-exclusive ones (framed by 0xF0 and 0xF7) to `sysex`, and everything
 * else (clock, active sensing, a message with no data) is dropped, because a synth
 * voices notes, not transport. The access is taken as a value, so a test hands in a
 * fake and a browser hands in `navigator.requestMIDIAccess()`'s answer through
 * `requestWebMidiInput`.
 *
 * @example
 * ```ts
 * import { connectWebMidi, type MidiSynth, type WebMidiAccess } from '@datamoc/mwg/audio';
 *
 * declare const access: WebMidiAccess;
 * declare const synth: MidiSynth;
 *
 * const link = connectWebMidi(access, synth);
 * console.log(link.ports); // how many keyboards are playing into the synth
 * link.disconnect();
 * ```
 */
export function connectWebMidi(access: WebMidiAccess, synth: MidiSynth): WebMidiConnection {
	const wired: WebMidiInputPort[] = [];
	for (const input of access.inputs.values()) {
		input.onmidimessage = (event) => {
			const data = event.data;
			if (!data || data.length === 0) return;
			if (data[0] === 0xf0) synth.sysex(data);
			else if ((data[0] & 0xf0) !== 0xf0) synth.event(data[0], data[1] ?? 0, data[2] ?? 0);
		};
		wired.push(input);
	}
	let connected = true;
	return {
		ports: wired.length,
		disconnect(): void {
			if (!connected) return;
			connected = false;
			for (const input of wired) input.onmidimessage = null;
		},
	};
}

/**
 * Asks the browser for Web MIDI and wires it to `synth`: null where the browser has no
 * Web MIDI (or the player refused it), so a game offers the live keyboard only where it
 * can exist. System-exclusive is requested, since a bank dump arrives as sysex; a refusal
 * of sysex alone still connects, without it.
 *
 * @example
 * ```ts
 * import { requestWebMidiInput, type MidiSynth } from '@datamoc/mwg/audio';
 *
 * declare const synth: MidiSynth;
 *
 * const link = await requestWebMidiInput(synth);
 * console.log(link === null ? 'no live input here' : `${link.ports} port(s) live`);
 * ```
 */
export async function requestWebMidiInput(synth: MidiSynth): Promise<WebMidiConnection | null> {
	const nav = navigator as Navigator & {
		requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<unknown>;
	};
	if (typeof nav.requestMIDIAccess !== 'function') return null;
	try {
		return connectWebMidi((await nav.requestMIDIAccess({ sysex: true })) as WebMidiAccess, synth);
	} catch {
		try {
			return connectWebMidi((await nav.requestMIDIAccess()) as WebMidiAccess, synth);
		} catch {
			return null;
		}
	}
}
