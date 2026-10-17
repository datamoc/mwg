/** what `detectAudioFormat` makes of a file */
export interface AudioFormat {
	/** the format by name: `'MIDI'`, `'WAV'`, `'Ogg Vorbis'`, `'MWA'`, `'unknown'`... */
	format: string;
	kind: 'midi' | 'wav' | 'soundfont' | 'compressed' | 'chip' | 'tracker' | 'sysex' | 'unknown';
}

/** the report `inspectAudio` returns: the format, the size, and the numbers that matter for that format */
export interface AudioInspection extends AudioFormat {
	name: string;
	bytes: number;
	[detail: string]: unknown;
}

export interface RenderToWavOptions {
	/** an engine name, or several separated by commas and tried in order */
	synth?: string;
	/** module paths imported first, to register the engines `synth` names */
	modules?: string[];
	/** the bytes of a SoundFont for the General MIDI voicing */
	soundfont?: Uint8Array;
	rate?: number;
	gain?: number;
	/** render only these MIDI channels, 0 to 15 */
	channels?: number[];
	/** 32-bit float samples instead of 16-bit PCM */
	float?: boolean;
}

export interface AudioBudgetOptions {
	/** render rate assumed for MIDI files; 22050 */
	rate?: number;
	/** a MIDI render is capped here, as the library's own cap is; 480 */
	maxSeconds?: number;
	/** fail when the decoded audio would hold more than this many megabytes */
	maxMegabytes?: number;
	/** fail for any track longer than this many seconds */
	maxTrackSeconds?: number;
}

export interface AudioBudgetFile {
	path: string;
	format: string;
	diskBytes: number;
	/** bytes it adds to a page, base64 included */
	pageBytes: number;
	seconds: number | null;
	/** bytes of stereo float samples it holds decoded, or null when that cannot be known without decoding */
	decodedBytes: number | null;
}

export interface AudioBudgetReport {
	files: AudioBudgetFile[];
	totals: { diskBytes: number; pageBytes: number; decodedBytes: number };
	problems: string[];
}

/** names a file by its content, falling back on the extension for formats with no signature */
export function detectAudioFormat(bytes: Uint8Array, name?: string): AudioFormat;
/** describes one file: its format and the numbers that matter for that format */
export function inspectAudio(bytes: Uint8Array, name?: string): Promise<AudioInspection>;
/** `"0,9"` as `[0, 9]` */
export function parseChannelList(text: string): number[];
/** renders MIDI bytes to WAV bytes through a registered engine, a SoundFont or the built-in synth */
export function renderToWav(midi: Uint8Array, options?: RenderToWavOptions): Promise<Uint8Array>;
/** resamples WAV bytes to another rate */
export function resampleWav(wav: Uint8Array, rate: number, float?: boolean): Promise<Uint8Array>;
/** how far apart two WAV files sound, in dB of log-spectrum difference */
export function compareWavs(
	a: Uint8Array,
	b: Uint8Array,
	options?: { windowSize?: number; hop?: number; floorDb?: number },
): Promise<{ decibels: number; windows: number }>;
/** what the audio files under these paths cost a page and a bus */
export function audioBudget(paths: string[], options?: AudioBudgetOptions): Promise<AudioBudgetReport>;
