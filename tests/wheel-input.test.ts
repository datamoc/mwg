import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wheelActionFor, onWheel, type WheelInput } from '../src/core/Input.ts';

test('plain wheel (no modifier) resolves to scroll', () => {
	assert.equal(wheelActionFor({ ctrlKey: false, metaKey: false, shiftKey: false }), 'scroll');
});

test('shift+wheel resolves to scrollHorizontal', () => {
	assert.equal(wheelActionFor({ ctrlKey: false, metaKey: false, shiftKey: true }), 'scrollHorizontal');
});

test('ctrl+wheel resolves to zoom', () => {
	assert.equal(wheelActionFor({ ctrlKey: true, metaKey: false, shiftKey: false }), 'zoom');
});

test('cmd/meta+wheel also resolves to zoom, for a Mac keyboard', () => {
	assert.equal(wheelActionFor({ ctrlKey: false, metaKey: true, shiftKey: false }), 'zoom');
});

test('ctrl takes priority over shift when both are held', () => {
	assert.equal(wheelActionFor({ ctrlKey: true, metaKey: false, shiftKey: true }), 'zoom');
});

test('onWheel is a real Signal a game can subscribe to', () => {
	const seen: WheelInput[] = [];
	const listener = (input: WheelInput) => {
		seen.push(input);
	};
	onWheel.add(listener);
	try {
		onWheel.dispatch({ action: 'scroll', delta: 10 });
		assert.deepEqual(seen, [{ action: 'scroll', delta: 10 }]);
	} finally {
		onWheel.remove(listener);
	}
});
