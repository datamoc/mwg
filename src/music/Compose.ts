import { Generator } from '../core/Random.ts';
import type { MidiEvent, MidiFile } from '../audio/Midi.ts';
import { sfxSeed } from '../audio/Sfx.ts';

/**
 * Bump when the composer's output for a given scene changes, so a save can tell its music is no
 * longer reproducible.
 *
 * @example
 * ```ts
 * import { MUSIC_GENERATOR_VERSION } from '@datamoc/mwg/music';
 *
 * const saved = { scene: { id: 'harbour', seed: 7 }, generator: MUSIC_GENERATOR_VERSION };
 * console.log(saved.generator === MUSIC_GENERATOR_VERSION); // true while the same music comes out
 * ```
 */
export const MUSIC_GENERATOR_VERSION = 1;

export type MusicMood = 'calm' | 'sad' | 'tense' | 'mysterious' | 'triumphant';

/**
 * Every mood a scene may ask for, for a settings list or a validator.
 *
 * @example
 * ```ts
 * import { MUSIC_MOODS } from '@datamoc/mwg/music';
 *
 * console.log(MUSIC_MOODS.includes('tense')); // true
 * ```
 */
export const MUSIC_MOODS: readonly MusicMood[] = ['calm', 'sad', 'tense', 'mysterious', 'triumphant'];

/** everything the composer needs, as plain data a save or a share link can hold */
export interface MusicScene {
	/** names the scene; it is mixed into the seed so two scenes with one seed still differ */
	id: string;
	seed: number;
	mood: MusicMood;
	/** 0 (relaxed) to 1 (urgent): faster, denser, more repeated low notes */
	tension: number;
	/** tonic as a pitch class, 0 (C) to 11 (B) */
	key: number;
	/** length in 4/4 bars, 2 to 64 */
	bars: number;
	/** most notes sounding at once, 1 to 8: 3 writes for a 3-voice SID or YM chip */
	voices: number;
	/** beats per minute; derived from mood and tension when omitted */
	tempo?: number;
}

export interface GeneratedMusic {
	file: MidiFile;
	scene: MusicScene;
	bars: number;
	tempo: number;
	/** seconds in one bar: what `AdaptiveMusic.load` wants as `barSeconds` */
	barSeconds: number;
	/** the most notes that sound at once in `file`, never above `scene.voices` */
	polyphony: number;
}

const TICKS_PER_QUARTER = 96;
const BAR_TICKS = TICKS_PER_QUARTER * 4;

/** semitone steps from the tonic of each mood's scale */
const SCALES: Record<MusicMood, readonly number[]> = {
	calm: [0, 2, 4, 7, 9], //major pentatonic
	sad: [0, 2, 3, 5, 7, 8, 10], //natural minor
	tense: [0, 1, 3, 5, 6, 8, 10], //locrian
	mysterious: [0, 2, 3, 5, 7, 9, 10], //dorian
	triumphant: [0, 2, 4, 5, 7, 9, 10], //mixolydian
};

/** the root of each bar's chord as a semitone offset from the tonic, four bars then around again */
const PROGRESSIONS: Record<MusicMood, readonly number[]> = {
	calm: [0, 9, 4, 7],
	sad: [0, 8, 3, 10],
	tense: [0, 1, 0, 6],
	mysterious: [0, 5, 0, 10],
	triumphant: [0, 7, 9, 5],
};

/** General MIDI programs for melody, bass and pad/arpeggio of each mood */
const PROGRAMS: Record<MusicMood, readonly [number, number, number]> = {
	calm: [73, 32, 89],
	sad: [71, 33, 48],
	tense: [80, 38, 50],
	mysterious: [79, 39, 95],
	triumphant: [56, 34, 61],
};

const MELODY = 0;
const BASS = 1;
const HARMONY = 2;
const PADS = 3;
const DRUMS = 9;

/** rhythms of one bar as note starts in sixteenths, sparse to dense */
const RHYTHMS: readonly (readonly number[])[] = [
	[0, 8],
	[0, 4, 8, 12],
	[0, 6, 8, 12],
	[0, 4, 6, 8, 12, 14],
	[0, 2, 4, 6, 8, 10, 12, 14],
];

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Makes a scene safe to compose from whatever a save, a share link or a settings screen hands
 * over: unknown moods become `calm`, every number is clamped and rounded to its range.
 *
 * @example
 * ```ts
 * import { normalizeScene } from '@datamoc/mwg/music';
 *
 * console.log(normalizeScene({ id: 'cave', mood: 'tense', tension: 4, voices: 99 })); // tension 1, voices 8
 * ```
 */
export function normalizeScene(raw: Partial<MusicScene> & { id: string }): MusicScene {
	const mood = MUSIC_MOODS.includes(raw.mood as MusicMood) ? (raw.mood as MusicMood) : 'calm';
	const finite = (value: unknown, fallback: number): number =>
		typeof value === 'number' && Number.isFinite(value) ? value : fallback;
	const scene: MusicScene = {
		id: String(raw.id).slice(0, 64),
		seed: Math.floor(finite(raw.seed, 0)) >>> 0,
		mood,
		tension: clamp(finite(raw.tension, 0.3), 0, 1),
		key: ((Math.round(finite(raw.key, 0)) % 12) + 12) % 12,
		bars: clamp(Math.round(finite(raw.bars, 16)), 2, 64),
		voices: clamp(Math.round(finite(raw.voices, 4)), 1, 8),
	};
	if (raw.tempo !== undefined) scene.tempo = clamp(finite(raw.tempo, 100), 40, 220);
	return scene;
}

function tempoOf(scene: MusicScene): number {
	if (scene.tempo !== undefined) return scene.tempo;
	const base = { calm: 80, sad: 66, tense: 110, mysterious: 72, triumphant: 104 }[scene.mood];
	return Math.round(base + scene.tension * 40);
}

/**
 * Composes a piece from a scene: the same scene always gives the same notes. A melody walks the
 * mood's scale over a four-bar chord progression (its first two bars come back in the third and
 * fourth with a changed ending), a bass holds the chord roots, a pad or arpeggio fills the chord,
 * and drums join once the scene has the voices and the tension for them. The `voices` limit is
 * kept by writing fewer layers, never by cutting notes afterwards: 1 voice is the melody alone,
 * 2 adds the bass, 3 adds a one-note arpeggio, 4 adds drums, more adds pad notes.
 *
 * @example
 * ```ts
 * import { composeMusic } from '@datamoc/mwg/music';
 * import { renderMidiToBuffer } from '@datamoc/mwg/audio';
 *
 * const music = composeMusic({ id: 'harbour', seed: 7, mood: 'calm', tension: 0.2, key: 2, bars: 8, voices: 3 });
 * console.log(music.barSeconds, music.polyphony); // 3 or fewer notes at once
 * const audio = renderMidiToBuffer(music.file);
 * console.log(audio.duration > 0);
 * ```
 */
export function composeMusic(input: Partial<MusicScene> & { id: string }): GeneratedMusic {
	const scene = normalizeScene(input);
	const tempo = tempoOf(scene);
	const rng = (layer: number): Generator =>
		new Generator(sfxSeed(`${scene.id}:${MUSIC_GENERATOR_VERSION}`, scene.seed, layer));
	const events: MidiEvent[] = [{ tick: 0, type: 'tempo', microsecondsPerQuarter: Math.round(60_000_000 / tempo) }];
	const [melodyProgram, bassProgram, padProgram] = PROGRAMS[scene.mood];
	const layers = {
		melody: true,
		bass: scene.voices >= 2,
		arpeggio: scene.voices >= 3,
		drums: scene.voices >= 4 && scene.tension >= 0.3,
		pads: Math.max(0, Math.min(2, scene.voices - (scene.tension >= 0.3 ? 4 : 3))),
	};
	events.push({ tick: 0, type: 'program', channel: MELODY, program: melodyProgram });
	if (layers.bass) events.push({ tick: 0, type: 'program', channel: BASS, program: bassProgram });
	if (layers.arpeggio) events.push({ tick: 0, type: 'program', channel: HARMONY, program: padProgram });
	if (layers.pads > 0) events.push({ tick: 0, type: 'program', channel: PADS, program: padProgram });

	const scale = SCALES[scene.mood];
	//two octaves of the scale from the tonic, as semitone offsets
	const pool = [...scale, ...scale.map((step) => step + 12)];
	const progression = PROGRESSIONS[scene.mood];
	const tonic = 60 + scene.key;
	const note = (channel: number, pitch: number, tick: number, length: number, velocity: number): void => {
		events.push({ tick, type: 'noteOn', note: pitch, velocity, channel });
		events.push({ tick: tick + length, type: 'noteOff', note: pitch, velocity: 0, channel });
	};
	const chordTones = (root: number): number[] =>
		[0, 2, 4].map((degree) => {
			//the third and fifth of the chord, taken from the scale so they stay in the mood
			const rootStep = pool.findIndex((step) => step % 12 === root % 12);
			return pool[(Math.max(0, rootStep) + degree) % pool.length] % 12;
		});

	const melody = rng(1);
	const density = clamp(Math.round(scene.tension * 3 + (scene.mood === 'tense' ? 1 : 0)), 0, RHYTHMS.length - 1);
	let position = Math.floor(pool.length / 2);
	const phrases: { sixteenth: number; step: number; length: number }[][] = [];
	for (let bar = 0; bar < scene.bars; bar++) {
		const root = progression[bar % progression.length];
		const tones = chordTones(root);
		let phrase: { sixteenth: number; step: number; length: number }[];
		if (bar % 4 >= 2 && phrases[bar - 2]) {
			//the second half of the four bars answers the first, with a new ending
			phrase = phrases[bar - 2].map((entry) => ({ ...entry }));
			const last = phrase[phrase.length - 1];
			last.step = clamp(last.step + (melody.int(3) - 1) * 2, 0, pool.length - 1);
		} else {
			const rhythm =
				RHYTHMS[clamp(density + melody.int(2) - (melody.int(4) === 0 ? 1 : 0), 0, RHYTHMS.length - 1)];
			phrase = rhythm.map((sixteenth, index) => {
				const next = rhythm[index + 1] ?? 16;
				const strong = sixteenth % 8 === 0;
				if (strong && melody.float() < 0.7) {
					//a strong beat lands on a chord tone near where the line is
					const candidates = pool
						.map((step, at) => ({ step, at }))
						.filter(({ step }) => tones.includes(step % 12));
					const near = candidates.reduce((best, c) =>
						Math.abs(c.at - position) < Math.abs(best.at - position) ? c : best,
					);
					position = near.at;
				} else {
					position = clamp(position + melody.int(5) - 2, 0, pool.length - 1);
				}
				return {
					sixteenth,
					step: position,
					length: Math.max(1, next - sixteenth - (melody.float() < 0.3 ? 1 : 0)),
				};
			});
		}
		phrases.push(phrase);
		for (const entry of phrase) {
			const velocity = entry.sixteenth % 8 === 0 ? 90 : 78;
			note(
				MELODY,
				tonic + pool[entry.step],
				bar * BAR_TICKS + entry.sixteenth * 24,
				entry.length * 24 - 2,
				velocity,
			);
		}
	}

	const bass = rng(2);
	for (let bar = 0; bar < scene.bars; bar++) {
		const root = tonic - 12 + progression[bar % progression.length];
		if (layers.bass) {
			note(BASS, root, bar * BAR_TICKS, scene.tension > 0.6 ? 90 : 180, 84);
			const second = scene.tension > 0.6 ? [96, 192, 288] : [192];
			for (const at of second)
				if (at !== 96 || bass.float() < 0.7)
					note(BASS, bass.float() < 0.3 ? root + 7 : root, bar * BAR_TICKS + at, 90, 76);
		}
		const tones = chordTones(progression[bar % progression.length]);
		if (layers.arpeggio) {
			//one note at a time, climbing through the chord: a single voice that still outlines it
			for (let beat = 0; beat < 8; beat++) {
				note(
					HARMONY,
					tonic + tones[beat % tones.length] + (beat % 3 === 2 ? 12 : 0),
					bar * BAR_TICKS + beat * 48,
					44,
					56,
				);
			}
		}
		//spare voices hold the chord underneath the arpeggio
		for (const tone of tones.slice(0, layers.pads))
			note(PADS, tonic + tone - 12, bar * BAR_TICKS, BAR_TICKS - 6, 44);
		if (layers.drums) {
			note(DRUMS, 36, bar * BAR_TICKS, 20, 100);
			note(DRUMS, 36, bar * BAR_TICKS + 192, 20, 90);
			for (let eighth = 1; eighth < 8; eighth += 2) note(DRUMS, 42, bar * BAR_TICKS + eighth * 48, 12, 60);
		}
	}
	events.sort((a, b) => a.tick - b.tick || order(a) - order(b));
	const file: MidiFile = { ticksPerQuarter: TICKS_PER_QUARTER, events, loopStartTick: null };
	return {
		file,
		scene,
		bars: scene.bars,
		tempo,
		barSeconds: (60 / tempo) * 4,
		polyphony: maxPolyphony(file),
	};
}

/** a note-off sorts before a note-on at one tick, so a line that repeats a pitch never overlaps itself */
function order(event: MidiEvent): number {
	return event.type === 'noteOff' ? 0 : event.type === 'noteOn' ? 2 : 1;
}

/**
 * The most notes sounding at once in a file, counted over every channel. The contract that makes
 * a piece writable for a chip with a fixed number of voices.
 *
 * @example
 * ```ts
 * import { composeMusic, maxPolyphony } from '@datamoc/mwg/music';
 *
 * const music = composeMusic({ id: 'a', voices: 3 });
 * console.log(maxPolyphony(music.file) <= 3); // true
 * ```
 */
export function maxPolyphony(file: MidiFile): number {
	let sounding = 0;
	let most = 0;
	for (const event of file.events) {
		if (event.type === 'noteOn') most = Math.max(most, ++sounding);
		else if (event.type === 'noteOff') sounding = Math.max(0, sounding - 1);
	}
	return most;
}

/**
 * One piece per game state, all with the same key, tempo and length in bars, so they can be
 * swapped at a bar line without a jump: `AdaptiveMusic.load(name, stems, { barSeconds })` per
 * state, then `switchVersion(name, fade, 'bar')`. Each state overrides the base scene's
 * `mood`, `tension` and `voices` (the seed stays, so the states share their melodic outline).
 *
 * @example
 * ```ts
 * import { composeStates } from '@datamoc/mwg/music';
 *
 * const states = composeStates(
 * 	{ id: 'forest', seed: 3, mood: 'calm', tension: 0.2, key: 7, bars: 8, voices: 4 },
 * 	{ exploration: {}, combat: { mood: 'tense', tension: 0.9 }, victory: { mood: 'triumphant', tension: 0.4 } },
 * );
 * console.log(states.combat.barSeconds === states.exploration.barSeconds); // true
 * ```
 */
export function composeStates(
	base: Partial<MusicScene> & { id: string },
	states: Readonly<Record<string, Partial<Pick<MusicScene, 'mood' | 'tension' | 'voices'>>>>,
): Record<string, GeneratedMusic> {
	const shared = normalizeScene(base);
	const tempo = tempoOf(shared);
	return Object.fromEntries(
		Object.entries(states).map(([name, override]) => [
			name,
			composeMusic({ ...shared, ...override, id: shared.id, tempo }),
		]),
	);
}
