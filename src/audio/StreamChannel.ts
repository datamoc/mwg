import { Signal } from '../core/Signal.ts';
import type { LoopRegion } from './Channels.ts';
import { onAudioUnderrun } from './Underrun.ts';

/**
 * Audio that is produced as it is played instead of decoded up front: a tracker, a chip
 * player, a synthesiser. The consumer pulls frames in order; it can also ask for a different
 * position, which a stateful source answers by skipping or rewinding as it can.
 */
export interface BlockSource {
	readonly sampleRate: number;
	/** total frames, or undefined for a source with no end (a chip tune that never finishes) */
	readonly length?: number;
	/** writes up to `count` frames at `start` of both buffers and returns how many it wrote; fewer than asked means the source ended */
	read(left: Float32Array, right: Float32Array, start: number, count: number): number;
	/** makes the next `read` return frames from this position */
	seek(frame: number): void;
}

export interface StreamChannelOptions {
	/** seconds of audio per scheduled chunk; 0.5 when omitted */
	chunkSeconds?: number;
	/** how far ahead of the clock chunks are queued; 2 seconds when omitted, enough to ride out a throttled background timer */
	lookaheadSeconds?: number;
	/** milliseconds between self-driven pumps; 100 when omitted, 0 to turn the timer off and call `update()` yourself */
	pumpMs?: number;
	/** replaces `setTimeout` for the pump, so a test drives time by hand */
	schedule?: (callback: () => void, ms: number) => unknown;
	/** cancels what `schedule` returned; `clearTimeout` when omitted */
	unschedule?: (handle: unknown) => void;
}

export interface StreamPlayOptions {
	/** level, 0 to 1 */
	volume?: number;
	/** playback ratio, 1 unchanged: speed and pitch together, resampled linearly */
	pitch?: number;
	/** stereo position, -1 (left) to 1 (right) */
	pan?: number;
	/** start offset in seconds */
	pos?: number;
	/** true repeats through `loop`, or the whole source when it has a length; false plays once */
	repeat?: boolean;
	/** seconds the repeat jumps back to and wraps from; the whole source when omitted */
	loop?: LoopRegion | null;
	/** stop after this many seconds played, for a source with no end; unlimited when omitted */
	endAfterSeconds?: number;
	/** seconds of fade ahead of `endAfterSeconds`'s end; 2 when omitted */
	endFadeSeconds?: number;
}

/** a chunk scheduled on the context, enough to say where the playhead is while it sounds */
interface Chunk {
	source: AudioBufferSourceNode;
	when: number;
	seconds: number;
	/** source frame the chunk's first output frame came from */
	timeline: number;
}

const BLOCK_FRAMES = 2048;

/**
 * The streaming twin of `Channel`: it queues short buffers on the audio clock ahead of the
 * playhead from a `BlockSource` instead of owning one decoded buffer, so a long or endless
 * track costs a couple of seconds of memory rather than the whole render. It loops on a
 * region, seeks, retunes volume, pitch and pan, fades an endless source out after a limit, and
 * reports `onUnderrun` when the clock got ahead of what was queued.
 *
 * Chunks are queued by a timer it runs itself (`pumpMs`), so a game that never calls `update()`
 * still hears sound; a timer throttled in a background tab is the reason the lookahead is two
 * seconds. A pitch change applies from the next chunk, up to the lookahead later.
 *
 * @example
 * ```ts
 * import { StreamChannel, type BlockSource } from '@datamoc/mw_games/audio';
 *
 * declare const context: AudioContext;
 * declare const tune: BlockSource;
 *
 * const channel = new StreamChannel(context);
 * channel.onEnded.add(() => console.log('done'));
 * channel.play(tune, { repeat: false, volume: 0.8 });
 * console.log(channel.position());
 * channel.stop(1);
 * ```
 */
export class StreamChannel {
	/** fires once when a source that does not repeat has played out, or an endless one reached its limit */
	readonly onEnded = new Signal<void>();
	/** fires when the clock passed the end of the queue before the next chunk was ready, with how late it was in seconds */
	readonly onUnderrun = new Signal<number>();
	/** fires when the source threw while being read: the voice stops instead of letting the error escape from a timer */
	readonly onError = new Signal<Error>();

	private readonly context: AudioContext;
	private readonly destination: AudioNode;
	private readonly chunkSeconds: number;
	private readonly lookahead: number;
	private readonly pumpMs: number;
	private readonly schedule: (callback: () => void, ms: number) => unknown;
	private readonly unschedule: (handle: unknown) => void;
	private timer: unknown = null;

	private source: BlockSource | null = null;
	private gainNode: GainNode | null = null;
	private pannerNode: StereoPannerNode | null = null;
	private params = { volume: 1, pitch: 1, pan: 0 };
	private repeat = false;
	private loopStart = 0;
	private loopEnd: number | null = null;
	private endAfterFrames = Infinity;
	private endFadeFrames = 0;

	private chunks: Chunk[] = [];
	private nextWhen = 0;
	private active = false;
	private drained = false;
	private lastTimeline = 0;
	private outputFrames = 0;
	private underruns = 0;

	//Source frames read but not yet consumed, with the fractional playhead inside them.
	private pendingLeft = new Float32Array(BLOCK_FRAMES * 4);
	private pendingRight = new Float32Array(BLOCK_FRAMES * 4);
	private pendingLength = 0;
	private cursor = 0;
	private readFrame = 0;
	private timeline = 0;
	private sourceEnded = false;

	constructor(context: AudioContext, destination?: AudioNode, options: StreamChannelOptions = {}) {
		this.context = context;
		this.destination = destination ?? context.destination;
		this.chunkSeconds = options.chunkSeconds ?? 0.5;
		this.lookahead = options.lookaheadSeconds ?? 2;
		this.pumpMs = options.pumpMs ?? 100;
		this.schedule =
			options.schedule ??
			((callback, ms) => {
				const handle = setTimeout(callback, ms);
				//a pump must never be what keeps a Node process (a test, a build tool) alive
				(handle as { unref?: () => void }).unref?.();
				return handle;
			});
		this.unschedule = options.unschedule ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	}

	get isPlaying(): boolean {
		return this.active;
	}

	/** how many times the queue ran dry since the channel was made */
	get underrunCount(): number {
		return this.underruns;
	}

	/** seconds of the source, or Infinity when it has no end */
	get duration(): number {
		return this.source?.length === undefined ? Infinity : this.source.length / this.source.sampleRate;
	}

	/** starts the source with these parameters, stopping whatever played before */
	play(source: BlockSource, options: StreamPlayOptions = {}): void {
		this.stop();
		this.source = source;
		this.params = { volume: options.volume ?? 1, pitch: options.pitch ?? 1, pan: options.pan ?? 0 };
		if (!(this.params.pitch > 0)) throw new Error('stream pitch must be positive');
		this.repeat = options.repeat ?? false;
		const rate = source.sampleRate;
		const length = source.length;
		this.loopStart = Math.max(0, Math.floor((options.loop?.start ?? 0) * rate));
		this.loopEnd = options.loop ? Math.floor(options.loop.end * rate) : (length ?? null);
		if (this.loopEnd !== null && this.loopEnd <= this.loopStart) this.loopEnd = null;
		this.endAfterFrames =
			options.endAfterSeconds === undefined
				? Infinity
				: Math.floor(options.endAfterSeconds * this.context.sampleRate);
		this.endFadeFrames = Math.floor((options.endFadeSeconds ?? 2) * this.context.sampleRate);
		this.wire();
		this.begin(Math.max(0, Math.floor((options.pos ?? 0) * rate)));
		this.active = true;
		this.pump();
	}

	/** retunes the playing voice in place: no restart, no seek */
	update(params: { volume?: number; pitch?: number; pan?: number } = {}): void {
		if (params.volume !== undefined) this.params.volume = params.volume;
		if (params.pitch !== undefined) {
			if (!(params.pitch > 0)) throw new Error('stream pitch must be positive');
			this.params.pitch = params.pitch;
		}
		if (params.pan !== undefined) this.params.pan = params.pan;
		if (this.gainNode) this.gainNode.gain.setTargetAtTime(this.params.volume, this.context.currentTime, 0.02);
		if (this.pannerNode) this.pannerNode.pan.value = this.params.pan;
		if (this.active) this.pump();
	}

	/** stops the voice, fading out over `fadeSeconds` first when positive; the playhead is remembered for a later `play` with the same `pos` */
	stop(fadeSeconds = 0): void {
		const hadVoice = this.active || this.chunks.length > 0;
		if (hadVoice && this.source) this.lastTimeline = this.positionFrames();
		const gain = this.gainNode;
		const chunks = this.chunks;
		const now = this.context.currentTime;
		this.cancelTimer();
		this.active = false;
		this.chunks = [];
		this.gainNode = null;
		this.pannerNode = null;
		if (!hadVoice) return;
		const fading = fadeSeconds > 0 && gain;
		if (fading) {
			gain.gain.cancelScheduledValues(now);
			gain.gain.setValueAtTime(gain.gain.value, now);
			gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
		}
		for (const chunk of chunks) {
			chunk.source.onended = null;
			try {
				chunk.source.stop(fading ? now + fadeSeconds + 0.02 : undefined);
			} catch {
				//already stopped
			}
		}
	}

	/** seconds into the source, wrapping inside the loop region while it repeats */
	position(): number {
		return this.source ? this.positionFrames() / this.source.sampleRate : 0;
	}

	/** the playhead as a source frame, the exact unit a save stores and a restore skips to */
	positionFrames(): number {
		const source = this.source;
		if (!source) return 0;
		const now = this.context.currentTime;
		let current: Chunk | undefined;
		for (const chunk of this.chunks) if (chunk.when <= now) current = chunk;
		if (!current) return Math.floor(this.timelineAt(this.chunks[0]?.timeline ?? this.lastTimeline));
		const ratio = (this.params.pitch * source.sampleRate) / this.context.sampleRate;
		const elapsed = Math.min(now - current.when, current.seconds) * this.context.sampleRate * ratio;
		return Math.floor(this.timelineAt(current.timeline + elapsed));
	}

	/** moves the playhead, restarting the queue from there */
	seek(seconds: number): void {
		const source = this.source;
		if (!source) return;
		const wasActive = this.active;
		this.stop();
		this.begin(Math.max(0, Math.floor(seconds * source.sampleRate)));
		if (wasActive) {
			this.wire();
			this.active = true;
			this.pump();
		}
	}

	/** queues whatever chunks the lookahead allows; called by the timer and safe to call each frame */
	pump(): void {
		if (!this.active || !this.source || !this.gainNode) return;
		const now = this.context.currentTime;
		this.chunks = this.chunks.filter((chunk) => chunk.when + chunk.seconds >= now - 0.5);
		if (this.nextWhen < now) {
			if (this.chunks.length > 0 || this.outputFrames > 0) {
				this.underruns++;
				this.onUnderrun.dispatch(now - this.nextWhen);
				onAudioUnderrun.dispatch({ source: 'stream', lateSeconds: now - this.nextWhen });
			}
			this.nextWhen = now + 0.02;
		}
		try {
			while (!this.drained && this.nextWhen < now + this.lookahead) this.queueChunk();
		} catch (error) {
			this.stop();
			this.onError.dispatch(error instanceof Error ? error : new Error(String(error)));
			return;
		}
		if (this.active && !this.drained && this.pumpMs > 0 && this.timer === null) {
			this.timer = this.schedule(() => {
				this.timer = null;
				this.pump();
			}, this.pumpMs);
		}
	}

	private wire(): void {
		const gain = this.context.createGain();
		gain.gain.value = this.params.volume;
		if (typeof this.context.createStereoPanner === 'function') {
			const panner = this.context.createStereoPanner();
			panner.pan.value = this.params.pan;
			gain.connect(panner);
			panner.connect(this.destination);
			this.pannerNode = panner;
		} else {
			gain.connect(this.destination);
		}
		this.gainNode = gain;
	}

	private cancelTimer(): void {
		if (this.timer !== null) this.unschedule(this.timer);
		this.timer = null;
	}

	private begin(frame: number): void {
		this.source?.seek(frame);
		this.readFrame = frame;
		this.timeline = frame;
		this.lastTimeline = frame;
		this.pendingLength = 0;
		this.cursor = 0;
		this.sourceEnded = false;
		this.drained = false;
		this.outputFrames = 0;
		this.nextWhen = this.context.currentTime + 0.02;
	}

	/** a position inside the loop region while repeating, else as given */
	private timelineAt(frame: number): number {
		if (this.repeat && this.loopEnd !== null && frame >= this.loopEnd) {
			return this.loopStart + ((frame - this.loopStart) % (this.loopEnd - this.loopStart));
		}
		return frame;
	}

	private queueChunk(): void {
		const rate = this.context.sampleRate;
		const wanted = Math.max(1, Math.ceil(this.chunkSeconds * rate));
		const left = new Float32Array(wanted);
		const right = new Float32Array(wanted);
		const startTimeline = this.timeline;
		const produced = this.fill(left, right, wanted);
		if (produced === 0) {
			this.finish(null);
			return;
		}
		const buffer = this.context.createBuffer(2, produced, rate);
		buffer.getChannelData(0).set(left.subarray(0, produced));
		buffer.getChannelData(1).set(right.subarray(0, produced));
		const node = this.context.createBufferSource();
		node.buffer = buffer;
		node.connect(this.gainNode!);
		const when = this.nextWhen;
		const seconds = produced / rate;
		node.start(when);
		this.chunks.push({ source: node, when, seconds, timeline: startTimeline });
		this.nextWhen = when + seconds;
		if (produced < wanted) this.finish(node);
	}

	/** marks the stream as fully queued; the ending fires when the last chunk has sounded */
	private finish(last: AudioBufferSourceNode | null): void {
		this.drained = true;
		this.cancelTimer();
		const lastNode = last ?? this.chunks.at(-1)?.source ?? null;
		const done = (): void => {
			if (!this.active) return;
			this.active = false;
			this.chunks = [];
			this.lastTimeline = this.timeline;
			this.onEnded.dispatch();
		};
		const tailChunk = this.chunks.at(-1);
		//a chunk that already sounded out will not fire `onended` again, so end now
		if (lastNode && tailChunk && tailChunk.when + tailChunk.seconds > this.context.currentTime)
			lastNode.onended = done;
		else done();
	}

	/** resamples source frames into the two output arrays; returns how many it wrote */
	private fill(left: Float32Array, right: Float32Array, count: number): number {
		const source = this.source!;
		const step = (this.params.pitch * source.sampleRate) / this.context.sampleRate;
		let produced = 0;
		while (produced < count) {
			if (this.outputFrames >= this.endAfterFrames + this.endFadeFrames) {
				this.sourceEnded = true;
				break;
			}
			const index = Math.floor(this.cursor);
			if (index + 1 >= this.pendingLength && !this.sourceEnded) {
				this.readMore();
				continue;
			}
			if (index >= this.pendingLength) break;
			const next = Math.min(index + 1, this.pendingLength - 1);
			const fraction = this.cursor - index;
			let l = this.pendingLeft[index] + (this.pendingLeft[next] - this.pendingLeft[index]) * fraction;
			let r = this.pendingRight[index] + (this.pendingRight[next] - this.pendingRight[index]) * fraction;
			if (this.outputFrames >= this.endAfterFrames) {
				const gain = 1 - (this.outputFrames - this.endAfterFrames) / Math.max(1, this.endFadeFrames);
				l *= gain;
				r *= gain;
			}
			left[produced] = l;
			right[produced] = r;
			produced++;
			this.outputFrames++;
			this.cursor += step;
			this.timeline += step;
			if (this.repeat && this.loopEnd !== null && this.timeline >= this.loopEnd) {
				this.timeline = this.loopStart + (this.timeline - this.loopEnd);
			}
		}
		this.compact();
		return produced;
	}

	/** appends the next block of source frames, wrapping to the loop start at its end */
	private readMore(): void {
		const source = this.source!;
		let want = BLOCK_FRAMES;
		if (this.repeat && this.loopEnd !== null) {
			if (this.readFrame >= this.loopEnd) {
				source.seek(this.loopStart);
				this.readFrame = this.loopStart;
			}
			want = Math.min(want, this.loopEnd - this.readFrame);
		}
		this.ensureCapacity(this.pendingLength + want);
		const got = source.read(this.pendingLeft, this.pendingRight, this.pendingLength, want);
		this.pendingLength += got;
		this.readFrame += got;
		if (got < want && !(this.repeat && this.loopEnd !== null)) this.sourceEnded = true;
		if (got === 0 && this.repeat && this.loopEnd !== null && this.readFrame < this.loopEnd) this.sourceEnded = true;
	}

	private ensureCapacity(frames: number): void {
		if (frames <= this.pendingLeft.length) return;
		const size = Math.max(frames, this.pendingLeft.length * 2);
		const left = new Float32Array(size);
		const right = new Float32Array(size);
		left.set(this.pendingLeft.subarray(0, this.pendingLength));
		right.set(this.pendingRight.subarray(0, this.pendingLength));
		this.pendingLeft = left;
		this.pendingRight = right;
	}

	/** drops consumed frames so the buffer does not grow with the length of the track */
	private compact(): void {
		const drop = Math.floor(this.cursor);
		if (drop < BLOCK_FRAMES) return;
		this.pendingLeft.copyWithin(0, drop, this.pendingLength);
		this.pendingRight.copyWithin(0, drop, this.pendingLength);
		this.pendingLength -= drop;
		this.cursor -= drop;
	}
}
