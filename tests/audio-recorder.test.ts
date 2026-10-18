import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioBus } from '../src/audio/Channels.ts';
import { AudioExport } from '../src/audio/AudioExport.ts';
import { OutputRecorder } from '../src/audio/Recorder.ts';
import { FakeAudioContext, FakeGain } from '../src/testing/FakeAudio.ts';
import { decodeWav } from '../src/audio/Wav.ts';

const block = (value: number, length = 256): Float32Array => new Float32Array(length).fill(value);

test('a recorder copies every block it is delivered and returns them as one take', () => {
	const context = new FakeAudioContext(8000);
	const tap = new FakeGain();
	const recorder = new OutputRecorder(context.asContext(), [tap as unknown as AudioNode], { bufferSize: 256 });
	const [processor] = context.processors;
	assert.equal(processor.connected, true);
	assert.deepEqual(tap.connections, [processor], 'the tapped node feeds the processor');
	const reused = block(0.25);
	processor.emit(reused, block(-0.25));
	reused.fill(9); //the browser reuses its buffer: what was recorded must not change
	processor.emit(block(0.5), block(-0.5));
	assert.equal(recorder.seconds, 512 / 8000);
	const take = recorder.stop();
	assert.equal(take.sampleRate, 8000);
	assert.equal(take.left.length, 512);
	assert.equal(take.left[0], 0.25);
	assert.equal(take.right[300], -0.5);
	assert.equal(take.truncated, false);
	assert.equal(processor.disconnected, true);
	assert.deepEqual(tap.connections, [], 'stopping unwires the tap');
	assert.equal(recorder.stop().left.length, 512, 'a second stop returns the same take');
});

test('a take stops by itself at its limit and says it was cut', () => {
	const context = new FakeAudioContext(1000);
	const recorder = new OutputRecorder(context.asContext(), [new FakeGain() as unknown as AudioNode], {
		maxSeconds: 0.5,
	});
	const [processor] = context.processors;
	processor.emit(block(1, 400), block(1, 400), 1000);
	assert.equal(recorder.finished, false);
	processor.emit(block(2, 400), block(2, 400), 1000);
	assert.equal(recorder.finished, true);
	processor.emit(block(3, 400), block(3, 400), 1000);
	const take = recorder.stop();
	assert.equal(take.left.length, 500, 'exactly the limit, the surplus left out');
	assert.equal(take.left[450], 2);
	assert.equal(take.truncated, true);
});

test('the bus records its master output into frames AudioExport can write', async () => {
	const context = new FakeAudioContext(8000);
	const bus = new AudioBus(context.asContext(), { load: () => Promise.resolve(null) });
	const recorder = bus.record({ maxSeconds: 5 });
	const [processor] = context.processors;
	processor.emit(block(0.4, 800), block(0.4, 800));
	const take = recorder.stop();
	const wav = await new AudioExport().export(take, { format: 'wav' });
	const decoded = decodeWav(wav);
	assert.equal(decoded.left.length, 800);
	assert.ok(Math.abs(decoded.left[10] - 0.4) < 1e-3);
});
