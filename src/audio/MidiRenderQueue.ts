import type { MidiFile } from './Midi.ts';
import { renderMidiToBufferAsync, type RenderMidiAsyncOptions, type RenderedMidi } from './MidiRender.ts';
import { INTERNAL_MIDI_ENGINES, midiSynthNames, midiSynthWorkerFactory, synthChoices } from './MidiSynth.ts';

export interface MidiRenderQueueOptions {
	/** schedules a short launch callback and returns its cancellation function; must defer the callback; defaults to requestIdleCallback, or a timer where unavailable */
	schedule?: (start: () => void) => () => void;
	/**
	 * longest wait for idle time before a launch proceeds anyway, in milliseconds, so a busy or
	 * background page cannot starve a preparation forever; only the default scheduler uses it
	 * (a custom `schedule` owns its own bound). 1000 when omitted
	 */
	idleTimeoutMs?: number;
}

interface PendingRender {
	input: ArrayBuffer | ArrayBufferView | MidiFile;
	options: RenderMidiAsyncOptions;
	controller: AbortController;
	resolve: (rendered: RenderedMidi) => void;
	reject: (reason: unknown) => void;
	cleanup: () => void;
}

const DEFAULT_IDLE_TIMEOUT_MS = 1000;

function scheduleIdle(start: () => void, idleTimeoutMs: number): () => void {
	if (typeof requestIdleCallback === 'function') {
		const id = requestIdleCallback(start, { timeout: idleTimeoutMs });
		return () => cancelIdleCallback(id);
	}
	const timer = setTimeout(start, 0);
	return () => clearTimeout(timer);
}

/** Rechecked at launch because a game may replace a registered engine while work waits. */
function assertWorkerSynth(options: RenderMidiAsyncOptions): void {
	const choices = synthChoices(options.synth);
	for (const choice of choices) {
		if (typeof choice === 'string' && INTERNAL_MIDI_ENGINES.includes(choice)) break;
		if (typeof choice === 'function' || (midiSynthNames().includes(choice) && !midiSynthWorkerFactory(choice))) {
			throw new Error('background MIDI rendering requires a named synth with a worker factory');
		}
	}
}

/**
 * Prepares upcoming tracks or game-authored MIDI notes in FIFO order, one worker at a time.
 * Each launch waits for browser idle time, bounded by `idleTimeoutMs` so a busy page cannot
 * starve it forever; where requestIdleCallback is absent it yields to a timer. This is
 * cooperative launch scheduling, not an operating-system worker priority.
 * Hold the returned promise or PCM until playback needs it; the queue keeps no PCM cache.
 * Named synths must have a worker factory; bare factories are refused to keep synthesis off
 * the game's thread. Pause stops new launches; dispose also cancels active work.
 * Do not mutate input or SoundFont bytes until the preparation settles.
 *
 * @example
 * ```ts
 * import { MidiRenderQueue, MusicPlayer, type MidiFile } from '@datamoc/mwg/audio';
 * declare const player: MusicPlayer;
 * const notes: MidiFile = {
 *   ticksPerQuarter: 96, loopStartTick: null,
 *   events: [
 *     { tick: 0, type: 'noteOn', channel: 0, note: 60, velocity: 96 },
 *     { tick: 96, type: 'noteOff', channel: 0, note: 60, velocity: 0 },
 *   ],
 * };
 * const queue = new MidiRenderQueue();
 * const prepared = queue.prepare(notes, { synth: 'builtin' });
 * // Later, when the game needs this phrase:
 * player.load(await prepared);
 * player.play();
 * queue.dispose();
 * ```
 */
export class MidiRenderQueue {
	private readonly schedule: (start: () => void) => () => void;
	private readonly pending: PendingRender[] = [];
	private active: PendingRender | null = null;
	private cancelLaunch: (() => void) | null = null;
	private paused = false;
	private disposed = false;

	constructor(options: MidiRenderQueueOptions = {}) {
		const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0)
			throw new Error('MIDI render queue idle timeout must be positive');
		this.schedule = options.schedule ?? ((start) => scheduleIdle(start, idleTimeoutMs));
	}

	/** Enqueues a track or note sequence; signal cancels either a queued or an active render. */
	prepare(
		input: ArrayBuffer | ArrayBufferView | MidiFile,
		options: RenderMidiAsyncOptions = {},
	): Promise<RenderedMidi> {
		return new Promise((resolve, reject) => {
			if (this.disposed) throw new Error('MIDI render queue is disposed');
			options.signal?.throwIfAborted();
			assertWorkerSynth(options);
			const controller = new AbortController();
			const cancel = (): void => controller.abort(options.signal?.reason);
			const job: PendingRender = {
				input,
				options,
				controller,
				resolve,
				reject,
				cleanup: () => {
					options.signal?.removeEventListener('abort', cancel);
					controller.signal.removeEventListener('abort', onAbort);
				},
			};
			const onAbort = (): void => {
				const index = this.pending.indexOf(job);
				if (index < 0) return;
				this.pending.splice(index, 1);
				job.cleanup();
				reject(controller.signal.reason);
				if (!this.pending.length) this.cancelScheduledLaunch();
			};
			options.signal?.addEventListener('abort', cancel, { once: true });
			controller.signal.addEventListener('abort', onAbort, { once: true });
			this.pending.push(job);
			this.launchNext();
		});
	}

	/** Stops new launches; an already active worker is allowed to finish. */
	pause(): void {
		this.paused = true;
		this.cancelScheduledLaunch();
	}

	/** Resumes preparing queued tracks at idle time. */
	resume(): void {
		if (this.disposed) return;
		this.paused = false;
		this.launchNext();
	}

	/** Cancels queued and active preparations and refuses subsequent work. */
	dispose(): void {
		this.disposed = true;
		this.pause();
		for (const job of [...this.pending]) job.controller.abort();
		this.active?.controller.abort();
	}

	/** withdraws the scheduled idle launch, if one is still waiting */
	private cancelScheduledLaunch(): void {
		this.cancelLaunch?.();
		this.cancelLaunch = null;
	}

	private launchNext(): void {
		if (this.paused || this.disposed || this.active || this.cancelLaunch || !this.pending.length) return;
		this.cancelLaunch = this.schedule(async () => {
			this.cancelLaunch = null;
			const job = this.pending.shift()!;
			this.active = job;
			try {
				assertWorkerSynth(job.options);
				job.resolve(
					await renderMidiToBufferAsync(job.input, { ...job.options, signal: job.controller.signal }),
				);
			} catch (error) {
				job.reject(error);
			} finally {
				job.cleanup();
				this.active = null;
				this.launchNext();
			}
		});
	}
}
