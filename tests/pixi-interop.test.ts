import assert from 'node:assert/strict';
import test from 'node:test';
import {
	registerBuiltinPipes,
	TilingSprite,
	TilingSpritePipe,
	NineSliceSpritePipe,
} from '../src/two-d/pixi-interop.ts';

test('registerBuiltinPipes is safe to call more than once', () => {
	assert.doesNotThrow(() => {
		registerBuiltinPipes();
		registerBuiltinPipes();
	});
});

test('TilingSpritePipe/NineSliceSpritePipe are reachable without importing pixi.js directly', () => {
	assert.equal(typeof TilingSpritePipe, 'function');
	assert.equal(typeof NineSliceSpritePipe, 'function');
	assert.equal(typeof TilingSprite, 'function');
});
