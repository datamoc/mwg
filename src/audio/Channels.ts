/**
 * Buffered WebAudio voices for music and jingles: a `Channel` plays one looping track
 * with volume, pitch, pan, a loop region and a seekable playhead, and an `AudioBus`
 * wires channels into the four lifetimes a role-playing game needs from its audio.
 * BGM and BGS are two independent looping streams, ME is an interrupting jingle that
 * pauses the BGM and resumes it where it left off, SE is overlapping one-shots, each
 * with its own volume, pitch and pan per play.
 *
 * The browser owns the clock and the nodes, so both classes take the pieces they
 * cannot build themselves as injectables: the `AudioContext` in the constructor and,
 * for the bus, a `load` function turning a kind and a name into a decoded buffer.
 * Tests hand in fakes for both, the same way `Sound` and `Music` take `create()`.
 */

import { Signal } from '../core/Signal.ts';
import { createAudioLoader } from './AudioLoader.ts';
import { OutputRecorder, type OutputRecorderOptions } from './Recorder.ts';
import type { SfxArbiter } from './Sfx.ts';
import { StreamChannel, type BlockSource } from './StreamChannel.ts';

/** seconds within a buffer: the region a looping track repeats */
export interface LoopRegion {
	start: number;
	end: number;
}

export interface ChannelPlayOptions {
	/** level, 0 to 1 */
	volume?: number;
	/** playback ratio, 1 unchanged, above 1 higher and faster */
	pitch?: number;
	/** stereo position, -1 (left) to 1 (right) */
	pan?: number;
	/** start offset in seconds */
	pos?: number;
	/** region to repeat, null repeats the whole buffer */
	loop?: LoopRegion | null;
	/** false plays once through for jingles; true repeats */
	repeat?: boolean;
}

/** plain-data playback state: parameters plus playhead, without the buffer */
export interface ChannelState {
	volume: number;
	pitch: number;
	pan: number;
	pos: number;
}

/** one wired voice: a buffer source through a gain and an optional stereo panner */
function wireVoice(
	context: AudioContext,
	destination: AudioNode,
	buffer: AudioBuffer,
	volume: number,
	pitch: number,
	pan: number,
): { source: AudioBufferSourceNode; gain: GainNode; panner: StereoPannerNode | null } {
	const source = context.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = pitch;
	const gain = context.createGain();
	gain.gain.value = volume;
	let panner: StereoPannerNode | null = null;
	if (typeof context.createStereoPanner === 'function') {
		panner = context.createStereoPanner();
		panner.pan.value = pan;
		source.connect(gain);
		gain.connect(panner);
		panner.connect(destination);
	} else {
		source.connect(gain);
		gain.connect(destination);
	}
	return { source, gain, panner };
}

/**
 * One buffered voice: a decoded track with a loop region and a playhead the game can
 * read and move. Replaying the same buffer restarts it; changing parameters mid-play
 * never does.
 *
 * @example
 * ```ts
 * import { Channel } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const buffer: AudioBuffer;
 *
 * const channel = new Channel(context);
 * channel.play(buffer, { volume: 0.8, pitch: 1, pan: 0, loop: { start: 1, end: 4 } });
 * console.log(channel.position());
 * channel.stop();
 * ```
 */
export class Channel {
	private readonly context: AudioContext;
	private readonly destination: AudioNode;
	private source: AudioBufferSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private pannerNode: StereoPannerNode | null = null;
	private buffer: AudioBuffer | null = null;
	private params = { volume: 1, pitch: 1, pan: 0 };
	private loopRegion: LoopRegion | null = null;
	private repeat = true;
	private startedAt = 0;
	private offset = 0;

	constructor(context: AudioContext, destination?: AudioNode) {
		this.context = context;
		this.destination = destination ?? context.destination;
	}

	get isPlaying(): boolean {
		return this.source !== null;
	}

	get duration(): number {
		return this.buffer?.duration ?? 0;
	}

	/** starts the buffer with these parameters, stopping whatever played before */
	play(buffer: AudioBuffer, options: ChannelPlayOptions = {}): void {
		this.stop();
		const volume = options.volume ?? 1;
		const pitch = options.pitch ?? 1;
		const pan = options.pan ?? 0;
		const { source, gain, panner } = wireVoice(this.context, this.destination, buffer, volume, pitch, pan);
		const loop = options.loop ?? null;
		const repeat = options.repeat ?? true;
		source.loop = repeat;
		if (loop) {
			source.loopStart = loop.start;
			source.loopEnd = loop.end;
		}
		if (!repeat) {
			const started = source;
			source.onended = () => {
				if (this.source === started) this.clearNodes();
			};
		}
		this.source = source;
		this.gainNode = gain;
		this.pannerNode = panner;
		this.buffer = buffer;
		this.params = { volume, pitch, pan };
		this.loopRegion = loop;
		this.repeat = repeat;
		this.offset = Math.min(Math.max(0, options.pos ?? 0), Math.max(0, buffer.duration - 0.001));
		this.startedAt = this.context.currentTime;
		source.start(0, this.offset);
	}

	/** retunes the playing voice in place: no restart, no seek */
	update(params: { volume?: number; pitch?: number; pan?: number }): void {
		if (params.volume !== undefined) this.params.volume = params.volume;
		if (params.pitch !== undefined) this.params.pitch = params.pitch;
		if (params.pan !== undefined) this.params.pan = params.pan;
		if (!this.source || !this.gainNode) return;
		const now = this.context.currentTime;
		this.gainNode.gain.setTargetAtTime(this.params.volume, now, 0.02);
		this.source.playbackRate.value = this.params.pitch;
		if (this.pannerNode) this.pannerNode.pan.value = this.params.pan;
	}

	/** stops the voice, fading out over `fadeSeconds` first when positive */
	stop(fadeSeconds = 0): void {
		const resumeAt = this.position();
		const source = this.source;
		const gain = this.gainNode;
		this.clearNodes();
		this.offset = resumeAt;
		if (!source) return;
		try {
			if (fadeSeconds > 0 && gain) {
				const now = this.context.currentTime;
				gain.gain.cancelScheduledValues(now);
				gain.gain.setValueAtTime(gain.gain.value, now);
				gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
				source.stop(now + fadeSeconds + 0.02);
			} else {
				source.stop();
			}
		} catch {
			//already stopped
		}
	}

	/** seconds into the buffer, wrapping inside the loop region while it repeats */
	position(): number {
		if (!this.source || !this.buffer) return this.offset;
		const elapsed = Math.max(0, this.context.currentTime - this.startedAt) * this.params.pitch;
		let pos = this.offset + elapsed;
		if (this.repeat && this.duration > 0) {
			const start = this.loopRegion?.start ?? 0;
			const end = this.loopRegion?.end ?? this.buffer.duration;
			if (end > start && pos >= end) pos = start + ((pos - start) % (end - start));
		}
		return pos;
	}

	/** moves the playhead, restarting the voice when it plays */
	seek(pos: number): void {
		this.restore({ ...this.state(), pos });
	}

	/** plain-data state for saves and transfers: parameters plus playhead */
	state(): ChannelState {
		return { ...this.params, pos: this.position() };
	}

	/** applies plain-data state, restarting the voice at its playhead when it plays */
	restore(state: ChannelState): void {
		const buffer = this.buffer;
		this.update({ volume: state.volume, pitch: state.pitch, pan: state.pan });
		if (buffer && this.source) {
			this.play(buffer, {
				volume: state.volume,
				pitch: state.pitch,
				pan: state.pan,
				pos: state.pos,
				loop: this.loopRegion,
				repeat: this.repeat,
			});
		} else {
			this.offset = Math.max(0, state.pos);
		}
	}

	private clearNodes(): void {
		if (this.source) this.source.onended = null;
		this.source = null;
		this.gainNode = null;
		this.pannerNode = null;
	}
}

export type BusKind = 'bgm' | 'bgs' | 'me' | 'se';

/**
 * A named track request in role-playing units: volume 0 to 100, pitch 50 to 150
 * percent, pan -100 to 100, an optional resume position in seconds.
 */
export interface BusTrack {
	name: string;
	volume?: number;
	pitch?: number;
	pan?: number;
	pos?: number;
	/** identity of the content behind a synthesised track, `id@version#sha256`, so a save replays the same bytes or says it cannot */
	contentId?: string;
	/** the engine that voiced it (`'retro:mt32'`), so a restore picks the same one when it can */
	engine?: string;
	/** playhead in source frames, exact where `pos` in seconds is not; a restore skips to it */
	frame?: number;
	/** for `playSe` only: asks the shared `SfxArbiter` for a voice at this priority; 0 when omitted */
	priority?: number;
}

/** a resolved track request: every parameter filled in, ready to store or restore */
export interface SavedBusTrack {
	name: string;
	volume: number;
	pitch: number;
	pan: number;
	pos: number;
	contentId?: string;
	engine?: string;
	frame?: number;
}

/** a decoded track: its buffer plus the region it repeats, if any */
export interface LoadedTrack {
	buffer: AudioBuffer;
	loop?: LoopRegion | null;
}

/** what a loader may use while it works: a signal that says the request was replaced, and a way to report how far along it is */
export interface BusLoadContext {
	/** aborted when a newer request for the same kind replaces this one, so a long render can stop early */
	signal: AbortSignal;
	/** reports progress from 0 to 1; `AudioBus.onLoadProgress` forwards it */
	progress(fraction: number): void;
	/** the request being loaded, including the content id, engine and frame a restored save carries */
	track: SavedBusTrack;
}

/** turns a kind and a name into a decoded buffer, or null when it cannot */
export type BusLoader = (kind: BusKind, name: string, context?: BusLoadContext) => Promise<LoadedTrack | null>;

/** a track played by pulling frames instead of holding a decoded buffer */
export interface StreamedTrack {
	source: BlockSource;
	/** region the repeat wraps inside, in seconds; the whole source when omitted */
	loop?: LoopRegion | null;
	/** stop an endless source after this many seconds, fading out over `endFadeSeconds` (2 when omitted) */
	endAfterSeconds?: number;
	endFadeSeconds?: number;
}

/** turns a kind and a name into a streamed source, or null to let the buffer loader answer instead */
export type StreamLoader = (
	kind: 'bgm' | 'bgs',
	name: string,
	context: BusLoadContext,
) => Promise<StreamedTrack | null>;

/** how far a track's load has got */
export interface BusLoadProgress {
	kind: BusKind;
	name: string;
	/** 0 to 1 */
	fraction: number;
}

/** plain-data bus state for saves and transfers: tracks plus memorized ones */
export interface BusSnapshot {
	bgm: SavedBusTrack | null;
	bgs: SavedBusTrack | null;
	savedBgm: SavedBusTrack | null;
	savedBgs: SavedBusTrack | null;
}

/** the level a whole kind plays at, on top of each track's own volume */
export interface BusMixerLevel {
	/** 0 to 1 */
	volume: number;
	muted: boolean;
}

export interface AudioBusOptions {
	destination?: AudioNode;
	/** Defaults to embedded asset loading, including worker-rendered MIDI; customize with `createAudioLoader`. */
	load?: BusLoader;
	/**
	 * asked first for BGM and BGS: a source it returns plays through a `StreamChannel`, so a long
	 * or endless track never becomes a whole `AudioBuffer`; null falls through to `load`
	 */
	stream?: StreamLoader;
	/** the voice limit shared with `SfxSound`s: `playSe` asks it for a slot at `BusTrack.priority` */
	arbiter?: SfxArbiter;
}

function clampBus(value: number | undefined, low: number, high: number, fallback: number): number {
	const n = Number(value);
	return Math.min(high, Math.max(low, Number.isFinite(n) ? n : fallback));
}

/**
 * The four audio lifetimes of a role-playing game over two `Channel` voices: BGM and
 * BGS loop independently, an ME jingle suspends the BGM and resumes it where it left
 * off, SE plays overlapping one-shots. Replaying the current track only retunes it;
 * save and replay memorize a track with its playhead for menus and transfers.
 *
 * @example
 * ```ts
 * import { AudioBus } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 *
 * const bus = new AudioBus(context, { load: (_kind, _name) => Promise.resolve(null) });
 * void bus.playBgm({ name: 'town', volume: 90, pitch: 100, pan: 0 });
 * console.log(bus.snapshot());
 * ```
 */
export class AudioBus {
	private readonly context: AudioContext;
	private readonly destination: AudioNode;
	private readonly load: BusLoader;
	private readonly streamLoader: StreamLoader | null;
	private readonly arbiter: SfxArbiter | null;
	private readonly streams: Record<'bgm' | 'bgs', StreamChannel>;
	private readonly aborts: Record<'bgm' | 'bgs', AbortController | null> = { bgm: null, bgs: null };
	/** told as a loader reports progress, for a loading bar over a long render */
	readonly onLoadProgress = new Signal<BusLoadProgress>();
	private readonly bgmChannel: Channel;
	private readonly bgsChannel: Channel;
	private readonly tracks: { bgm: SavedBusTrack | null; bgs: SavedBusTrack | null } = { bgm: null, bgs: null };
	private readonly saved: { bgm: SavedBusTrack | null; bgs: SavedBusTrack | null } = { bgm: null, bgs: null };
	private readonly requests = { bgm: 0, bgs: 0 };
	private me: { source: AudioBufferSourceNode; token: number } | null = null;
	private meToken = 0;
	private suspendedBgm: SavedBusTrack | null = null;
	private readonly seNodes = new Set<{ source: AudioBufferSourceNode }>();
	private readonly mixerLevels: Record<BusKind, BusMixerLevel> = {
		bgm: { volume: 1, muted: false },
		bgs: { volume: 1, muted: false },
		me: { volume: 1, muted: false },
		se: { volume: 1, muted: false },
	};
	private readonly kindGains: Record<BusKind, GainNode>;

	constructor(context: AudioContext, options: AudioBusOptions = {}) {
		this.context = context;
		this.destination = options.destination ?? context.destination;
		this.load = options.load ?? createAudioLoader(context);
		const kindGain = (): GainNode => {
			const gain = context.createGain();
			gain.connect(this.destination);
			return gain;
		};
		this.kindGains = { bgm: kindGain(), bgs: kindGain(), me: kindGain(), se: kindGain() };
		this.bgmChannel = new Channel(context, this.kindGains.bgm);
		this.bgsChannel = new Channel(context, this.kindGains.bgs);
		this.streamLoader = options.stream ?? null;
		this.arbiter = options.arbiter ?? null;
		this.streams = {
			bgm: new StreamChannel(context, this.kindGains.bgm),
			bgs: new StreamChannel(context, this.kindGains.bgs),
		};
	}

	/**
	 * Starts recording what the bus plays, every kind (music, ambience, jingles and effects) as the
	 * player hears it, into plain frames: `stop()` on the returned recorder gives them to
	 * `AudioExport`. A take is bounded (`maxSeconds`, 600 when omitted) so memory stays bounded too.
	 */
	record(options: OutputRecorderOptions = {}): OutputRecorder {
		return new OutputRecorder(this.context, Object.values(this.kindGains), options);
	}

	/** the streaming voice of a loop kind, for underrun reports and its own controls */
	streamChannel(kind: 'bgm' | 'bgs'): StreamChannel {
		return this.streams[kind];
	}

	/** a newer request, or a stop, replaces whatever a loop kind is still loading */
	private cancelLoad(kind: 'bgm' | 'bgs'): void {
		this.requests[kind]++;
		this.aborts[kind]?.abort();
		this.aborts[kind] = null;
	}

	private stopLoop(kind: 'bgm' | 'bgs', fadeSeconds = 0): void {
		(kind === 'bgm' ? this.bgmChannel : this.bgsChannel).stop(fadeSeconds);
		this.streams[kind].stop(fadeSeconds);
	}

	private loopPlaying(kind: 'bgm' | 'bgs'): boolean {
		return (kind === 'bgm' ? this.bgmChannel : this.bgsChannel).isPlaying || this.streams[kind].isPlaying;
	}

	private loopPosition(kind: 'bgm' | 'bgs'): number {
		return this.streams[kind].isPlaying
			? this.streams[kind].position()
			: (kind === 'bgm' ? this.bgmChannel : this.bgsChannel).position();
	}

	/** a stream's playhead in source frames, undefined for a buffered track which has only seconds */
	private loopFrame(kind: 'bgm' | 'bgs'): number | undefined {
		return this.streams[kind].isPlaying ? this.streams[kind].positionFrames() : undefined;
	}

	/**
	 * Sets a kind's own volume (0 to 1) and mute, applied on top of every track's volume
	 * and to sounds already playing. Tracks keep the level the game asked for, so
	 * `snapshot()` never reports the mixer's scaling.
	 */
	setMixer(kind: BusKind, level: { volume?: number; muted?: boolean }): void {
		const current = this.mixerLevels[kind];
		if (level.volume !== undefined) current.volume = clampBus(level.volume, 0, 1, 1);
		if (level.muted !== undefined) current.muted = level.muted;
		this.kindGains[kind].gain.value = current.muted ? 0 : current.volume;
	}

	/** a kind's current mixer level */
	mixer(kind: BusKind): BusMixerLevel {
		return { ...this.mixerLevels[kind] };
	}

	/** loops this BGM, or retunes it when it already loops */
	playBgm(track: BusTrack): Promise<void> {
		return this.playLoop('bgm', track);
	}

	/** loops this BGS, or retunes it when it already loops */
	playBgs(track: BusTrack): Promise<void> {
		return this.playLoop('bgs', track);
	}

	stopBgm(): void {
		this.cancelLoad('bgm');
		this.tracks.bgm = null;
		this.suspendedBgm = null;
		this.stopLoop('bgm');
	}

	stopBgs(): void {
		this.cancelLoad('bgs');
		this.tracks.bgs = null;
		this.stopLoop('bgs');
	}

	fadeOutBgm(seconds = 1): void {
		this.cancelLoad('bgm');
		this.tracks.bgm = null;
		this.suspendedBgm = null;
		this.stopLoop('bgm', Math.max(0, seconds));
	}

	fadeOutBgs(seconds = 1): void {
		this.cancelLoad('bgs');
		this.tracks.bgs = null;
		this.stopLoop('bgs', Math.max(0, seconds));
	}

	/** the intended track with its live playhead, or the one an ME suspended */
	currentTrack(kind: 'bgm' | 'bgs'): SavedBusTrack | null {
		const track = this.tracks[kind];
		if (track) {
			const frame = this.loopFrame(kind);
			return {
				...track,
				pos: this.loopPlaying(kind) ? this.loopPosition(kind) : track.pos,
				...(frame === undefined ? {} : { frame }),
			};
		}
		return kind === 'bgm' ? this.suspendedBgm : null;
	}

	/** memorizes the playing BGM with its playhead; replay restores it */
	saveBgm(): SavedBusTrack | null {
		this.saved.bgm = this.currentTrack('bgm');
		return this.saved.bgm;
	}

	/** memorizes the playing BGS with its playhead; replay restores it */
	saveBgs(): SavedBusTrack | null {
		this.saved.bgs = this.currentTrack('bgs');
		return this.saved.bgs;
	}

	replayBgm(): Promise<void> {
		if (!this.saved.bgm) return Promise.resolve();
		return this.playBgm(this.saved.bgm);
	}

	replayBgs(): Promise<void> {
		if (!this.saved.bgs) return Promise.resolve();
		return this.playBgs(this.saved.bgs);
	}

	/**
	 * Plays a jingle once, suspending the BGM and resuming it where it left off when
	 * the jingle ends. A BGM started mid-jingle takes over instead of being resumed over.
	 */
	async playMe(track: BusTrack): Promise<void> {
		const me = AudioBus.normalize(track);
		const token = ++this.meToken;
		this.stopMeNodes();
		if (!me.name) return;
		const loaded = await this.load('me', me.name);
		if (token !== this.meToken || !loaded) return;
		const remembered = this.currentTrack('bgm');
		if (remembered) {
			this.suspendedBgm = remembered;
			this.cancelLoad('bgm');
			this.stopLoop('bgm');
			this.tracks.bgm = null;
		}
		const { source } = wireVoice(
			this.context,
			this.kindGains.me,
			loaded.buffer,
			me.volume / 100,
			me.pitch / 100,
			me.pan / 100,
		);
		this.me = { source, token };
		source.onended = () => {
			if (this.me?.token === token) this.finishMe();
		};
		source.start(0);
	}

	/** stops the jingle, resuming the suspended BGM unless told not to */
	stopMe(resume = true): void {
		this.stopMeNodes();
		if (resume) this.finishMe();
	}

	/** plays one overlapping sound effect */
	async playSe(track: BusTrack): Promise<void> {
		const se = AudioBus.normalize(track);
		if (!se.name) return;
		const loaded = await this.load('se', se.name);
		if (!loaded) return;
		let node: { source: AudioBufferSourceNode } | null = null;
		const grant =
			this.arbiter?.request(
				Math.floor(Number(track.priority) || 0),
				() => {
					if (node) this.cutSe(node);
				},
				() => !node || this.seNodes.has(node),
			) ?? null;
		if (this.arbiter && !grant) return;
		const { source } = wireVoice(
			this.context,
			this.kindGains.se,
			loaded.buffer,
			se.volume / 100,
			se.pitch / 100,
			se.pan / 100,
		);
		node = { source };
		this.seNodes.add(node);
		source.onended = () => {
			this.seNodes.delete(node!);
			grant?.release();
		};
		source.start(0);
	}

	private cutSe(node: { source: AudioBufferSourceNode }): void {
		node.source.onended = null;
		this.seNodes.delete(node);
		try {
			node.source.stop();
		} catch {
			//already ended
		}
	}

	stopSe(): void {
		for (const node of this.seNodes) {
			node.source.onended = null;
			try {
				node.source.stop();
			} catch {
				//already ended
			}
		}
		this.seNodes.clear();
	}

	stopAll(): void {
		this.cancelLoad('bgm');
		this.cancelLoad('bgs');
		this.tracks.bgm = null;
		this.tracks.bgs = null;
		this.suspendedBgm = null;
		this.stopLoop('bgm');
		this.stopLoop('bgs');
		this.stopMeNodes();
		this.stopSe();
	}

	/** plain-data bus state for saves and transfers */
	snapshot(): BusSnapshot {
		return {
			bgm: this.currentTrack('bgm'),
			bgs: this.currentTrack('bgs'),
			savedBgm: this.saved.bgm,
			savedBgs: this.saved.bgs,
		};
	}

	/** replays plain-data bus state, reloading every named track */
	restore(state: BusSnapshot | null | undefined): void {
		if (!state || typeof state !== 'object') return;
		this.saved.bgm = state.savedBgm ?? null;
		this.saved.bgs = state.savedBgs ?? null;
		if (state.bgm) void this.playBgm(state.bgm);
		if (state.bgs) void this.playBgs(state.bgs);
	}

	private static normalize(track: BusTrack): SavedBusTrack {
		return {
			name: String(track?.name || ''),
			volume: clampBus(track?.volume, 0, 100, 90),
			pitch: clampBus(track?.pitch, 10, 400, 100),
			pan: clampBus(track?.pan, -100, 100, 0),
			pos: Math.max(0, Number(track?.pos) || 0),
			...(typeof track?.contentId === 'string' ? { contentId: track.contentId } : {}),
			...(typeof track?.engine === 'string' ? { engine: track.engine } : {}),
			...(Number.isFinite(track?.frame) ? { frame: Math.max(0, Math.floor(track.frame!)) } : {}),
		};
	}

	private async playLoop(kind: 'bgm' | 'bgs', input: BusTrack): Promise<void> {
		const wanted = AudioBus.normalize(input);
		if (!wanted.name) {
			this.cancelLoad(kind);
			this.tracks[kind] = null;
			if (kind === 'bgm') this.suspendedBgm = null;
			this.stopLoop(kind);
			return;
		}
		const current = this.tracks[kind];
		//Replaying the current track only retunes it, even while it still loads.
		if (current && current.name === wanted.name && !(wanted.pos > 0)) {
			this.tracks[kind] = { ...wanted, pos: 0 };
			const retune = { volume: wanted.volume / 100, pitch: wanted.pitch / 100, pan: wanted.pan / 100 };
			(kind === 'bgm' ? this.bgmChannel : this.bgsChannel).update(retune);
			this.streams[kind].update(retune);
			return;
		}
		//A BGM requested mid-jingle replaces the suspended one instead of racing it.
		if (kind === 'bgm' && this.me) {
			this.cancelLoad('bgm');
			this.suspendedBgm = wanted;
			this.tracks.bgm = null;
			this.stopLoop('bgm');
			return;
		}
		this.cancelLoad(kind);
		const request = this.requests[kind];
		const abort = new AbortController();
		this.aborts[kind] = abort;
		const context: BusLoadContext = {
			track: wanted,
			signal: abort.signal,
			progress: (fraction) => {
				if (request === this.requests[kind])
					this.onLoadProgress.dispatch({ kind, name: wanted.name, fraction });
			},
		};
		this.stopLoop(kind);
		this.tracks[kind] = { ...wanted, pos: 0 };
		const params = { volume: wanted.volume / 100, pitch: wanted.pitch / 100, pan: wanted.pan / 100 };
		const streamed = this.streamLoader ? await this.streamLoader(kind, wanted.name, context) : null;
		if (request !== this.requests[kind]) return;
		if (streamed) {
			this.streams[kind].play(streamed.source, {
				...params,
				pos: wanted.pos,
				repeat: true,
				loop: streamed.loop,
				endAfterSeconds: streamed.endAfterSeconds,
				endFadeSeconds: streamed.endFadeSeconds,
			});
			return;
		}
		const loaded = await this.load(kind, wanted.name, context);
		if (request !== this.requests[kind]) return;
		if (!loaded) {
			this.tracks[kind] = null;
			return;
		}
		(kind === 'bgm' ? this.bgmChannel : this.bgsChannel).play(loaded.buffer, {
			...params,
			pos: wanted.pos,
			loop: loaded.loop ?? null,
		});
	}

	private stopMeNodes(): void {
		const me = this.me;
		this.me = null;
		if (!me) return;
		me.source.onended = null;
		try {
			me.source.stop();
		} catch {
			//already ended
		}
	}

	private finishMe(): void {
		this.me = null;
		const resume = this.suspendedBgm;
		this.suspendedBgm = null;
		if (resume && !this.tracks.bgm) void this.playBgm(resume);
	}
}
