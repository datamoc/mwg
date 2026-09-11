import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skins } from '../src/two-d/ui/Skins.ts';

/**
 * Skins (item 263): per-widget, per-state looks looked up by name. The whole value is the fallback
 * chain, so the order is what is pinned - a widget's own state, its idle look, then the wildcard's
 * state and idle look - and that an unknown widget resolves to an empty skin rather than throwing.
 */

test('a defined skin resolves for its own state', () => {
	const skins = new Skins();
	skins.define('button', 'idle', { background: 0x101018 });
	skins.define('button', 'pressed', { background: 0xffe680 });

	assert.deepEqual(skins.resolve('button', 'idle'), { background: 0x101018 });
	assert.deepEqual(skins.resolve('button', 'pressed'), { background: 0xffe680 });
});

test('a state a widget did not define falls back to its idle look', () => {
	const skins = new Skins();
	skins.define('button', 'idle', { text: 0xffffff });
	assert.deepEqual(skins.resolve('button', 'disabled'), { text: 0xffffff });
});

test('the wildcard fills in a widget with nothing of its own', () => {
	const skins = new Skins();
	skins.define('*', 'idle', { background: 0x101018, text: 0xe8e8f0 });
	skins.define('*', 'hover', { background: 0x20202c });

	assert.deepEqual(skins.resolve('label', 'idle'), { background: 0x101018, text: 0xe8e8f0 });
	assert.deepEqual(skins.resolve('label', 'hover'), { background: 0x20202c });
});

test('a widget beats the wildcard, state for state', () => {
	const skins = new Skins();
	skins.define('*', 'idle', { background: 0x101018, text: 0xe8e8f0 });
	skins.define('button', 'pressed', { background: 0xffe680, text: 0x101018 });

	assert.deepEqual(skins.resolve('button', 'pressed'), { background: 0xffe680, text: 0x101018 });
	assert.deepEqual(skins.resolve('button', 'idle'), { background: 0x101018, text: 0xe8e8f0 });
	assert.equal(skins.resolve('button', 'pressed').border, undefined, 'fields not set stay unset');
});

test('an unknown widget with no wildcard resolves to an empty skin', () => {
	const skins = new Skins();
	skins.define('button', 'idle', { background: 0x101018 });
	assert.deepEqual(skins.resolve('scrollbar', 'hover'), {});
});

test('defining a state again merges rather than replacing', () => {
	const skins = new Skins();
	skins.define('button', 'idle', { background: 0x101018, text: 0xffffff });
	skins.define('button', 'idle', { text: 0xff0000 });
	assert.deepEqual(skins.resolve('button', 'idle'), { background: 0x101018, text: 0xff0000 });
});

test('from reads a bare skin as idle and a state map as one look per state', () => {
	const skins = Skins.from({
		label: { text: 0xe8e8f0 },
		button: { idle: { background: 0x101018 }, pressed: { background: 0xffe680 } },
	});

	assert.deepEqual(skins.resolve('label', 'idle'), { text: 0xe8e8f0 });
	assert.deepEqual(skins.resolve('label', 'hover'), { text: 0xe8e8f0 }, 'the bare skin is the fallback');
	assert.deepEqual(skins.resolve('button', 'pressed'), { background: 0xffe680 });
});

test('statesOf lists a widget own states without counting the wildcard', () => {
	const skins = new Skins();
	skins.define('button', 'idle', {});
	skins.define('button', 'pressed', {});
	skins.define('*', 'hover', {});

	assert.deepEqual(skins.statesOf('button'), ['idle', 'pressed']);
	assert.deepEqual(skins.statesOf('label'), []);
	assert.equal(skins.has('button'), true);
	assert.deepEqual(skins.widgets().sort(), ['*', 'button']);
});
