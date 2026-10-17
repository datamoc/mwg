import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioBus } from '../src/audio/Channels.ts';
import { onCaption, type CaptionEvent } from '../src/audio/Captions.ts';
import { AudioListener, SoundSource } from '../src/audio/Positional.ts';
import {
	SfxArbiter,
	SfxBank,
	SfxSound,
	sfxSeed,
	type SfxBackend,
	type SfxDefinition,
	type SfxPlayOptions,
	type SfxVoice,
} from '../src/audio/Sfx.ts';
import { FakeAudioContext, FakeBlockSource } from '../src/testing/FakeAudio.ts';

/** a backend that records each play and lets the test end a voice by hand */
function recordingBackend(refuse = false): SfxBackend & {
	plays: { id: string; options: SfxPlayOptions }[];
	voices: (SfxVoice & { end(): void; stops: number })[];
} {
	const plays: { id: string; options: SfxPlayOptions }[] = [];
	const voices: (SfxVoice & { end(): void; stops: number })[] = [];
	return {
		plays,
		voices,
		play(definition: SfxDefinition, options: SfxPlayOptions): SfxVoice | null {
			if (refuse) return null;
			plays.push({ id: definition.id, options });
			const voice = {
				active: true,
				stops: 0,
				stop() {
					voice.active = false;
					voice.stops++;
				},
				end() {
					voice.active = false;
				},
			};
			voices.push(voice);
			return voice;
		},
	};
}

test('the same id on the same frame always gets the same seed, any other differs', () => {
	assert.equal(sfxSeed('arrow', 120), sfxSeed('arrow', 120));
	assert.notEqual(sfxSeed('arrow', 120), sfxSeed('arrow', 121));
	assert.notEqual(sfxSeed('arrow', 120), sfxSeed('hit', 120));
	assert.notEqual(sfxSeed('arrow', 120, 0), sfxSeed('arrow', 120, 1));
	assert.ok(Number.isInteger(sfxSeed('x', 0)) && sfxSeed('x', 0) >= 0);
});

test('an effect given by id is looked up in the bank, a missing one is a named error', () => {
	const bank = new SfxBank([{ id: 'arrow', priority: 5 }]);
	assert.deepEqual(bank.ids(), ['arrow']);
	assert.throws(() => new SfxSound(recordingBackend(), 'ghost', { bank }), /no sound effect "ghost"/);
	assert.throws(() => new SfxSound(recordingBackend(), 'arrow'), /needs a bank/);
	assert.throws(() => bank.define({ id: '' }), /needs an id/);
});

test('a play hands the backend the mix, the pitch and a seed from the game frame', () => {
	const backend = recordingBackend();
	let frame = 7;
	const sound = new SfxSound(backend, { id: 'arrow', retrigger: 'layer' }, { frame: () => frame, volume: 0.5 });
	assert.equal(sound.play(0.8, 1.2, -0.25), true);
	assert.equal(sound.play(0.8, 1.2, -0.25), true);
	frame = 8;
	sound.play();
	const [first, second, third] = backend.plays.map((p) => p.options);
	assert.equal(first.gain, 0.4);
	assert.equal(first.pitch, 1.2);
	assert.equal(first.pan, -0.25);
	assert.equal(first.seed, sfxSeed('arrow', 7, 0));
	assert.equal(second.seed, sfxSeed('arrow', 7, 1), 'a second play in the same frame gets the next ordinal');
	assert.equal(third.seed, sfxSeed('arrow', 8, 0));
	assert.equal(sound.plays, 3);
});

test('the retrigger rule decides what a second play does while the first sounds', () => {
	const restart = recordingBackend();
	const a = new SfxSound(restart, { id: 'a', retrigger: 'restart' });
	a.play();
	a.play();
	assert.equal(restart.voices[0].stops, 1, 'the first voice was cut');
	assert.equal(restart.voices.length, 2);

	const ignore = recordingBackend();
	const b = new SfxSound(ignore, { id: 'b', retrigger: 'ignore' });
	assert.equal(b.play(), true);
	assert.equal(b.play(), false);
	ignore.voices[0].end();
	assert.equal(b.play(), true, 'allowed again once the first finished');

	const layer = recordingBackend();
	const c = new SfxSound(layer, { id: 'c', retrigger: 'layer' });
	c.play();
	c.play();
	assert.equal(c.activeVoices, 2);
});

test('the caption fires from the definition or the option, and only when something played', () => {
	const seen: CaptionEvent[] = [];
	const listener = (event: CaptionEvent): void => {
		seen.push(event);
	};
	onCaption.add(listener);
	try {
		new SfxSound(recordingBackend(), { id: 'a', caption: 'an arrow flies' }).play();
		new SfxSound(recordingBackend(), { id: 'b' }, { caption: 'a thud' }).play();
		new SfxSound(recordingBackend(true), { id: 'c', caption: 'never heard' }).play();
		assert.deepEqual(
			seen.map((e) => e.text),
			['an arrow flies', 'a thud'],
		);
	} finally {
		onCaption.remove(listener);
	}
});

test('suspend cuts what sounds and silences later plays until resume', () => {
	const backend = recordingBackend();
	const sound = new SfxSound(backend, { id: 'a', retrigger: 'layer' });
	sound.play();
	sound.suspend();
	assert.equal(backend.voices[0].stops, 1);
	assert.equal(sound.play(), false);
	assert.equal(sound.isSuspended, true);
	sound.resume();
	assert.equal(sound.play(), true);
});

test('the arbiter cuts the oldest lowest-priority voice for an equal or higher one and refuses a lower one', () => {
	const arbiter = new SfxArbiter({ maxVoices: 2 });
	const cut: string[] = [];
	const a = arbiter.request(2, () => cut.push('a'));
	arbiter.request(2, () => cut.push('b'));
	assert.ok(a);
	assert.equal(
		arbiter.request(1, () => cut.push('low')),
		null,
		'below everything sounding',
	);
	assert.ok(
		arbiter.request(2, () => cut.push('c')),
		'equal priority wins the tie',
	);
	assert.deepEqual(cut, ['a'], 'the oldest of the lowest priority was cut');
	assert.ok(arbiter.request(9, () => cut.push('d')));
	assert.deepEqual(cut, ['a', 'b']);
	assert.equal(arbiter.active, 2);
	a.release();
	assert.equal(arbiter.active, 2, 'releasing a cut voice changes nothing');
});

test('SfxSounds sharing an arbiter share one pool, and a finished voice frees its slot', () => {
	const arbiter = new SfxArbiter({ maxVoices: 1 });
	const backend = recordingBackend();
	const low = new SfxSound(backend, { id: 'low', priority: 1 }, { arbiter });
	const high = new SfxSound(backend, { id: 'high', priority: 5 }, { arbiter });
	assert.equal(low.play(), true);
	assert.equal(high.play(), true, 'a higher priority cuts the sounding one');
	assert.equal(backend.voices[0].stops, 1);
	assert.equal(low.play(), false, 'a lower priority is refused while the pool is full');
	backend.voices[1].end();
	assert.equal(low.play(), true, 'finished voices are pruned and free the slot');
});

test('a backend with no voice to give is not an error and returns the slot', () => {
	const arbiter = new SfxArbiter({ maxVoices: 1 });
	const sound = new SfxSound(recordingBackend(true), { id: 'a' }, { arbiter });
	assert.equal(sound.play(), false);
	assert.equal(arbiter.active, 0);
});

test('a SoundSource attenuates and pans an SfxSound from where the listener stands', () => {
	const backend = recordingBackend();
	const sound = new SfxSound(backend, { id: 'arrow' });
	const source = new SoundSource(sound, { x: 0, y: 10, refDistance: 5, maxDistance: 100 });
	const listener = new AudioListener({ x: 0, y: 0, facing: 0 });
	const gain = source.playFor(listener);
	assert.equal(gain, 0.5);
	assert.equal(backend.plays[0].options.gain, 0.5);
	assert.equal(backend.plays[0].options.pan, 1, 'to the listener right when facing east');
	assert.equal(source.playFor({ x: 0, y: 1000 }), 0, 'out of earshot plays nothing');
});

test('the bus asks the shared arbiter for a slot when a sound effect plays', async () => {
	const context = new FakeAudioContext();
	const buffer = context.createBuffer(2, 8000, 8000) as unknown as AudioBuffer;
	const arbiter = new SfxArbiter({ maxVoices: 1 });
	const bus = new AudioBus(context.asContext(), { load: () => Promise.resolve({ buffer }), arbiter });
	await bus.playSe({ name: 'a', priority: 5 });
	await bus.playSe({ name: 'b', priority: 1 });
	assert.equal(context.sources.length, 1, 'the lower priority effect was refused');
	await bus.playSe({ name: 'c', priority: 9 });
	assert.equal(context.sources.length, 2);
	assert.equal(context.sources[0].stopped, true, 'the first effect was cut');
	assert.equal(arbiter.active, 1);
	context.advance(2);
	assert.equal(arbiter.active, 0, 'an effect that ends frees its slot');
});

test('a saved synthesised track keeps its content id, engine and exact frame, and the loader sees them on restore', async () => {
	const context = new FakeAudioContext();
	const source = new FakeBlockSource({ seconds: 60 });
	const requests: unknown[] = [];
	const bus = new AudioBus(context.asContext(), {
		load: () => Promise.resolve(null),
		stream: (_kind, _name, loadContext) => {
			requests.push(loadContext.track);
			return Promise.resolve({ source });
		},
	});
	await bus.playBgm({ name: 'tune', contentId: 'tune@1.0.0#abc123', engine: 'retro:mt32' });
	for (let i = 0; i < 6; i++) {
		context.advance(0.5);
		bus.streamChannel('bgm').pump();
	}
	context.advance(0.02);
	const saved = bus.snapshot();
	assert.equal(saved.bgm?.contentId, 'tune@1.0.0#abc123');
	assert.equal(saved.bgm?.engine, 'retro:mt32');
	assert.ok(saved.bgm?.frame !== undefined && Math.abs(saved.bgm.frame - 24000) <= 800);

	const restored = new AudioBus(new FakeAudioContext().asContext(), {
		load: () => Promise.resolve(null),
		stream: (_kind, _name, loadContext) => {
			requests.push(loadContext.track);
			return Promise.resolve({ source: new FakeBlockSource({ seconds: 60 }) });
		},
	});
	restored.restore(JSON.parse(JSON.stringify(saved)));
	await Promise.resolve();
	await Promise.resolve();
	const seen = requests.at(-1) as { contentId?: string; engine?: string; frame?: number };
	assert.equal(seen.contentId, 'tune@1.0.0#abc123');
	assert.equal(seen.engine, 'retro:mt32');
	assert.equal(seen.frame, saved.bgm?.frame);
});

test('junk in the optional save fields is dropped rather than stored', async () => {
	const context = new FakeAudioContext();
	const bus = new AudioBus(context.asContext(), { load: () => Promise.resolve(null) });
	await bus.playBgm({ name: 'x', contentId: 5 as unknown as string, frame: -4 });
	const track = bus.snapshot().bgm;
	assert.equal(track, null, 'nothing loaded, nothing playing');
	await bus.playBgm({ name: 'y', frame: Number.NaN });
});
