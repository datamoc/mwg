import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditEngines, benchEngine } from '../src/audio/Audit.ts';
import { registerMidiSynth, unregisterMidiSynth, type MidiSynth } from '../src/audio/MidiSynth.ts';

const RATE = 22050;

/** a one-voice synth: `shape` turns a phase (0 to 1) into a sample, `offset` shifts the note in semitones */
function toneSynth(shape: (phase: number) => number, level: number, offset = 0, dc = 0): MidiSynth {
	let hz = 0;
	let phase = 0;
	return {
		sampleRate: RATE,
		event(status, data1, data2) {
			const kind = status & 0xf0;
			if (kind === 0x90 && data2 > 0) hz = 440 * 2 ** ((data1 + offset - 69) / 12);
			else if (kind === 0x80 || kind === 0x90) hz = 0;
		},
		sysex() {},
		render(left, right, start, count) {
			for (let i = 0; i < count; i++) {
				const value = hz ? shape(phase) * level + dc : 0;
				left[start + i] += value;
				right[start + i] += value;
				phase = (phase + hz / RATE) % 1;
			}
		},
		reset() {
			hz = 0;
		},
	};
}

const sine = (phase: number): number => Math.sin(2 * Math.PI * phase);
const square = (phase: number): number => (phase < 0.5 ? 1 : -1);

test('a healthy engine passes; silence, clipping, a wrong pitch and a DC offset are each named', () => {
	registerMidiSynth('audit:good', () => toneSynth(sine, 0.5));
	registerMidiSynth('audit:silent', () => toneSynth(sine, 0));
	registerMidiSynth('audit:hot', () => toneSynth(square, 1.5));
	registerMidiSynth('audit:flat', () => toneSynth(sine, 0.5, 7));
	registerMidiSynth('audit:biased', () => toneSynth(sine, 0.3, 0, 0.2));
	try {
		const report = auditEngines({
			engines: ['audit:good', 'audit:silent', 'audit:hot', 'audit:flat', 'audit:biased'],
			programs: [0],
			notes: [57, 69],
			sampleRate: RATE,
		});
		const kinds = (engine: string): string[] =>
			report.findings.filter((f) => f.engine === engine).map((f) => f.kind);
		assert.equal(report.rendered, 10);
		assert.deepEqual(kinds('audit:good'), []);
		assert.deepEqual(kinds('audit:silent'), ['silent', 'silent']);
		assert.ok(kinds('audit:hot').includes('clipping'));
		assert.deepEqual(kinds('audit:flat'), ['pitch', 'pitch']);
		assert.ok(kinds('audit:biased').includes('dc-offset'));
	} finally {
		for (const name of ['good', 'silent', 'hot', 'flat', 'biased']) unregisterMidiSynth(`audit:${name}`);
	}
});

test('the benchmark holds every requested voice for the requested time and reports the real-time ratio', () => {
	let held = 0;
	let peak = 0;
	registerMidiSynth('audit:bench', () => {
		const synth = toneSynth(sine, 0.1);
		const event = synth.event.bind(synth);
		synth.event = (status, a, b) => {
			if ((status & 0xf0) === 0x90 && b > 0) peak = Math.max(peak, ++held);
			else if ((status & 0xf0) === 0x80) held--;
			event(status, a, b);
		};
		return synth;
	});
	try {
		const result = benchEngine({ engine: 'audit:bench', voices: 12, seconds: 2, sampleRate: RATE });
		assert.equal(peak, 12, 'twelve notes held at once');
		assert.equal(result.voices, 12);
		assert.ok(result.audioSeconds >= 2 && result.audioSeconds < 4, `${result.audioSeconds} s of audio`);
		assert.ok(result.ratio > 0 && result.ratio < 5);
		assert.equal(
			benchEngine({ engine: 'audit:bench', voices: 99, seconds: 1, sampleRate: RATE }).voices,
			16,
			'capped at 16',
		);
	} finally {
		unregisterMidiSynth('audit:bench');
	}
});

test('an engine that is not registered is one fallback finding, not one per note', () => {
	const report = auditEngines({ engines: ['audit:missing'], programs: [0, 1], notes: [60, 72], sampleRate: RATE });
	assert.equal(report.findings.length, 1);
	assert.equal(report.findings[0].kind, 'fallback');
	assert.match(report.findings[0].detail, /no MIDI engine named "audit:missing"/);
});

test('an engine that throws while rendering is reported as failed, and unpitched programs skip the pitch check', () => {
	registerMidiSynth('audit:broken', () => {
		const synth = toneSynth(sine, 0.5, 7);
		synth.render = () => {
			throw new Error('boom');
		};
		return synth;
	});
	registerMidiSynth('audit:effects', () => toneSynth(sine, 0.5, 7));
	try {
		const failed = auditEngines({ engines: ['audit:broken'], programs: [0], notes: [69], sampleRate: RATE });
		assert.deepEqual(
			failed.findings.map((f) => [f.kind, f.detail]),
			[['failed', 'boom']],
		);
		const effects = auditEngines({ engines: ['audit:effects'], programs: [120], notes: [69], sampleRate: RATE });
		assert.deepEqual(effects.findings, [], 'program 120 is a sound effect, whose pitch is not checked');
	} finally {
		unregisterMidiSynth('audit:broken');
		unregisterMidiSynth('audit:effects');
	}
});
