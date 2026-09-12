import assert from 'node:assert/strict';
import test from 'node:test';
import { toClassicScript } from '../tools/classic-html.mjs';

test('rewrites a Vite-shaped module entry tag to a classic deferred script', () => {
	const html = '<!doctype html><html><body><script type="module" crossorigin src="/assets/game-abc123.js"></script></body></html>';
	const result = toClassicScript(html);
	assert.ok(result);
	assert.equal(result.src, '/assets/game-abc123.js');
	assert.equal(result.html, '<!doctype html><html><body><script defer src="/assets/game-abc123.js"></script></body></html>');
});

test('is order-independent between type and src attributes', () => {
	const html = '<script src="./game.js" type="module"></script>';
	const result = toClassicScript(html);
	assert.ok(result);
	assert.equal(result.src, './game.js');
});

test('returns null for an unbuilt dev template with no module script tag', () => {
	assert.equal(toClassicScript('<!doctype html><script src="/src/main.ts"></script>'), null);
	assert.equal(toClassicScript('<!doctype html><body>no script here</body>'), null);
});

test('returns null for a script tag that is already classic', () => {
	assert.equal(toClassicScript('<script defer src="./game.js"></script>'), null);
});
