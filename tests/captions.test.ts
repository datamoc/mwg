import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Sound } from '../src/audio/Sound.ts';
import { onCaption, type CaptionEvent } from '../src/audio/Captions.ts';
import type { Playable } from '../src/audio/Playable.ts';

function fakeAudio(): Playable {
	return { play() {}, pause() {}, currentTime: 0, volume: 1, loop: false };
}

test('a Sound with a caption dispatches onCaption every time it plays', () => {
	const seen: CaptionEvent[] = [];
	const listener = (event: CaptionEvent) => { seen.push(event); };
	onCaption.add(listener);

	try {
		const sound = new Sound('door.wav', { create: fakeAudio, caption: 'a door creaks' });
		sound.play();
		sound.play();

		assert.deepEqual(seen, [{ text: 'a door creaks' }, { text: 'a door creaks' }]);
	} finally {
		onCaption.remove(listener);
	}
});

test('a Sound with no caption never dispatches onCaption', () => {
	let calls = 0;
	const listener = () => { calls++; };
	onCaption.add(listener);

	try {
		const sound = new Sound('blip.wav', { create: fakeAudio });
		sound.play();
		assert.equal(calls, 0);
	} finally {
		onCaption.remove(listener);
	}
});
