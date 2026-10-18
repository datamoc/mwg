import { Signal } from '../core/Signal.ts';
import { Channel } from './Channels.ts';
import { toAudioBuffer, type RenderedMidi } from './MidiRender.ts';

export interface MusicPlayerOptions {
	/** level, 0 to 1; 1 when omitted */
	volume?: number;
	/** where the sound goes; the context's destination when omitted (pass a gain or compressor to shape it) */
	destination?: AudioNode;
}

export interface MusicPlayOptions {
	/** start offset in seconds */
	pos?: number;
	/** true repeats the track through its loop region instead of ending; false when omitted */
	repeat?: boolean;
}

/**
 * One music track at a time with the controls a game's jukebox needs: load a decoded track or a
 * rendered MIDI file, play, pause, resume, read the position, seek, and be told when the track
 * ends so the game can pick the next one. It wraps a `Channel`, so the buffer, the loop region
 * and the playhead behave as they do there; what it adds is the paused state and the end of the
 * track. Like `Music`, nothing advances on its own: call `update()` each frame.
 *
 * @example
 * ```ts
 * import { MusicPlayer, renderMidiToBufferAsync } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const midiBytes: ArrayBuffer;
 * declare function nextTrack(): Promise<ArrayBuffer>;
 *
 * const player = new MusicPlayer(context, { volume: 0.8 });
 * player.load(await renderMidiToBufferAsync(midiBytes));
 * player.play();
 * async function playNext(): Promise<void> {
 * 	player.load(await renderMidiToBufferAsync(await nextTrack()));
 * 	player.play();
 * }
 * player.onEnded.add(() => { void playNext(); });
 *
 * // in the scene's update:
 * player.update();
 * ```
 */
export class MusicPlayer {
	/** fires once when a track that was not repeating plays through to its end */
	readonly onEnded = new Signal<void>();
	private readonly context: BaseAudioContext;
	private readonly channel: Channel;
	private buffer: AudioBuffer | null = null;
	private loop: { start: number; end: number } | null = null;
	private repeat = false;
	private playing = false;
	private paused = false;
	private resumeAt = 0;
	private volume_: number;

	constructor(context: AudioContext, options: MusicPlayerOptions = {}) {
		this.context = context;
		this.channel = new Channel(context, options.destination);
		this.volume_ = Math.min(1, Math.max(0, options.volume ?? 1));
	}

	/** stops what plays and makes this track the one to play; a rendered MIDI file is copied into a buffer first */
	load(track: RenderedMidi | AudioBuffer): void {
		this.stop();
		if ('left' in track) {
			this.buffer = toAudioBuffer(this.context, track);
			this.loop = { start: track.loopStart, end: track.loopEnd };
		} else {
			this.buffer = track;
			this.loop = null;
		}
	}

	/** plays the loaded track from the start, or from `pos` */
	play(options: MusicPlayOptions = {}): void {
		if (!this.buffer) return;
		this.repeat = options.repeat ?? false;
		this.paused = false;
		this.playing = true;
		this.resumeAt = options.pos ?? 0;
		this.start();
	}

	pause(): void {
		if (!this.playing || this.paused) return;
		this.resumeAt = this.channel.position();
		this.paused = true;
		this.channel.stop();
	}

	resume(): void {
		if (!this.paused || !this.buffer) return;
		this.paused = false;
		this.start();
	}

	/** pauses a playing track and resumes a paused one */
	togglePause(): void {
		if (this.paused) this.resume();
		else this.pause();
	}

	/** stops and forgets the position; `play()` starts over */
	stop(): void {
		this.channel.stop();
		this.playing = false;
		this.paused = false;
		this.resumeAt = 0;
	}

	get isPlaying(): boolean {
		return this.playing && !this.paused;
	}

	get isPaused(): boolean {
		return this.paused;
	}

	/** seconds of the loaded track */
	get duration(): number {
		return this.buffer?.duration ?? 0;
	}

	/** seconds into the track, held while paused */
	position(): number {
		if (!this.playing) return 0;
		return this.paused ? this.resumeAt : this.channel.position();
	}

	/** moves the playhead, keeping a paused track paused */
	seek(pos: number): void {
		if (!this.buffer) return;
		const target = Math.min(Math.max(0, pos), this.buffer.duration);
		if (this.paused) this.resumeAt = target;
		else if (this.playing) this.play({ pos: target, repeat: this.repeat });
	}

	get volume(): number {
		return this.volume_;
	}

	set volume(level: number) {
		this.volume_ = Math.min(1, Math.max(0, level));
		this.channel.update({ volume: this.volume_ });
	}

	/** call each frame: fires `onEnded` once when a non-repeating track has finished */
	update(): void {
		if (!this.playing || this.paused || this.channel.isPlaying) return;
		this.playing = false;
		this.resumeAt = 0;
		this.onEnded.dispatch();
	}

	private start(): void {
		if (!this.buffer) return;
		this.channel.play(this.buffer, {
			volume: this.volume_,
			pos: this.resumeAt,
			loop: this.loop,
			repeat: this.repeat,
		});
	}
}
