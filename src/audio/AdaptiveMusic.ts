import type { LoopRegion } from './Channels.ts';

/** a set of stems that line up: same length, same rate, so they can be mixed and swapped in step */
export type StemSet = Readonly<Record<string, AudioBuffer>>;

export interface AdaptiveMusicOptions {
	destination?: AudioNode;
	/** seconds of fade for a level change or a version switch when the call gives none; 1 when omitted */
	fadeSeconds?: number;
}

export interface AdaptiveLoadOptions {
	/** names a group of stems so one call sets them all: `{ combat: ['drums', 'brass'] }` */
	groups?: Readonly<Record<string, readonly string[]>>;
	/** the region the whole set repeats; the whole buffer when omitted */
	loop?: LoopRegion | null;
	/**
	 * the length of one bar in seconds, which lets a level change or a version switch wait for the
	 * next bar line (`quantize: 'bar'`); the loop region should hold a whole number of bars, since
	 * bars are counted from the start of the buffers
	 */
	barSeconds?: number;
}

/** when a change takes effect: at once, or at the next bar line of the version that sounds */
export type Quantize = 'now' | 'bar';

export interface AdaptivePlayOptions {
	/** the version to start with; the first one loaded when omitted */
	version?: string;
	/** start offset in seconds */
	pos?: number;
	/** starting level of each stem or group, 0 to 1; a stem not named starts at 0 */
	levels?: Readonly<Record<string, number>>;
}

interface Version {
	stems: StemSet;
	groups: Readonly<Record<string, readonly string[]>>;
	loop: LoopRegion | null;
	frames: number;
	sampleRate: number;
	/** frames in one bar, 0 when the version declares none */
	barFrames: number;
}

interface Voice {
	source: AudioBufferSourceNode;
	gain: GainNode;
}

interface Running {
	version: string;
	voices: Map<string, Voice>;
	master: GainNode;
}

/**
 * Adaptive music from stems that play in lockstep: every stem of a version starts on the same
 * clock tick at the same offset, each through its own gain, so raising or lowering a stem (or a
 * named group of them) with a fade changes the intensity without changing the file or losing the
 * beat. Several versions of the arrangement can be loaded; switching between them crossfades at
 * the same position, counted in frames, so a calm version and a combat version stay in step. Stems
 * come from `renderMidiStems` or from separately recorded layers; all stems of a version must have
 * the same length and sample rate, and versions must agree on the sample rate.
 *
 * @example
 * ```ts
 * import { AdaptiveMusic, renderMidiStems, parseMidi, toAudioBuffer } from '@datamoc/mwg/audio';
 *
 * declare const context: AudioContext;
 * declare const midiBytes: ArrayBuffer;
 *
 * const rendered = renderMidiStems(parseMidi(midiBytes), { rhythm: [9], melody: [0], pads: [1] });
 * const stems = Object.fromEntries(Object.entries(rendered).map(([name, r]) => [name, toAudioBuffer(context, r)]));
 *
 * const music = new AdaptiveMusic(context);
 * music.load('calm', stems, { groups: { intensity: ['rhythm', 'melody'] } });
 * music.play({ levels: { pads: 1 } });
 * music.setLevel('intensity', 1, 2); // fade the fight in over two seconds
 * ```
 */
export class AdaptiveMusic {
	private readonly context: AudioContext;
	private readonly destination: AudioNode;
	private readonly defaultFade: number;
	private readonly versions = new Map<string, Version>();
	private running: Running | null = null;
	private startedAt = 0;
	private offsetFrames = 0;
	private levels_: Record<string, number> = {};

	constructor(context: AudioContext, options: AdaptiveMusicOptions = {}) {
		this.context = context;
		this.destination = options.destination ?? context.destination;
		this.defaultFade = Math.max(0, options.fadeSeconds ?? 1);
	}

	get isPlaying(): boolean {
		return this.running !== null;
	}

	/** the version that sounds now, or null */
	get version(): string | null {
		return this.running?.version ?? null;
	}

	/** loads one arrangement under a name; throws when its stems do not line up */
	load(name: string, stems: StemSet, options: AdaptiveLoadOptions = {}): void {
		const names = Object.keys(stems);
		if (names.length === 0) throw new Error(`adaptive version "${name}" has no stems`);
		const first = stems[names[0]];
		for (const stem of names) {
			const buffer = stems[stem];
			if (buffer.length !== first.length || buffer.sampleRate !== first.sampleRate) {
				throw new Error(`stem "${stem}" of "${name}" differs in length or sample rate from "${names[0]}"`);
			}
		}
		const other = [...this.versions.values()][0];
		if (other && other.sampleRate !== first.sampleRate) {
			throw new Error(
				`version "${name}" is at ${first.sampleRate} Hz but the others are at ${other.sampleRate} Hz`,
			);
		}
		const groups = options.groups ?? {};
		for (const [group, members] of Object.entries(groups)) {
			const missing = members.find((member) => !(member in stems));
			if (missing !== undefined)
				throw new Error(`group "${group}" names stem "${missing}", which "${name}" lacks`);
			if (group in stems) throw new Error(`group "${group}" has the name of a stem`);
		}
		const barSeconds = options.barSeconds ?? 0;
		if (!(barSeconds >= 0)) throw new Error(`barSeconds of "${name}" must be positive`);
		this.versions.set(name, {
			stems,
			groups,
			loop: options.loop ?? null,
			frames: first.length,
			sampleRate: first.sampleRate,
			barFrames: Math.round(barSeconds * first.sampleRate),
		});
	}

	/** starts the set from the beginning, or from `pos` */
	play(options: AdaptivePlayOptions = {}): void {
		this.stop();
		const name = options.version ?? [...this.versions.keys()][0];
		const version = name === undefined ? undefined : this.versions.get(name);
		if (!version || name === undefined) throw new Error(`no adaptive version "${options.version ?? ''}" is loaded`);
		this.levels_ = {};
		const offset = Math.min(Math.max(0, Math.floor((options.pos ?? 0) * version.sampleRate)), version.frames - 1);
		this.offsetFrames = offset;
		this.startedAt = this.context.currentTime;
		this.running = this.startVersion(name, version, offset, options.levels ?? {}, 0);
	}

	/**
	 * sets a stem's or group's level (0 to 1), fading over `fadeSeconds`; with `quantize: 'bar'` the
	 * fade starts at the next bar line, so a layer comes in on the measure
	 */
	setLevel(target: string, level: number, fadeSeconds?: number, quantize: Quantize = 'now'): void {
		const running = this.running;
		if (!running) throw new Error('adaptive music is not playing');
		const version = this.versions.get(running.version)!;
		const members = this.membersOf(version, target);
		const value = Math.min(1, Math.max(0, level));
		const fade = Math.max(0, fadeSeconds ?? this.defaultFade);
		const delay = this.secondsUntil(quantize, running, version);
		for (const member of members) {
			this.levels_[member] = value;
			const gain = running.voices.get(member)?.gain.gain;
			if (gain) this.ramp(gain, value, fade, delay);
		}
	}

	/** the level each stem is heading to */
	levels(): Record<string, number> {
		return { ...this.levels_ };
	}

	/** frame position inside the buffers, wrapping inside the loop region */
	positionFrames(): number {
		const running = this.running;
		return running ? this.frameAfter(this.versions.get(running.version)!, 0) : 0;
	}

	/** the frame the music will have reached `seconds` from now, wrapping inside the loop region */
	private frameAfter(version: Version, seconds: number): number {
		let frame =
			this.offsetFrames + Math.max(0, this.context.currentTime + seconds - this.startedAt) * version.sampleRate;
		const start = version.loop ? Math.floor(version.loop.start * version.sampleRate) : 0;
		const end = version.loop ? Math.floor(version.loop.end * version.sampleRate) : version.frames;
		if (end > start && frame >= end) frame = start + ((frame - start) % (end - start));
		return Math.floor(frame);
	}

	/** seconds until the change should happen: 0 for 'now', the wait for the next bar line for 'bar' */
	private secondsUntil(quantize: Quantize, running: Running, version: Version): number {
		if (quantize === 'now') return 0;
		if (version.barFrames <= 0) throw new Error(`version "${running.version}" declares no barSeconds`);
		const remainder = this.positionFrames() % version.barFrames;
		return remainder === 0 ? 0 : (version.barFrames - remainder) / version.sampleRate;
	}

	position(): number {
		const running = this.running;
		return running ? this.positionFrames() / this.versions.get(running.version)!.sampleRate : 0;
	}

	/**
	 * Crossfades to another loaded version at the position the current one has reached, in
	 * frames, so the beat carries over. Levels carry over too: a stem or group of the same name
	 * keeps the level it had. With `quantize: 'bar'` the crossfade starts at the next bar line of the
	 * version that sounds now, so a scene change never cuts a measure; `version` reports the new
	 * name from the call, the sound changes at the bar.
	 */
	switchVersion(name: string, fadeSeconds?: number, quantize: Quantize = 'now'): void {
		const running = this.running;
		if (!running) throw new Error('adaptive music is not playing');
		const next = this.versions.get(name);
		if (!next) throw new Error(`no adaptive version "${name}" is loaded`);
		if (name === running.version) return;
		const fade = Math.max(0, fadeSeconds ?? this.defaultFade);
		const current = this.versions.get(running.version)!;
		const delay = this.secondsUntil(quantize, running, current);
		const frame = this.frameAfter(current, delay);
		const when = this.context.currentTime + delay;
		this.ramp(running.master.gain, 0, fade, delay);
		for (const { source } of running.voices.values()) this.stopAt(source, when + fade + 0.05);
		this.offsetFrames = Math.min(frame, next.frames - 1);
		this.startedAt = when;
		this.running = this.startVersion(name, next, this.offsetFrames, this.levels_, fade, when);
	}

	/** stops every stem, fading over `fadeSeconds` first when positive; the position is forgotten */
	stop(fadeSeconds = 0): void {
		const running = this.running;
		this.running = null;
		this.levels_ = {};
		if (!running) return;
		const now = this.context.currentTime;
		if (fadeSeconds > 0) this.ramp(running.master.gain, 0, fadeSeconds);
		for (const { source } of running.voices.values())
			this.stopAt(source, fadeSeconds > 0 ? now + fadeSeconds + 0.05 : undefined);
	}

	private startVersion(
		name: string,
		version: Version,
		offsetFrames: number,
		levels: Readonly<Record<string, number>>,
		fadeInSeconds: number,
		when = this.context.currentTime,
	): Running {
		const master = this.context.createGain();
		master.gain.value = fadeInSeconds > 0 ? 0 : 1;
		master.connect(this.destination);
		if (fadeInSeconds > 0) this.ramp(master.gain, 1, fadeInSeconds, when - this.context.currentTime);
		const voices = new Map<string, Voice>();
		const offset = offsetFrames / version.sampleRate;
		//levels given by group name apply to every member; a stem named directly overrides its group
		const resolved: Record<string, number> = {};
		for (const [target, level] of Object.entries(levels)) {
			if (target in version.groups) for (const member of version.groups[target]) resolved[member] = level;
		}
		for (const [target, level] of Object.entries(levels)) if (target in version.stems) resolved[target] = level;
		for (const [stem, buffer] of Object.entries(version.stems)) {
			const gain = this.context.createGain();
			const level = Math.min(1, Math.max(0, resolved[stem] ?? 0));
			gain.gain.value = level;
			this.levels_[stem] = level;
			gain.connect(master);
			const source = this.context.createBufferSource();
			source.buffer = buffer;
			source.loop = true;
			if (version.loop) {
				source.loopStart = version.loop.start;
				source.loopEnd = version.loop.end;
			}
			source.connect(gain);
			//every stem on the same tick at the same offset is what keeps them in step
			source.start(when, offset);
			voices.set(stem, { source, gain });
		}
		return { version: name, voices, master };
	}

	private membersOf(version: Version, target: string): readonly string[] {
		if (target in version.stems) return [target];
		const group = version.groups[target];
		if (!group) throw new Error(`"${target}" is neither a stem nor a group of "${this.running?.version}"`);
		return group;
	}

	/** moves a parameter to `value` over `seconds`, the move starting `delay` seconds from now */
	private ramp(param: AudioParam, value: number, seconds: number, delay = 0): void {
		if (seconds <= 0 && delay <= 0) {
			param.value = value;
			return;
		}
		const now = this.context.currentTime;
		const start = now + delay;
		param.cancelScheduledValues(now);
		param.setValueAtTime(param.value, start);
		param.linearRampToValueAtTime(value, start + seconds);
	}

	private stopAt(source: AudioBufferSourceNode, when: number | undefined): void {
		try {
			source.stop(when);
		} catch {
			//already stopped
		}
	}
}
