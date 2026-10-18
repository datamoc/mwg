import { AudioCoreHost, type AudioCoreHostOptions } from './CoreHost.ts';
import { timedMidiMessages, type MidiFile } from './Midi.ts';
import type { StreamChannel, StreamPlayOptions } from './StreamChannel.ts';
import { onAudioUnderrun } from './Underrun.ts';

/**
 * Starts a MIDI file on a host: resets the core, drops what was rendered ahead and queues every
 * channel message at its own output frame in one post (before any further audio is requested, so a
 * worker never renders the first seconds without them), and returns the frame of the last message.
 * `startFrame` moves the whole file later.
 *
 * @example
 * ```ts
 * import { AudioCoreHost, parseMidi, sendMidiToHost, type AudioCore } from '@datamoc/mwg/audio';
 *
 * declare const midiBytes: ArrayBuffer;
 * declare const factory: (rate: number) => AudioCore;
 *
 * const host = new AudioCoreHost({ sampleRate: 44100, factory });
 * const lastFrame = sendMidiToHost(host, parseMidi(midiBytes));
 * console.log(lastFrame / 44100);
 * ```
 */
export function sendMidiToHost(host: AudioCoreHost, file: MidiFile, startFrame = 0): number {
	const events = timedMidiMessages(file).map(({ time, status, data1, data2 }) => ({
		frame: startFrame + Math.round(time * host.sampleRate),
		status,
		data1,
		data2,
	}));
	host.start(events);
	return events.at(-1)?.frame ?? startFrame;
}

export interface HostedMidiOptions extends AudioCoreHostOptions {
	/** the channel that plays the host's output */
	channel: StreamChannel;
	/** volume, pan and the rest, for the channel's `play` */
	play?: StreamPlayOptions;
}

export interface HostedMidi {
	host: AudioCoreHost;
	/** the frame of the file's last message */
	lastFrame: number;
	/** stops the channel, fading over `fadeSeconds` first when positive, and ends the worker */
	stop(fadeSeconds?: number): void;
}

/**
 * Plays a MIDI file through a synthesis core that runs off the main thread: builds an
 * `AudioCoreHost` (a worker where one exists, the main thread otherwise, `mode: 'auto'` unless
 * told), queues the file's messages on it and hands its output to a `StreamChannel`. A core too
 * heavy for the frame (several voices of a modelled instrument) then costs the frame nothing; where
 * only the main thread exists the sound is the same and `host.stats().mode` says so.
 *
 * @example
 * ```ts
 * import { StreamChannel, parseMidi, playMidiHosted, type AudioCore } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const midiBytes: ArrayBuffer;
 * declare const factory: (rate: number) => AudioCore;
 *
 * const running = playMidiHosted(parseMidi(midiBytes), {
 * 	sampleRate: context.sampleRate,
 * 	factory,
 * 	channel: new StreamChannel(context),
 * });
 * console.log(running.host.stats().mode);
 * ```
 */
export function playMidiHosted(file: MidiFile, options: HostedMidiOptions): HostedMidi {
	const { channel, play, ...hostOptions } = options;
	//no rendering ahead until the file starts: a core that rendered silence first is not a fresh one
	const host = new AudioCoreHost({ prefetch: false, ...hostOptions });
	const lastFrame = sendMidiToHost(host, file);
	channel.play(host, play);
	return {
		host,
		lastFrame,
		stop(fadeSeconds = 0) {
			channel.stop(fadeSeconds);
			host.dispose();
		},
	};
}

/** the part of `TelemetryClient` the forwarder needs, so a test or another transport can stand in */
export interface UnderrunSink {
	send(event: { name: string; properties?: Record<string, string | number | boolean | null> }): Promise<unknown>;
}

export interface UnderrunReportOptions {
	/** at least this many milliseconds between two events; 30000 when omitted */
	minIntervalMs?: number;
	/** the clock, replaced in tests; `Date.now` when omitted */
	now?: () => number;
}

/**
 * Forwards audio underruns to a telemetry sink as `audio_underrun` events, counted and summed so a
 * bad minute is one event, not a thousand: each event carries `count`, `lateSeconds` and `source`
 * (`stream`, `core`, or `mixed`), and no more than one leaves per `minIntervalMs`. The sink's own
 * consent gate still applies (`TelemetryClient` sends nothing before the player agrees). `flush`
 * sends what is waiting; `stop` flushes and unsubscribes.
 *
 * @example
 * ```ts
 * import { TelemetryClient } from '@datamoc/mwg/core';
 * import { reportUnderruns } from '@datamoc/mwg/audio';
 *
 * const telemetry = new TelemetryClient({ endpoint: 'https://example.com/api/telemetry' });
 * const reporter = reportUnderruns(telemetry);
 * reporter.stop();
 * ```
 */
export function reportUnderruns(
	sink: UnderrunSink,
	options: UnderrunReportOptions = {},
): { flush(): void; stop(): void } {
	const minIntervalMs = options.minIntervalMs ?? 30000;
	const now = options.now ?? Date.now;
	let count = 0;
	let lateSeconds = 0;
	let source: string | null = null;
	let lastSent = -Infinity;
	const flush = (): void => {
		if (count === 0) return;
		const properties = { count, lateSeconds: Math.round(lateSeconds * 1000) / 1000, source: source ?? 'stream' };
		count = 0;
		lateSeconds = 0;
		source = null;
		lastSent = now();
		//telemetry must never take the game down, whatever the transport does
		sink.send({ name: 'audio_underrun', properties }).catch(() => {});
	};
	const listener = (underrun: { source: string; lateSeconds: number }): void => {
		count++;
		lateSeconds += underrun.lateSeconds;
		source = source === null || source === underrun.source ? underrun.source : 'mixed';
		if (now() - lastSent >= minIntervalMs) flush();
	};
	onAudioUnderrun.add(listener);
	return {
		flush,
		stop() {
			onAudioUnderrun.remove(listener);
			flush();
		},
	};
}
