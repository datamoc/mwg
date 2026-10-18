/**
 * Generated game music: a scene described as data (mood, tension, key, seed, length, voices)
 * becomes a playable MIDI file, the same one every time. Renderer-free; it builds on `core`
 * (the seeded generator) and `audio` (the MIDI file shape and the seed mixing of data sound
 * effects), and what it makes plays through `renderMidiToBuffer`, a registered engine, or
 * `AdaptiveMusic` for bar-aligned switches between game states.
 */
export {
	MUSIC_GENERATOR_VERSION,
	MUSIC_MOODS,
	composeMusic,
	composeStates,
	maxPolyphony,
	normalizeScene,
} from './Compose.ts';
export type { GeneratedMusic, MusicMood, MusicScene } from './Compose.ts';
