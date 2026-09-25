import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurePage } from '../tools/benchmark-browser.mjs';

test('measurePage refuses too few frames before it starts a browser', async () => {
	await assert.rejects(() => measurePage({ url: 'file:///nowhere.html', frames: 10 }), /at least 30/);
});
