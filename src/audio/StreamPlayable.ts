import { StreamChannel, type BlockSource, type StreamChannelOptions } from './StreamChannel.ts';
import type { LoopRegion } from './Channels.ts';
import type { Playable } from './Playable.ts';

export interface StreamPlayableOptions {
	destination?: AudioNode;
	/** forwarded to the underlying `StreamChannel` */
	channel?: StreamChannelOptions;
	/** repeat region in seconds while `loop` is true; the whole source when omitted */
	loopRegion?: LoopRegion | null;
	/** stop an endless source after this many seconds, fading the last `endFadeSeconds`; never when omitted */
	endAfterSeconds?: number;
	endFadeSeconds?: number;
}

/**
 * A `BlockSource` behind the `Playable` surface, so `Music` and `Orchestrator` can play a
 * synthesised stream without knowing it is one. The behaviours `HTMLAudioElement` leaves
 * implicit, decided here once:
 *
 * - `currentTime` reads the playhead and moves it by seeking the source; while a source loops it
 *   stays inside the loop region, and once a source that does not loop has ended it holds the
 *   duration. An endless source reports `Infinity` for `duration`.
 * - `playbackRate` is supported by resampling: speed and pitch change together, from the next
 *   queued chunk (up to the lookahead later).
 * - `onended` fires once when a source that does not loop plays out or an endless source reaches
 *   `endAfterSeconds`; a looping source never fires it.
 * - the source's own sample rate is converted to the context's, so the caller never creates a
 *   context at a particular rate.
 * - `play()` resumes a suspended context first, which a browser only allows after a gesture.
 *
 * @example
 * ```ts
 * import { StreamPlayable, type BlockSource } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const tune: BlockSource;
 *
 * const stream = new StreamPlayable(context, tune);
 * stream.loop = true;
 * stream.volume = 0.7;
 * void stream.play();
 * ```
 */
export class StreamPlayable implements Playable {
	onended: ((event: Event) => unknown) | null = null;
	/** the underlying voice, for underrun reports and the other things `Playable` has no word for */
	readonly channel: StreamChannel;

	private readonly context: AudioContext;
	private readonly source: BlockSource;
	private readonly options: StreamPlayableOptions;
	private volume_ = 1;
	private loop_ = false;
	private rate_ = 1;
	private position_ = 0;
	private paused_ = true;
	private ended_ = false;

	constructor(context: AudioContext, source: BlockSource, options: StreamPlayableOptions = {}) {
		this.context = context;
		this.source = source;
		this.options = options;
		this.channel = new StreamChannel(context, options.destination, options.channel);
		this.channel.onEnded.add(() => {
			this.ended_ = true;
			this.paused_ = true;
			this.position_ = this.duration;
			if (this.onended) this.onended(typeof Event === 'function' ? new Event('ended') : ({} as Event));
		});
	}

	/** seconds of the source, Infinity when it has no end */
	get duration(): number {
		return this.source.length === undefined ? Infinity : this.source.length / this.source.sampleRate;
	}

	get paused(): boolean {
		return this.paused_;
	}

	get ended(): boolean {
		return this.ended_;
	}

	get currentTime(): number {
		if (this.ended_) return Number.isFinite(this.duration) ? this.duration : this.position_;
		return this.channel.isPlaying ? this.channel.position() : this.position_;
	}

	set currentTime(seconds: number) {
		const target = Math.max(0, Number(seconds) || 0);
		this.ended_ = false;
		if (this.channel.isPlaying) this.channel.seek(target);
		else this.position_ = target;
	}

	get volume(): number {
		return this.volume_;
	}

	set volume(level: number) {
		this.volume_ = Math.min(1, Math.max(0, level));
		this.channel.update({ volume: this.volume_ });
	}

	get loop(): boolean {
		return this.loop_;
	}

	set loop(value: boolean) {
		if (value === this.loop_) return;
		this.loop_ = value;
		//the repeat mode is fixed when a stream starts, so a playing one restarts where it is
		if (this.channel.isPlaying) this.start(this.channel.position());
	}

	get playbackRate(): number {
		return this.rate_;
	}

	set playbackRate(rate: number) {
		if (!(rate > 0)) return;
		this.rate_ = rate;
		this.channel.update({ pitch: rate });
	}

	async play(): Promise<void> {
		if (this.context.state === 'suspended') await this.context.resume();
		if (this.ended_) this.position_ = 0;
		this.ended_ = false;
		this.paused_ = false;
		this.start(this.position_);
	}

	pause(): void {
		if (this.paused_) return;
		this.position_ = this.channel.isPlaying ? this.channel.position() : this.position_;
		this.paused_ = true;
		this.channel.stop();
	}

	private start(seconds: number): void {
		this.channel.play(this.source, {
			volume: this.volume_,
			pitch: this.rate_,
			pos: seconds,
			repeat: this.loop_,
			loop: this.options.loopRegion,
			endAfterSeconds: this.options.endAfterSeconds,
			endFadeSeconds: this.options.endFadeSeconds,
		});
	}
}
