import { Signal } from '../core/Signal.ts';
import { openWorker, type WorkerLink } from '../threads/spawn.ts';
import type { MidiSynth } from './MidiSynth.ts';
import type { BlockSource } from './StreamChannel.ts';
import { onAudioUnderrun } from './Underrun.ts';

/**
 * A synthesis core: whatever turns timed messages into audio, a `MidiSynth` or an adapter over a
 * chip player. The host runs one off the main thread and the rest of the game sees only a
 * `BlockSource`.
 */
export type AudioCore = MidiSynth;

/** a message for the core at an output frame; `sysex` set makes it a system-exclusive message */
interface CoreEvent {
	frame: number;
	status: number;
	data1: number;
	data2: number;
	sysex?: Uint8Array;
}

/** a channel message with the output frame it is applied at */
type TimedMessage = Pick<CoreEvent, 'frame' | 'status' | 'data1' | 'data2'>;

/** what the main thread says to the runner, whether that is a worker or the inline fallback */
type RunnerMessage =
	| { type: 'events'; events: CoreEvent[] }
	| { type: 'render'; frames: number; epoch: number }
	| { type: 'reset'; frame: number };

/** what the runner answers to a render request */
interface RenderedBlock {
	type: 'block';
	/** the host's epoch when the block was asked for, so a block that was in flight across a reset can be told from a current one */
	epoch: number;
	start: number;
	left: Float32Array;
	right: Float32Array;
	/** milliseconds the core spent on this block */
	renderMs: number;
}

/**
 * The part that touches the core: it holds the core, the events not yet due, and the frame it has
 * rendered up to, and answers a render request with exactly that many frames, applying each event
 * at its own frame inside the block. **Self-contained by construction**, like `workerMain`: the
 * worker gets this function as text, so it may use nothing outside its own body. The inline
 * fallback calls the very same function, which is why the two paths cannot disagree.
 */
function createCoreRunner(factorySource: string, sampleRate: number) {
	const core = (new Function(`return (${factorySource});`)() as (rate: number) => AudioCore)(sampleRate);
	let position = 0;
	let pending: CoreEvent[] = [];
	const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

	const apply = (event: CoreEvent): void => {
		if (event.sysex) core.sysex(event.sysex);
		else core.event(event.status, event.data1, event.data2);
	};

	return {
		handle(message: RunnerMessage): RenderedBlock | null {
			if (message.type === 'events') {
				pending = pending.concat(message.events).sort((a, b) => a.frame - b.frame);
				return null;
			}
			if (message.type === 'reset') {
				core.reset();
				pending = [];
				position = message.frame;
				return null;
			}
			const frames = message.frames;
			const left = new Float32Array(frames);
			const right = new Float32Array(frames);
			const began = now();
			const start = position;
			const end = start + frames;
			let done = 0;
			let used = 0;
			//events already late are applied at the top of the block, in order
			while (used < pending.length && pending[used].frame < end) {
				const at = Math.max(0, pending[used].frame - start);
				if (at > done) {
					core.render(left, right, done, at - done);
					done = at;
				}
				apply(pending[used++]);
			}
			pending = pending.slice(used);
			if (done < frames) core.render(left, right, done, frames - done);
			position = end;
			return { type: 'block', epoch: message.epoch, start, left, right, renderMs: now() - began };
		},
	};
}

/**
 * The worker half: builds the runner when told to, then answers each message. Self-contained for
 * the same reason as `createCoreRunner`, which is passed in because a stringified function cannot
 * reach its sibling. The same body runs under a browser worker and under Node's `worker_threads`.
 */
function coreWorkerMain(buildRunner: typeof createCoreRunner): void {
	const nodePort =
		(
			globalThis as {
				process?: {
					getBuiltinModule?: (id: string) => {
						parentPort: {
							on(event: 'message', listener: (message: unknown) => void): void;
							postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
						} | null;
					};
				};
			}
		).process?.getBuiltinModule?.('node:worker_threads')?.parentPort ?? null;
	const scope = globalThis as unknown as {
		postMessage(message: unknown, transfer?: Transferable[]): void;
		onmessage: ((event: MessageEvent) => void) | null;
	};
	const send = (message: unknown, transfer: ArrayBuffer[] = []): void => {
		if (nodePort) nodePort.postMessage(message, transfer);
		else scope.postMessage(message, transfer);
	};
	let runner: ReturnType<typeof createCoreRunner> | null = null;
	const onMessage = (message: { type: string } & Record<string, unknown>): void => {
		try {
			if (message.type === 'init') {
				runner = buildRunner(message.factory as string, message.sampleRate as number);
				send({ type: 'ready' });
				return;
			}
			const block = runner?.handle(message as unknown as RunnerMessage);
			if (block) send(block, [block.left.buffer as ArrayBuffer, block.right.buffer as ArrayBuffer]);
		} catch (error) {
			send({ type: 'error', message: String((error as { message?: unknown })?.message ?? error) });
		}
	};
	if (nodePort) nodePort.on('message', (message) => onMessage(message as never));
	else scope.onmessage = (event) => onMessage(event.data as never);
}

export interface AudioCoreHostOptions {
	/**
	 * Builds the core for a sample rate. It is shipped to the worker as text, so it must be
	 * self-contained: no closures, no imports, everything it needs inside its own body.
	 */
	factory?: (sampleRate: number) => AudioCore;
	/**
	 * Instead of `factory`: the text of a JavaScript expression that evaluates to the factory, for a
	 * core that cannot be self-contained because it has imports. Bundle the core into one classic
	 * script (an IIFE, with a bundler such as esbuild) whose last expression is the factory, e.g.
	 * `(() => { ...bundled code...; return (rate) => new Core(rate); })()`, and pass that text.
	 */
	factorySource?: string;
	sampleRate: number;
	/** `'auto'` tries a worker and falls back to the main thread; `'inline'` never uses one; `'worker'` fails instead of falling back. `'auto'` when omitted */
	mode?: 'auto' | 'worker' | 'inline';
	/** frames per render request; 1024 when omitted */
	blockFrames?: number;
	/**
	 * whether the host renders ahead as soon as it is made (true when omitted). Turn it off when a
	 * piece is about to be started with `start`: a core that has already rendered a second of
	 * silence is not in the state of a fresh one (a modelled instrument's noise generator keeps its
	 * place through `reset`), so the piece would sound slightly different from a direct render.
	 */
	prefetch?: boolean;
	/** seconds of rendered audio kept ahead of the playhead; 0.3 when omitted, which is also the latency of a message sent now */
	queueSeconds?: number;
}

export interface AudioCoreStats {
	mode: 'worker' | 'inline';
	/** why a worker was not used, when it was not */
	fallbackReason?: string;
	underruns: number;
	/** frames rendered and waiting ahead of the playhead (what a read could still take without an underrun) */
	queuedFrames: number;
	/** render time over audio time, smoothed: 1 means the core uses all of real time */
	load: number;
}

/**
 * Runs a synthesis core on a worker and presents it as an endless `BlockSource`, so a
 * `StreamChannel` plays it like any stream while the render cost stays off the frame. Messages go
 * to the core stamped with an output frame and are applied at that frame; blocks come back
 * transferred, not copied, and wait in a short queue that `read` drains. When the queue runs dry
 * the missing frames are silence, the playhead moves on, and the underrun is counted and reported
 * (`onUnderrun`, `onAudioUnderrun`), so timing never drifts. Where no worker exists, or one dies,
 * the same runner runs on the main thread instead: slower for the frame, identical in sound.
 *
 * @example
 * ```ts
 * import { AudioCoreHost, StreamChannel, type AudioCore } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const host = new AudioCoreHost({
 * 	sampleRate: 44100,
 * 	factory: (rate): AudioCore => ({
 * 		sampleRate: rate,
 * 		event() {},
 * 		sysex() {},
 * 		render() {},
 * 		reset() {},
 * 	}),
 * });
 * new StreamChannel(context).play(host);
 * host.event(0x90, 60, 100);
 * console.log(host.stats().mode);
 * ```
 */
export class AudioCoreHost implements BlockSource {
	readonly sampleRate: number;
	/** fires when a read found the queue short, with the seconds of silence it had to put in */
	readonly onUnderrun = new Signal<number>();

	private readonly factorySource: string;
	private readonly blockFrames: number;
	private readonly queueFrames: number;
	private readonly requested: 'auto' | 'worker' | 'inline';
	private link: WorkerLink | null = null;
	private runner: ReturnType<typeof createCoreRunner> | null = null;
	private mode_: 'worker' | 'inline' = 'inline';
	private fallbackReason: string | undefined;
	//no underrun is reported before the first block has arrived: that wait is start-up latency, not a dropout
	private warm = false;
	/** why the core could not be built on this thread, when it could not */
	private failure: Error | null = null;
	private disposed = false;
	private readFrame = 0;
	private requestedUntil = 0;
	private epoch = 0;
	private blocks: RenderedBlock[] = [];
	private underruns = 0;
	private load = 0;

	constructor(options: AudioCoreHostOptions) {
		if (!(options.sampleRate > 0)) throw new Error('core host sample rate must be positive');
		this.sampleRate = options.sampleRate;
		const source = options.factorySource ?? options.factory?.toString();
		if (!source) throw new Error('core host needs a factory or a factorySource');
		this.factorySource = source;
		this.blockFrames = Math.max(64, Math.floor(options.blockFrames ?? 1024));
		this.queueFrames = Math.max(this.blockFrames, Math.floor((options.queueSeconds ?? 0.3) * options.sampleRate));
		this.requested = options.mode ?? 'auto';
		if (this.requested !== 'inline') this.openWorker();
		if (!this.link) {
			if (this.requested === 'worker') throw new Error(`the core host needs a worker: ${this.fallbackReason}`);
			this.goInline(this.fallbackReason ?? 'inline mode was requested');
			//the first failure of a core that cannot be built at all belongs to the caller
			if (!this.runner && this.failure) throw this.failure;
		}
		if (options.prefetch !== false) this.pump(0);
	}

	/** `'worker'` while the core runs off the main thread, `'inline'` otherwise */
	get mode(): 'worker' | 'inline' {
		return this.mode_;
	}

	stats(): AudioCoreStats {
		return {
			mode: this.mode_,
			...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
			underruns: this.underruns,
			//a block already read, or half read, stays in the list until the next read purges it: count what is ahead only
			queuedFrames: this.blocks.reduce(
				(total, block) =>
					total + Math.max(0, block.start + block.left.length - Math.max(block.start, this.readFrame)),
				0,
			),
			load: this.load,
		};
	}

	/** sends a channel message; applied at `atFrame`, or at the start of the next block to be rendered when omitted */
	event(status: number, data1: number, data2: number, atFrame?: number): void {
		this.send({ frame: atFrame ?? this.requestedUntil, status, data1, data2 });
	}

	/** sends many channel messages in one go, each at its own frame: one post to the worker instead of one per message */
	events(list: readonly TimedMessage[]): void {
		if (list.length > 0) this.post({ type: 'events', events: list.map((event) => ({ ...event })) });
	}

	/**
	 * Starts a piece: silences the core, drops what was rendered ahead, and queues `list` before any
	 * further audio is asked for. A host starts rendering ahead as soon as it exists, so messages sent
	 * afterwards with `events` would reach the core after the audio they belong to was already made and
	 * start late; this orders the reset, the messages and the rendering so they cannot.
	 */
	start(list: readonly TimedMessage[]): void {
		this.discard();
		this.events(list);
		this.pump(0);
	}

	sysex(bytes: Uint8Array, atFrame?: number): void {
		this.send({ frame: atFrame ?? this.requestedUntil, status: 0xf0, data1: 0, data2: 0, sysex: bytes });
	}

	/** silences the core and discards everything rendered ahead of the playhead */
	reset(): void {
		this.discard();
		this.pump(0);
	}

	/** resets the core at the playhead and drops what was rendered ahead of it, including blocks still in flight */
	private discard(): void {
		this.blocks = [];
		this.epoch++;
		this.requestedUntil = this.readFrame;
		this.post({ type: 'reset', frame: this.readFrame });
	}

	/** moves the playhead; a different frame resets the core, the same frame leaves it playing */
	seek(frame: number): void {
		const target = Math.max(0, Math.floor(frame));
		if (target === this.readFrame) return;
		this.readFrame = target;
		this.reset();
	}

	/**
	 * Asks the runner for whatever the queue is missing; called by every read and safe to call
	 * from a timer. A worker keeps `queueSeconds` rendered ahead of the playhead, hiding its
	 * latency from the game; the inline fallback renders just in time instead, since a queue on the
	 * thread that pays for it only moves the cost, and a message then lands on exactly its frame.
	 */
	pump(needed = 0): void {
		if (this.disposed) return;
		const lead = this.mode_ === 'worker' ? Math.max(this.queueFrames, needed) : needed;
		const queuedUntil = this.readFrame + lead;
		while (this.requestedUntil < queuedUntil) {
			this.requestedUntil += this.blockFrames;
			this.post({ type: 'render', frames: this.blockFrames, epoch: this.epoch });
		}
	}

	/** an endless source: fills `count` frames, with silence where the core was late, and always returns `count` */
	read(left: Float32Array, right: Float32Array, start: number, count: number): number {
		this.pump(count);
		const wantedFrom = this.readFrame;
		const wantedTo = wantedFrom + count;
		let filled = 0;
		this.blocks = this.blocks.filter((block) => block.start + block.left.length > wantedFrom);
		for (const block of this.blocks) {
			const from = Math.max(block.start, wantedFrom + filled);
			if (from >= wantedTo) break;
			if (from > wantedFrom + filled) break;
			const offset = from - block.start;
			const take = Math.min(block.left.length - offset, wantedTo - from);
			left.set(block.left.subarray(offset, offset + take), start + filled);
			right.set(block.right.subarray(offset, offset + take), start + filled);
			filled += take;
		}
		if (filled < count) {
			left.fill(0, start + filled, start + count);
			right.fill(0, start + filled, start + count);
			if (this.warm) {
				this.underruns++;
				const lateSeconds = (count - filled) / this.sampleRate;
				this.onUnderrun.dispatch(lateSeconds);
				onAudioUnderrun.dispatch({ source: 'core', lateSeconds });
			}
		}
		this.readFrame = wantedTo;
		this.pump(0);
		return count;
	}

	/** stops the worker and drops what is queued; the host cannot be used afterwards */
	dispose(): void {
		this.disposed = true;
		this.link?.terminate();
		this.link = null;
		this.blocks = [];
	}

	private openWorker(): void {
		const source =
			`const createCoreRunner = ${createCoreRunner.toString()};` +
			`(${coreWorkerMain.toString()})(createCoreRunner);`;
		try {
			this.link = openWorker(source, {
				message: (data) => this.onWorkerMessage(data as { type: string } & Record<string, unknown>),
				fail: (error) => {
					if (this.disposed) return;
					this.link?.terminate();
					this.link = null;
					this.goInline(error.message);
				},
			});
		} catch (error) {
			this.link = null;
			this.fallbackReason = error instanceof Error ? error.message : String(error);
			return;
		}
		if (!this.link) {
			this.fallbackReason = 'no Web Worker or worker_threads here';
			return;
		}
		this.mode_ = 'worker';
		this.link.post({ type: 'init', factory: this.factorySource, sampleRate: this.sampleRate });
	}

	private goInline(reason: string): void {
		this.mode_ = 'inline';
		this.fallbackReason = reason;
		try {
			this.runner = createCoreRunner(this.factorySource, this.sampleRate);
		} catch (error) {
			//a core that fails to build anywhere leaves the host silent rather than throwing from a worker callback
			this.runner = null;
			this.failure = error instanceof Error ? error : new Error(String(error));
			this.fallbackReason = `${reason}; the core also failed here: ${this.failure.message}`;
			return;
		}
		//whatever the dead worker had not delivered is rendered again, from the playhead
		this.blocks = [];
		this.runner.handle({ type: 'reset', frame: this.readFrame });
		this.requestedUntil = this.readFrame;
	}

	private onWorkerMessage(message: { type: string } & Record<string, unknown>): void {
		if (message.type === 'ready') return;
		if (message.type === 'error') {
			this.link?.terminate();
			this.link = null;
			this.goInline(String(message.message));
			return;
		}
		if (message.type === 'block') {
			const block = message as unknown as RenderedBlock;
			//a block asked for before the last reset belongs to audio that was thrown away
			if (block.epoch !== this.epoch) return;
			this.noteLoad(block);
			this.blocks.push(block);
			this.warm = true;
		}
	}

	private noteLoad(block: RenderedBlock): void {
		const audioMs = (block.left.length / this.sampleRate) * 1000;
		const ratio = block.renderMs / audioMs;
		this.load = this.load === 0 ? ratio : this.load * 0.9 + ratio * 0.1;
	}

	private send(event: CoreEvent): void {
		this.post({ type: 'events', events: [event] });
	}

	private post(message: RunnerMessage): void {
		if (this.disposed) return;
		if (this.mode_ === 'worker' && this.link) {
			this.link.post(message, []);
			return;
		}
		const block = this.runner?.handle(message);
		if (block) {
			this.noteLoad(block);
			this.blocks.push(block);
			this.warm = true;
		}
	}
}
