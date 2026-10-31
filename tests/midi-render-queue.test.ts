import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSf3 } from './helpers/soundfont3.ts';
import {
	MidiRenderQueue,
	parseMidi,
	renderMidiToBuffer,
	renderMidiToBufferAsync,
	renderedMidiBytes,
	renderMidiStems,
	fitToBudget,
	registerMidiSynth,
	unregisterMidiSynth,
	onMidiSynthFallback,
	type MidiFile,
	type MidiSynth,
} from '../src/audio/index.ts';

const bytes = new Uint8Array([
	77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 77, 84, 114, 107, 0, 0, 0, 12, 0, 144, 60, 100, 96, 128, 60, 0, 0,
	255, 47, 0,
]);

function notes(note = 60): MidiFile {
	return {
		ticksPerQuarter: 96,
		loopStartTick: null,
		events: [
			{ tick: 0, type: 'noteOn', channel: 0, note, velocity: 100 },
			{ tick: 96, type: 'noteOff', channel: 0, note, velocity: 0 },
		],
	};
}

/** The game controls when it has spare time, without tests depending on real timers. */
function idleSlots(): { schedule: (start: () => void) => () => void; run: () => void; count: () => number } {
	const starts = new Set<() => void>();
	return {
		schedule(start) {
			starts.add(start);
			return () => {
				starts.delete(start);
			};
		},
		run() {
			const start = starts.values().next().value;
			assert.ok(start, 'one idle launch is pending');
			starts.delete(start);
			start();
		},
		count: () => starts.size,
	};
}

test('MIDI preparation waits for idle time and serializes tracks and authored notes', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const options = { sampleRate: 8000, maxDuration: 0.75 };
	try {
		const first = queue.prepare(bytes, options);
		const second = queue.prepare(notes(72), options);
		assert.equal(idle.count(), 1);
		assert.equal(queue.pendingCount, 2);
		assert.equal(queue.activeCount, 0);
		idle.run();
		assert.equal(queue.pendingCount, 1);
		assert.equal(queue.activeCount, 1);
		assert.equal(idle.count(), 0, 'the next track cannot launch while the first is rendering');
		assert.deepEqual(await first, renderMidiToBuffer(parseMidi(bytes), options));
		assert.equal(idle.count(), 1, 'the next track gets its own idle slot');
		idle.run();
		assert.deepEqual(await second, renderMidiToBuffer(notes(72), options));
		assert.equal(idle.count(), 0);
	} finally {
		queue.dispose();
	}
});

test('idle launches carry a timeout so a busy page cannot starve preparation forever', async () => {
	const scope = globalThis as { requestIdleCallback?: unknown; cancelIdleCallback?: unknown };
	const originalIdle = scope.requestIdleCallback;
	const originalCancel = scope.cancelIdleCallback;
	const launches: { start: () => void; timeout?: number }[] = [];
	scope.requestIdleCallback = (start: () => void, options?: { timeout?: number }) => {
		launches.push({ start, timeout: options?.timeout });
		return launches.length;
	};
	scope.cancelIdleCallback = () => {};
	try {
		const defaults = new MidiRenderQueue();
		const first = defaults.prepare(notes(), { sampleRate: 8000 });
		assert.equal(launches.length, 1);
		assert.equal(launches[0].timeout, 1000, 'the default idle wait is bounded at one second');
		launches[0].start();
		await first;
		defaults.dispose();

		const configured = new MidiRenderQueue({ idleTimeoutMs: 250 });
		const second = configured.prepare(notes(72), { sampleRate: 8000 });
		assert.equal(launches.length, 2);
		assert.equal(launches[1].timeout, 250, 'a game can shorten or lengthen the bounded idle wait');
		launches[1].start();
		await second;
		configured.dispose();
	} finally {
		scope.requestIdleCallback = originalIdle;
		scope.cancelIdleCallback = originalCancel;
	}
});

test('an idle timeout that cannot bound the wait is refused', () => {
	for (const idleTimeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => new MidiRenderQueue({ idleTimeoutMs }), /idle timeout/);
	}
});

test('pausing cancels a pending launch and resume schedules it once', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	try {
		const prepared = queue.prepare(notes(), { sampleRate: 8000 });
		queue.pause();
		assert.equal(idle.count(), 0);
		queue.resume();
		queue.resume();
		assert.equal(idle.count(), 1);
		idle.run();
		assert.equal((await prepared).sampleRate, 8000);
	} finally {
		queue.dispose();
	}
});

test('a paused queue lets its active render finish and holds subsequent work', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	try {
		const first = queue.prepare(notes(), { sampleRate: 8000 });
		const second = queue.prepare(notes(72), { sampleRate: 8000 });
		idle.run();
		queue.pause();
		await first;
		assert.equal(idle.count(), 0);
		queue.resume();
		idle.run();
		await second;
	} finally {
		queue.dispose();
	}
});

test('cancelling queued MIDI removes it before synthesis and preserves other work', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const controller = new AbortController();
	try {
		const cancelled = queue.prepare(notes(), { signal: controller.signal });
		const rejected = assert.rejects(cancelled, /not needed/);
		const kept = queue.prepare(notes(72), { sampleRate: 8000 });
		controller.abort(new Error('not needed'));
		await rejected;
		assert.equal(idle.count(), 1);
		idle.run();
		assert.deepEqual(await kept, renderMidiToBuffer(notes(72), { sampleRate: 8000 }));
	} finally {
		queue.dispose();
	}
});

test('cancelling active MIDI terminates its worker without reporting an engine fallback', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const controller = new AbortController();
	let fallbacks = 0;
	const fallback = (): void => {
		fallbacks++;
	};
	onMidiSynthFallback.add(fallback);
	registerMidiSynth(
		'queue:cancel',
		() => {
			throw new Error('main factory');
		},
		(sampleRate) => ({
			sampleRate,
			event() {},
			sysex() {},
			reset() {},
			render() {
				throw new Error('must not cause a fallback after cancellation');
			},
		}),
	);
	try {
		const ready = queue.prepare(notes(), { synth: 'queue:cancel', signal: controller.signal });
		const rejected = assert.rejects(ready, /cancel active/);
		idle.run();
		controller.abort(new Error('cancel active'));
		await rejected;
		assert.equal(fallbacks, 0);
		const next = queue.prepare(notes(), { sampleRate: 8000 });
		idle.run();
		await next;
	} finally {
		queue.dispose();
		onMidiSynthFallback.remove(fallback);
		unregisterMidiSynth('queue:cancel');
	}
});

test('disposing rejects queued and active work and prevents further preparations', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const active = queue.prepare(notes(), { sampleRate: 8000 });
	const pending = queue.prepare(notes(72));
	const rejectedActive = assert.rejects(active, { name: 'AbortError' });
	const rejectedPending = assert.rejects(pending, { name: 'AbortError' });
	idle.run();
	queue.dispose();
	queue.dispose();
	await Promise.all([rejectedActive, rejectedPending]);
	queue.resume();
	assert.equal(idle.count(), 0);
	await assert.rejects(queue.prepare(notes()), /disposed/);
});

test('a failed preparation does not prevent the next queued note sequence', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	try {
		const failure = assert.rejects(queue.prepare(new Uint8Array(0)), /MIDI/);
		const next = queue.prepare(notes(), { sampleRate: 8000 });
		idle.run();
		await failure;
		idle.run();
		await next;
	} finally {
		queue.dispose();
	}
});

test('background preparation refuses main-thread synth factories before scheduling', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const main = (): MidiSynth => {
		throw new Error('must not be called');
	};
	registerMidiSynth('queue:main', main);
	try {
		await assert.rejects(queue.prepare(notes(), { synth: main }), /worker factory/);
		await assert.rejects(queue.prepare(notes(), { synth: 'queue:main' }), /worker factory/);
		assert.equal(idle.count(), 0);
	} finally {
		queue.dispose();
		unregisterMidiSynth('queue:main');
	}
});

test('an already cancelled preparation neither parses input nor schedules work', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const controller = new AbortController();
	controller.abort(new Error('already cancelled'));
	try {
		await assert.rejects(queue.prepare(new Uint8Array(0), { signal: controller.signal }), /already cancelled/);
		await assert.rejects(
			renderMidiToBufferAsync(new Uint8Array(0), { signal: controller.signal }),
			/already cancelled/,
		);
		assert.equal(idle.count(), 0);
	} finally {
		queue.dispose();
	}
});

test('cancellation during SoundFont decoding frees the queue before the decoder answers', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	const controller = new AbortController();
	let began!: () => void;
	const decoding = new Promise<void>((resolve) => {
		began = resolve;
	});
	try {
		const abandoned = queue.prepare(notes(), {
			signal: controller.signal,
			soundFontBytes: buildSf3(0, 5, Buffer.from([3, 9, 9, 9, 9])),
			decode: () => {
				began();
				return new Promise<Int16Array>(() => {});
			},
		});
		const rejected = assert.rejects(abandoned, /abandon decoding/);
		const next = queue.prepare(notes(), { sampleRate: 8000 });
		idle.run();
		await decoding;
		controller.abort(new Error('abandon decoding'));
		await rejected;
		assert.equal(idle.count(), 1);
		idle.run();
		await next;
	} finally {
		queue.dispose();
	}
});

test('a registration changed while waiting cannot run a synth on the game thread', async () => {
	const idle = idleSlots();
	const queue = new MidiRenderQueue({ schedule: idle.schedule });
	registerMidiSynth(
		'queue:changed',
		() => {
			throw new Error('must not run');
		},
		() => {
			throw new Error('old worker');
		},
	);
	try {
		const preparation = queue.prepare(notes(), { synth: 'queue:changed' });
		const rejected = assert.rejects(preparation, /worker factory/);
		registerMidiSynth('queue:changed', () => {
			assert.fail('must not block the game thread');
		});
		idle.run();
		await rejected;
	} finally {
		queue.dispose();
		unregisterMidiSynth('queue:changed');
	}
});

test('first note and PCM bytes follow the rendered channels and shared buffers', async () => {
	const file = notes();
	file.events[0].tick = 96;
	file.events[1].tick = 192;
	const options = { sampleRate: 8000 };
	const rendered = renderMidiToBuffer(file, options);
	assert.equal(rendered.firstNoteTime, 0.5);
	assert.equal((await renderMidiToBufferAsync(file, options)).firstNoteTime, 0.5);
	assert.equal(renderedMidiBytes(rendered), rendered.left.byteLength + rendered.right.byteLength);
	const mono = fitToBudget(rendered, { mono: true });
	assert.equal(renderedMidiBytes(mono), mono.left.byteLength);
	assert.equal(fitToBudget(rendered, { maxSeconds: 0.25 }).firstNoteTime, null);
	const stems = renderMidiStems(file, { sounding: [0], silent: [1] }, options);
	assert.equal(stems.sounding.firstNoteTime, 0.5);
	assert.equal(stems.silent.firstNoteTime, null);
});
