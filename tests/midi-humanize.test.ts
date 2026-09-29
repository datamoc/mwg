import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	GrooveConverter,
	GrooveExtractor,
	GrooveHumanizer,
	HumanizerFactory,
	LiteHumanizer,
	assertGrooveTemplate,
	humanizeMidi,
	subdivisionCount,
	type GrooveFormat,
	type GrooveTemplate,
	type HumanizeStyle,
	type HumanizerTier,
	type MidiEvent,
	type MidiFile,
	type MidiNoteEvent,
} from '../src/audio/index.ts';
import { MidiPlayer, scheduleMidi } from '../src/audio/Midi.ts';
import { detectOnsets } from '../src/audio/humanize/Onsets.ts';

/** 480 ppq cut into sixteenths, the grid every fixture below is written against */
const SIXTEENTH = 120;

function midiFile(events: MidiEvent[], ticksPerQuarter = 480): MidiFile {
	return { ticksPerQuarter, events, loopStartTick: null };
}

/**
 * A monophonic line of `count` notes `gap` ticks apart, each on its own pitch, so a test
 * can look a note up by pitch and compare its tick before and after without pairing
 * onsets by hand.
 */
function line(count: number, gap = SIXTEENTH, duration = 96, velocity = 96): MidiEvent[] {
	const events: MidiEvent[] = [];
	for (let i = 0; i < count; i++) {
		const tick = i * gap;
		const note = 40 + i;
		events.push({ type: 'noteOn', tick, note, velocity, channel: 0 });
		events.push({ type: 'noteOff', tick: tick + duration, note, velocity: 0, channel: 0 });
	}
	return events;
}

/** whether the event carries a pitch, which is the only kind a humanizing pass rewrites */
function isNoteEvent(event: MidiEvent): event is MidiNoteEvent {
	return event.type === 'noteOn' || event.type === 'noteOff';
}

/** every note-on's tick movement, matched by pitch: order changes are not the subject here */
function tickDeltas(input: MidiFile, output: MidiFile): number[] {
	const before = new Map<number, number>();
	for (const event of input.events) if (event.type === 'noteOn') before.set(event.note, event.tick);

	const deltas: number[] = [];
	for (const event of output.events) {
		if (event.type !== 'noteOn') continue;
		const previous = before.get(event.note);
		if (previous !== undefined) deltas.push(event.tick - previous);
	}
	return deltas;
}

function durationsOf(file: MidiFile): number[] {
	const open = new Map<string, number[]>();
	const durations: number[] = [];
	for (const event of file.events) {
		if (event.type !== 'noteOn' && event.type !== 'noteOff') continue;
		const key = `${event.channel}:${event.note}`;
		if (event.type === 'noteOn') {
			const queue = open.get(key);
			if (queue) queue.push(event.tick);
			else open.set(key, [event.tick]);
		} else {
			const on = open.get(key)?.shift();
			if (on !== undefined) durations.push(event.tick - on);
		}
	}
	return durations;
}

/** a full bar of 4/4 on a sixteenth grid, alternating a push and a lay-back */
function grooveTemplate(overrides: Partial<GrooveTemplate> = {}): GrooveTemplate {
	return {
		name: 'test-groove',
		timeSignature: [4, 4],
		ppq: 480,
		tempoBpm: 120,
		subdivision: '16n',
		offsets: Array.from({ length: subdivisionCount([4, 4], '16n') }, (_, index) => ({
			subdivisionIndex: index,
			timeOffsetTicks: index % 2 === 0 ? 6 : -4,
			velocityFactor: index % 3 === 0 ? 1.1 : 1,
		})),
		...overrides,
	};
}

function fakeAudioBuffer(samples: Float32Array, sampleRate = 44100): AudioBuffer {
	return {
		length: samples.length,
		sampleRate,
		numberOfChannels: 1,
		getChannelData: () => samples,
	} as unknown as AudioBuffer;
}

function ascii(text: string): number[] {
	return [...text].map((character) => character.charCodeAt(0) & 0x7f);
}

/** a well-formed SMF that is not a groove, for the reader's rejection path */
function plainMidi(): Uint8Array {
	const track = [0, 0xff, 0x03, 4, ...ascii('song'), 0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0xff, 0x2f, 0x00];
	return new Uint8Array([
		...ascii('MThd'),
		0,
		0,
		0,
		6,
		0,
		0,
		0,
		1,
		0x01,
		0xe0,
		...ascii('MTrk'),
		0,
		0,
		0,
		track.length,
		...track,
	]);
}

test('rule 1: only note events are rewritten; tempo, program, controller and bend pass through', async () => {
	const events: MidiEvent[] = [
		{ type: 'tempo', tick: 0, microsecondsPerQuarter: 500000 },
		{ type: 'program', tick: 0, channel: 0, program: 12 },
		{ type: 'control', tick: 0, channel: 0, controller: 7, value: 100 },
		...line(6),
		{ type: 'pitchBend', tick: 300, channel: 1, value: -123 },
		{ type: 'control', tick: 600, channel: 0, controller: 111, value: 0 },
	];
	const input = midiFile(events);
	const output = await humanizeMidi(input, { intensity: 1, seed: 4, timingVarianceMs: 12, velocityVariance: 20 });

	assert.equal(output.events.length, input.events.length);
	assert.equal(output.events.filter(isNoteEvent).length, input.events.filter(isNoteEvent).length);
	assert.equal(output.ticksPerQuarter, input.ticksPerQuarter);
	assert.equal(output.loopStartTick, input.loopStartTick);

	const others = (file: MidiFile): MidiEvent[] => file.events.filter((event) => !isNoteEvent(event));
	assert.deepEqual(others(output), others(input));
});

test('rule 2: velocity stays inside 1 to 127 however wide the spread is asked to be', async () => {
	const events: MidiEvent[] = [];
	for (let i = 0; i < 60; i++) {
		const note = 40 + (i % 30);
		events.push({ type: 'noteOn', tick: i * 60, note, velocity: i % 2 === 0 ? 127 : 1, channel: 0 });
		events.push({ type: 'noteOff', tick: i * 60 + 40, note, velocity: 0, channel: 0 });
	}
	const output = await humanizeMidi(midiFile(events), {
		intensity: 1,
		seed: 2,
		velocityVariance: 400,
		timingVarianceMs: 0,
	});

	for (const event of output.events) {
		if (event.type !== 'noteOn') continue;
		assert.ok(event.velocity >= 1 && event.velocity <= 127, `velocity ${event.velocity} left 1..127`);
	}
});

test('rule 3: a shift that would cross zero lands on zero instead of folding', async () => {
	const events: MidiEvent[] = [];
	for (let i = 0; i < 24; i++) {
		const note = 50 + (i % 12);
		events.push({ type: 'noteOn', tick: i, note, velocity: 90, channel: 0 });
		events.push({ type: 'noteOff', tick: i + 4, note, velocity: 0, channel: 0 });
	}
	const input = midiFile(events);
	const output = await humanizeMidi(input, { intensity: 1, seed: 5, timingVarianceMs: 1_000_000 });

	assert.ok(
		output.events.every((event) => event.tick >= 0),
		'no event may sit before tick 0',
	);
	//a note that started after zero and ended at zero proves the shift was bounded there
	assert.ok(
		output.events.some((event, index) => event.tick === 0 && input.events[index].tick > 0),
		'expected at least one note bounded onto tick 0',
	);
});

test('rule 4: a groove survives a MIDI round trip within a tick and a hundredth', async () => {
	const template = grooveTemplate({ tempoBpm: 133.33 });
	const converter = new GrooveConverter();

	const bytes = await converter.exportFormat(template, 'midi');
	assert.ok(bytes instanceof Uint8Array, 'MIDI export returns bytes');
	const back = await converter.importFormat(bytes, 'midi');

	assert.equal(back.name, template.name);
	assert.equal(back.subdivision, template.subdivision);
	assert.equal(back.ppq, template.ppq);
	assert.equal(back.tempoBpm, template.tempoBpm);
	assert.deepEqual(back.timeSignature, template.timeSignature);
	assert.equal(back.offsets.length, template.offsets.length);

	back.offsets.forEach((offset, index) => {
		const expected = template.offsets[index];
		const tolerance = Math.max(1, Math.abs(expected.timeOffsetTicks) * 0.01);
		assert.ok(
			Math.abs(offset.timeOffsetTicks - expected.timeOffsetTicks) <= tolerance,
			`slot ${index}: ${offset.timeOffsetTicks} vs ${expected.timeOffsetTicks}`,
		);
		assert.ok(
			Math.abs(offset.velocityFactor - expected.velocityFactor) <= 0.01,
			`slot ${index}: ${offset.velocityFactor} vs ${expected.velocityFactor}`,
		);
	});
});

test('rule 4: a groove survives a JSON round trip exactly', async () => {
	const template = grooveTemplate({ tempoBpm: 93.75 });
	//a second bar shape, to prove the signature and grid travel with the offsets
	template.timeSignature = [6, 8];
	template.subdivision = '8n';
	template.offsets = template.offsets.slice(0, 6).map((offset, index) => ({ ...offset, subdivisionIndex: index }));

	const converter = new GrooveConverter();
	const text = await converter.exportFormat(template, 'json');
	assert.equal(typeof text, 'string');
	assert.deepEqual(await converter.importFormat(text, 'json'), template);
});

test('rule 5: a seed makes the result reproducible, and a different seed does not', async () => {
	const input = midiFile(line(40));
	const first = await humanizeMidi(input, { intensity: 1, seed: 1234 });
	const again = await humanizeMidi(input, { intensity: 1, seed: 1234 });
	const other = await humanizeMidi(input, { intensity: 1, seed: 4321 });

	assert.deepEqual(first, again);
	assert.notDeepEqual(first, other);

	//without a seed the pass draws its own, so two runs need not agree
	const unseededA = await humanizeMidi(input, { intensity: 1, timingVarianceMs: 40 });
	const unseededB = await humanizeMidi(input, { intensity: 1, timingVarianceMs: 40 });
	assert.notDeepEqual(unseededA, unseededB);
});

test('rule 6: every note keeps its duration, template or no template', async () => {
	const input = midiFile(line(30));

	const lite = await humanizeMidi(input, { intensity: 1, seed: 8, timingVarianceMs: 30 });
	assert.deepEqual(durationsOf(lite), durationsOf(input));

	const groove = await humanizeMidi(input, {
		intensity: 1,
		seed: 8,
		timingVarianceMs: 30,
		grooveTemplate: grooveTemplate(),
	});
	assert.deepEqual(durationsOf(groove), durationsOf(input));
	assert.equal(durationsOf(groove).length, 30);
});

test('rule 7: events stay sorted by tick, and ties keep their input order', async () => {
	const noised = await humanizeMidi(midiFile(line(40, 60, 40)), {
		intensity: 1,
		seed: 6,
		timingVarianceMs: 25,
	});
	for (let i = 1; i < noised.events.length; i++)
		assert.ok(noised.events[i - 1].tick <= noised.events[i].tick, 'output is not sorted by tick');

	//two notes that share a slot and are shifted by the same amount must stay in file order
	const events: MidiEvent[] = [
		{ type: 'noteOn', tick: SIXTEENTH * 4, note: 70, velocity: 90, channel: 0 },
		{ type: 'noteOn', tick: SIXTEENTH * 4, note: 72, velocity: 90, channel: 0 },
		{ type: 'noteOff', tick: SIXTEENTH * 4 + 40, note: 70, velocity: 0, channel: 0 },
		{ type: 'noteOff', tick: SIXTEENTH * 4 + 40, note: 72, velocity: 0, channel: 0 },
	];
	const template = grooveTemplate();
	template.offsets[4] = { subdivisionIndex: 4, timeOffsetTicks: 9, velocityFactor: 1 };
	const shifted = await humanizeMidi(midiFile(events), {
		intensity: 1,
		timingVarianceMs: 0,
		velocityVariance: 0,
		grooveTemplate: template,
	});
	assert.deepEqual(
		shifted.events.filter(isNoteEvent).map((event) => event.note),
		[70, 72, 70, 72],
		'the two tied notes must come out in the order they went in',
	);
	assert.deepEqual(
		shifted.events.map((event) => event.tick),
		[489, 489, 529, 529],
		'both note-ons, and both note-offs by their own delta, land on slot 4 plus nine',
	);
});

test('rule 8: intensity 0 reproduces the input and never mutates it', async () => {
	const input = midiFile(line(24, 100, 60, 40));
	const before = JSON.stringify(input);

	const output = await humanizeMidi(input, {
		intensity: 0,
		seed: 99,
		timingVarianceMs: 50,
		velocityVariance: 50,
		style: 'jazz',
	});

	assert.deepEqual(output, input);
	assert.equal(JSON.stringify(input), before);
});

test('rule 9: initialize() can be called again without complaint, on both shipped tiers', async () => {
	const lite = new LiteHumanizer();
	await lite.initialize();
	await lite.initialize();

	const groove = new GrooveHumanizer();
	await groove.initialize();
	await groove.initialize();

	const fromFactory = await HumanizerFactory.create('lite');
	await fromFactory.initialize();
	assert.equal(fromFactory.tierName, 'lite');
	assert.ok(lite.approximateSizeMb <= 0.05, 'tier 1 must stay inside its 50 KB budget');
	assert.ok(groove.approximateSizeMb <= 0.5, 'tier 2 must stay inside its 500 KB budget');
});

test('humanizing actually moves notes, and the lite tier refuses a template it cannot apply', async () => {
	const input = midiFile(line(40));
	const output = await humanizeMidi(input, { intensity: 1, seed: 3, timingVarianceMs: 20 });
	assert.ok(
		tickDeltas(input, output).some((delta) => delta !== 0),
		'no note moved: the pass is a no-op',
	);

	await assert.rejects(
		new LiteHumanizer().process(input, { intensity: 1, grooveTemplate: grooveTemplate() }),
		/groove/,
	);
});

test('the factory names its tiers, and the magenta one fails by name', async () => {
	const lite = await HumanizerFactory.create('lite');
	assert.equal(lite.tierName, 'lite');
	assert.equal(lite.approximateSizeMb, 0.05);

	const groove = await HumanizerFactory.create('groove');
	assert.equal(groove.tierName, 'groove');
	assert.equal(groove.approximateSizeMb, 0.5);

	await assert.rejects(HumanizerFactory.create('magenta'), /not shipped/);
	await assert.rejects(HumanizerFactory.create('nope' as unknown as HumanizerTier), /unknown humanizer tier/);
	await assert.rejects(humanizeMidi(midiFile(line(2)), { tier: 'magenta', intensity: 1 }), /not shipped/);
});

test('humanizeMidi picks the tier from the request: a template means the groove tier', async () => {
	const input = midiFile(line(8));

	//a template without a tier must not land on the lite tier, which rejects one
	const withTemplate = await humanizeMidi(input, { intensity: 1, seed: 2, grooveTemplate: grooveTemplate() });
	assert.equal(withTemplate.events.length, input.events.length);

	//and naming the lite tier over a template is a caller error, reported as one
	await assert.rejects(
		humanizeMidi(input, { tier: 'lite', intensity: 1, grooveTemplate: grooveTemplate() }),
		/groove/,
	);

	const explicit = await humanizeMidi(input, { tier: 'groove', intensity: 1, seed: 2 });
	assert.equal(explicit.events.length, input.events.length);
});

test('the groove tier applies the template offsets and velocities scaled by intensity', async () => {
	const input = midiFile(line(8));
	const template = grooveTemplate();
	const options = { intensity: 1, timingVarianceMs: 0, velocityVariance: 0, grooveTemplate: template };

	const full = await humanizeMidi(input, options);
	assert.deepEqual(
		tickDeltas(input, full),
		[6, -4, 6, -4, 6, -4, 6, -4],
		'each note sits in its own slot, offset as the template says',
	);

	const half = await humanizeMidi(input, { ...options, intensity: 0.5 });
	assert.deepEqual(tickDeltas(input, half), [3, -2, 3, -2, 3, -2, 3, -2]);

	const velocities = full.events
		.filter((event): event is MidiNoteEvent => event.type === 'noteOn')
		.map((event) => event.velocity);
	assert.deepEqual(
		velocities,
		[106, 96, 96, 106, 96, 96, 106, 96],
		'slots 0, 3 and 6 carry the 1.1 velocity factor: round(96 * 1.1)',
	);
});

test('a template from another tempo warns once, and its offsets are rescaled in time', async () => {
	const input = midiFile(line(6));
	const warnings: string[] = [];
	const template = grooveTemplate({ tempoBpm: 140 });

	await humanizeMidi(input, {
		intensity: 1,
		timingVarianceMs: 0,
		velocityVariance: 0,
		grooveTemplate: template,
		onWarn: (message) => warnings.push(message),
	});

	assert.equal(warnings.length, 1, 'the mismatch is reported once, not per note');
	assert.match(warnings[0], /test-groove/);
	assert.match(warnings[0], /140/);
	assert.match(warnings[0], /120/);

	//6 ticks at 140 BPM is 5.357 ms, which is 5.14 ticks at 120: rounded to 5.
	//The lay-back slots go the same way: -4 ticks at 140 is -3.43 ticks at 120.
	const deltas = tickDeltas(
		input,
		await humanizeMidi(input, {
			intensity: 1,
			timingVarianceMs: 0,
			velocityVariance: 0,
			grooveTemplate: template,
			onWarn: () => {},
		}),
	);
	assert.deepEqual(deltas, [5, -3, 5, -3, 5, -3], "the template is rescaled into this file's tempo");
});

test('a style scales the spread instead of reshaping it', async () => {
	const input = midiFile(line(80, 60, 40));
	const spread = async (style: HumanizeStyle): Promise<number> => {
		const output = await humanizeMidi(input, { intensity: 1, seed: 11, style, velocityVariance: 0 });
		return Math.max(...tickDeltas(input, output).map(Math.abs));
	};

	const classical = await spread('classical');
	const jazz = await spread('jazz');
	assert.ok(classical < jazz, `classical (${classical}) should run tighter than jazz (${jazz})`);
	assert.ok(classical > 0, 'a style never switches the noise off entirely');
});

test('extractor Mode A: a played pass against a straight one recovers each slot median', async () => {
	const table = [10, -6, 4, -8];
	const reference: MidiEvent[] = [];
	const played: MidiEvent[] = [];
	for (let i = 0; i < 36; i++) {
		const tick = i * SIXTEENTH;
		reference.push({ type: 'noteOn', tick, note: 60, velocity: 80, channel: 0 });
		reference.push({ type: 'noteOff', tick: tick + 60, note: 60, velocity: 0, channel: 0 });

		//one deliberately flubbed note, still inside the matching threshold: the median
		//must ignore it where a mean would be dragged by it
		const delta = i === 32 ? 55 : table[i % 4];
		played.push({ type: 'noteOn', tick: tick + delta, note: 60, velocity: 100, channel: 0 });
		played.push({ type: 'noteOff', tick: tick + delta + 60, note: 60, velocity: 0, channel: 0 });
	}
	//too far from any reference note to be matched, so it must not reach a slot
	played.push({ type: 'noteOn', tick: 35 * SIXTEENTH + 200, note: 60, velocity: 100, channel: 0 });

	const template = await new GrooveExtractor().extractFromMidiPair(midiFile(reference), midiFile(played), '16n');

	assert.equal(template.name, 'extracted');
	assert.equal(template.subdivision, '16n');
	assert.equal(template.ppq, 480);
	assert.equal(template.offsets.length, 16);
	assert.deepEqual(
		template.offsets.map((offset) => offset.timeOffsetTicks),
		[10, -6, 4, -8, 10, -6, 4, -8, 10, -6, 4, -8, 10, -6, 4, -8],
	);
	assert.ok(
		template.offsets.every((offset) => Math.abs(offset.velocityFactor - 1.25) < 1e-9),
		'every slot played 100 over a reference of 80',
	);
	assert.ok(template.offsets[12].timeOffsetTicks !== 55, 'the flubbed note must not have pulled slot 4 with it');
});

test('extractor Mode B: one file alone gives back its residuals against its own grid', async () => {
	const deltas = [5, -3, 0, 12, -7, 2, 9, -1, 0, 4, -6, 3, 8, -2, 1, -5];
	const events: MidiEvent[] = [{ type: 'tempo', tick: 0, microsecondsPerQuarter: 461538 }];
	deltas.forEach((delta, index) => {
		const tick = index * SIXTEENTH + delta;
		const velocity = 64 + (index % 5) * 8;
		events.push({ type: 'noteOn', tick, note: 40 + index, velocity, channel: 0 });
		events.push({ type: 'noteOff', tick: tick + 60, note: 40 + index, velocity: 0, channel: 0 });
	});

	const template = await new GrooveExtractor().extractFromSingleMidi(midiFile(events), '16n');

	assert.deepEqual(
		template.offsets.map((offset) => offset.timeOffsetTicks),
		deltas,
		'one note per slot: its residual is that slot offset',
	);
	assert.equal(template.tempoBpm, 130, 'the tempo comes off the file, not off a default');
	assert.equal(template.ppq, 480);

	//the typical velocity is the median over all notes, which is 80 for this shape
	template.offsets.forEach((offset, index) => {
		const velocity = 64 + (index % 5) * 8;
		assert.ok(Math.abs(offset.velocityFactor - velocity / 80) < 1e-9, `slot ${index}`);
	});
});

test('extractor Mode C: clicks on the grid extract a grid, and silence refuses to', async () => {
	const sampleRate = 44100;
	const samples = new Float32Array(Math.round(sampleRate * 0.9));
	for (let i = 0; i < 8; i++) {
		//16th notes at 120 BPM: 125 ms apart, which is exactly 120 ticks at ppq 480
		const at = Math.round(i * 0.125 * sampleRate);
		for (let k = 0; k < 6; k++) samples[at + k] = k < 3 ? 1 : -1;
	}

	const template = await new GrooveExtractor().extractFromAudioBuffer(fakeAudioBuffer(samples), '16n', 120);
	assert.equal(template.ppq, 480);
	assert.equal(template.tempoBpm, 120);
	assert.equal(template.subdivision, '16n');
	assert.equal(template.offsets.length, 16);
	assert.ok(
		template.offsets.every((offset) => Math.abs(offset.timeOffsetTicks) <= 12),
		`on-grid clicks should read as no offset, got ${template.offsets.map((o) => o.timeOffsetTicks)}`,
	);
	assert.ok(
		template.offsets.every((offset) => offset.velocityFactor === 1),
		'audio carries no velocity to recover',
	);

	await assert.rejects(
		new GrooveExtractor().extractFromAudioBuffer(fakeAudioBuffer(new Float32Array(sampleRate)), '16n', 120),
		/no onsets detected/,
	);
	await assert.rejects(new GrooveExtractor().extractFromAudioBuffer(fakeAudioBuffer(samples), '16n', 0), /tempoBpm/);
});

test('onset detection places clicks and leaves a steady tone alone', () => {
	const sampleRate = 44100;
	const samples = new Float32Array(sampleRate);
	const expected = [0.05, 0.175, 0.3, 0.425];
	for (const seconds of expected) {
		const at = Math.round(seconds * sampleRate);
		for (let i = 0; i < 8; i++) samples[at + i] = i < 4 ? 1 : -1;
	}

	const found = detectOnsets(samples, sampleRate);
	assert.equal(found.length, expected.length, `found ${found.length} of ${expected.length}`);
	found.forEach((seconds, index) => {
		assert.ok(
			Math.abs(seconds - expected[index]) < 0.004,
			`onset ${index} at ${seconds}s, wanted ${expected[index]}s`,
		);
	});

	const tone = new Float32Array(sampleRate / 2);
	for (let i = 0; i < tone.length; i++) tone[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
	//faded out rather than cut off: an abrupt stop is a real attack, and finding it is right
	const fade = 4000;
	for (let i = 0; i < fade; i++) tone[tone.length - 1 - i] *= i / fade;
	const steady = detectOnsets(tone, sampleRate);
	assert.ok(
		steady.every((seconds) => seconds < 0.05),
		`a steady tone reported onsets after its start: ${steady.join(', ')}`,
	);
});

test('converter: the proprietary formats and unknown ones fail by name', async () => {
	const converter = new GrooveConverter();
	const template = grooveTemplate();

	for (const format of ['ableton-agr', 'reaper-groove'] as const) {
		await assert.rejects(converter.exportFormat(template, format), /not shipped/);
		await assert.rejects(converter.importFormat('anything', format), /not shipped/);
	}

	await assert.rejects(converter.exportFormat(template, 'nope' as unknown as GrooveFormat), /unknown groove format/);
	await assert.rejects(converter.importFormat('{}', 'nope' as unknown as GrooveFormat), /unknown groove format/);
});

test('converter: the MIDI encoding enforces its bounds rather than rounding past them', async () => {
	const converter = new GrooveConverter();

	const tooFar = grooveTemplate();
	tooFar.offsets[3] = { subdivisionIndex: 3, timeOffsetTicks: SIXTEENTH, velocityFactor: 1 };
	await assert.rejects(converter.exportFormat(tooFar, 'midi'), /anchor/);

	const tooLoud = grooveTemplate();
	tooLoud.offsets[0] = { subdivisionIndex: 0, timeOffsetTicks: 0, velocityFactor: 2 };
	await assert.rejects(converter.exportFormat(tooLoud, 'midi'), /velocityFactor/);
});

test('converter: a MIDI that is not a groove, and bytes that are not a MIDI, say so', async () => {
	const converter = new GrooveConverter();

	await assert.rejects(converter.importFormat(plainMidi(), 'midi'), /mwg-groove/);
	await assert.rejects(converter.importFormat('this is not a file', 'midi'), /MThd/);
	await assert.rejects(converter.importFormat(new Uint8Array([1, 2, 3]), 'midi'), /truncated/);

	const truncated = (await converter.exportFormat(grooveTemplate(), 'midi')) as Uint8Array;
	await assert.rejects(converter.importFormat(truncated.slice(0, 20), 'midi'), /truncated|MThd/);

	const hole = grooveTemplate();
	hole.offsets = hole.offsets.slice(0, 15);
	await assert.rejects(converter.importFormat(JSON.stringify(hole), 'json'), /slots/);
	await assert.rejects(converter.importFormat('not json', 'json'), /valid JSON/);
});

test('assertGrooveTemplate rejects a template whose slots do not describe one grid', () => {
	const template = grooveTemplate();
	assertGrooveTemplate(template);

	assert.throws(() => assertGrooveTemplate({ ...template, offsets: template.offsets.slice(1) }), /slots/);
	assert.throws(
		() =>
			assertGrooveTemplate({
				...template,
				offsets: template.offsets.map((offset, index) =>
					index === 0 ? { ...offset, subdivisionIndex: 1 } : offset,
				),
			}),
		/in order/,
	);
	assert.throws(
		() =>
			assertGrooveTemplate({
				...template,
				offsets: template.offsets.map((offset, index) =>
					index === 0 ? { ...offset, timeOffsetTicks: 0.5 } : offset,
				),
			}),
		/fractional/,
	);
	assert.throws(() => assertGrooveTemplate({ ...template, timeSignature: [4, 7] }), /power of two/);
	assert.throws(() => assertGrooveTemplate({ ...template, ppq: 0 }), /ppq/);
	assert.throws(() => assertGrooveTemplate({ ...template, tempoBpm: 0 }), /tempoBpm/);
	assert.throws(() => assertGrooveTemplate({ ...template, name: '' }), /name/);
	assert.throws(
		() => assertGrooveTemplate({ ...template, subdivision: '4n' as GrooveTemplate['subdivision'] }),
		/subdivision/,
	);
});

test('subdivisionCount is the one source of slots per bar, and refuses a grid that does not tile', () => {
	assert.equal(subdivisionCount([4, 4], '8n'), 8);
	assert.equal(subdivisionCount([4, 4], '16n'), 16);
	assert.equal(subdivisionCount([4, 4], '32n'), 32);
	assert.equal(subdivisionCount([6, 8], '8n'), 6);
	assert.equal(subdivisionCount([3, 4], '8n'), 6);
	assert.throws(() => subdivisionCount([1, 3], '16n'), /whole slots/);
});

test('MidiPlayer.create humanizes before it schedules', async () => {
	const input = midiFile(line(10));
	const raw = new MidiPlayer(input).duration;

	const untouched = await MidiPlayer.create(input);
	assert.equal(untouched.duration, raw, 'create without options plays the file as written');

	const flat = await MidiPlayer.create(input, { humanize: { intensity: 0, seed: 1 } });
	assert.equal(flat.duration, raw, 'intensity 0 humanizes to nothing at all');

	const played = await MidiPlayer.create(input, {
		humanize: { intensity: 1, seed: 1, timingVarianceMs: 60, velocityVariance: 0 },
	});
	assert.notEqual(played.duration, raw, 'the scheduled performance should differ once notes move');
	assert.equal(scheduleMidi(input).length, 10, 'the source file was left alone to schedule from');
});
