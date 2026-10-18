import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AdaptiveMusic } from '../src/audio/AdaptiveMusic.ts';
import { renderMidiToBuffer } from '../src/audio/MidiRender.ts';
import {
	MUSIC_MOODS,
	composeMusic,
	composeStates,
	maxPolyphony,
	normalizeScene,
	type MusicScene,
} from '../src/music/index.ts';
import { FakeAudioContext } from '../src/testing/FakeAudio.ts';

const scene = (extra: Partial<MusicScene> = {}): MusicScene & { id: string } => ({
	id: 'harbour',
	seed: 7,
	mood: 'calm',
	tension: 0.4,
	key: 2,
	bars: 8,
	voices: 4,
	...extra,
});

test('the same scene gives the same notes, another seed or scene id gives other ones', () => {
	const a = composeMusic(scene());
	assert.deepEqual(composeMusic(scene()).file, a.file);
	assert.notDeepEqual(composeMusic(scene({ seed: 8 })).file.events, a.file.events);
	assert.notDeepEqual(composeMusic(scene({ id: 'cave' })).file.events, a.file.events);
});

test('the voice limit is kept for every mood, tension and count, without cutting a note', () => {
	for (const mood of MUSIC_MOODS) {
		for (const tension of [0, 0.35, 0.9]) {
			for (const voices of [1, 2, 3, 4, 5, 8]) {
				const music = composeMusic(scene({ mood, tension, voices, seed: voices * 31 }));
				assert.ok(
					music.polyphony <= voices && music.polyphony >= 1,
					`${mood} tension ${tension}: ${music.polyphony} notes at once for ${voices} voices`,
				);
				assert.equal(music.polyphony, maxPolyphony(music.file));
			}
		}
	}
	assert.equal(composeMusic(scene({ voices: 1 })).polyphony, 1, 'one voice is the melody alone');
});

test('a note-off always comes before the note-on that reuses its pitch, and every note ends inside the piece', () => {
	const music = composeMusic(scene({ bars: 6, voices: 6, tension: 0.8 }));
	const end = 6 * 384;
	const open = new Map<string, number>();
	for (const event of music.file.events) {
		if (event.type !== 'noteOn' && event.type !== 'noteOff') continue;
		const key = `${event.channel}:${event.note}`;
		if (event.type === 'noteOn') {
			assert.ok(!open.has(key), `${key} sounded twice at once`);
			open.set(key, event.tick);
		} else {
			assert.ok(open.delete(key), `${key} ended without starting`);
			assert.ok(event.tick <= end, 'ends within the bars');
		}
	}
	assert.equal(open.size, 0, 'no note is left hanging');
});

test('the melody stays in the mood scale and the tempo follows mood and tension', () => {
	const sad = composeMusic(scene({ mood: 'sad', key: 9, voices: 1 }));
	const minor = new Set([0, 2, 3, 5, 7, 8, 10].map((step) => (9 + step) % 12));
	const pitches = sad.file.events
		.filter((e) => e.type === 'noteOn')
		.map((e) => (e.type === 'noteOn' ? e.note % 12 : 0));
	assert.ok(pitches.length > 0 && pitches.every((pitch) => minor.has(pitch)), 'every melody note is in A minor');
	assert.ok(composeMusic(scene({ tension: 0.9 })).tempo > composeMusic(scene({ tension: 0.1 })).tempo);
	assert.equal(composeMusic(scene({ tempo: 120 })).barSeconds, 2);
});

test('the file renders to audio through the ordinary MIDI renderer', () => {
	const music = composeMusic(scene({ bars: 2 }));
	const audio = renderMidiToBuffer(music.file, { sampleRate: 8000 });
	assert.ok(audio.duration >= 2 * music.barSeconds);
	assert.ok(
		audio.left.some((value) => Math.abs(value) > 0.01),
		'it makes sound',
	);
});

test('states share key, tempo and length, so a bar-quantised switch lines up', () => {
	const states = composeStates(scene({ bars: 4 }), {
		exploration: {},
		combat: { mood: 'tense', tension: 0.9 },
		victory: { mood: 'triumphant', tension: 0.5, voices: 3 },
	});
	const bars = Object.values(states).map((state) => state.barSeconds);
	assert.ok(
		bars.every((seconds) => seconds === bars[0]),
		'one bar length',
	);
	assert.notDeepEqual(states.combat.file.events, states.exploration.file.events);
	assert.equal(states.victory.polyphony <= 3, true);

	const context = new FakeAudioContext(8000);
	const music = new AdaptiveMusic(context.asContext());
	for (const [name, state] of Object.entries(states)) {
		const rendered = renderMidiToBuffer(state.file, { sampleRate: 8000 });
		const frames = Math.ceil(4 * state.barSeconds * 8000);
		const buffer = context.createBuffer(2, frames, 8000) as unknown as AudioBuffer;
		buffer.getChannelData(0).set(rendered.left.subarray(0, frames));
		music.load(name, { all: buffer }, { barSeconds: state.barSeconds });
	}
	music.play({ levels: { all: 1 } });
	context.advance(0.3);
	music.switchVersion('combat', 0.5, 'bar');
	const started = context.sources.at(-1)!.startedAt;
	assert.equal(started, bars[0], 'the switch waits for the end of the first bar');
});

test('a scene read from a save or a link is made safe, unknown moods become calm', () => {
	assert.deepEqual(
		normalizeScene({
			id: 'x'.repeat(100),
			seed: -1,
			mood: 'furious' as never,
			tension: 9,
			key: -3,
			bars: 1000,
			voices: 0,
		}),
		{ id: 'x'.repeat(64), seed: 0xffffffff, mood: 'calm', tension: 1, key: 9, bars: 64, voices: 1 },
	);
	assert.equal(normalizeScene({ id: 'a', tempo: 10 }).tempo, 40);
	assert.doesNotThrow(() => composeMusic({ id: 'a', seed: NaN as never }));
});
