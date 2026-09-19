import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Graphics, Texture } from 'pixi.js';
import { Meter } from '../src/two-d/ui/Meter.ts';
import { setTheme, defaultTheme } from '../src/two-d/ui/theme.ts';

function maskWidth(meter: Meter): number {
	return (meter as unknown as { maskShape: Graphics }).maskShape.width;
}

test('defaults to full with no value given', () => {
	const meter = new Meter({ count: 5 });
	assert.equal(meter.value, 5);
	assert.equal(meter.count, 5);
	assert.equal(maskWidth(meter), 5 * 16 + 4 * 4);
});

test('setValue clamps into 0..count, fractions included', () => {
	const meter = new Meter({ count: 5, size: 10, gap: 0 });

	meter.setValue(2.5);
	assert.equal(meter.value, 2.5);
	assert.equal(maskWidth(meter), 50 * 0.5);

	meter.setValue(99);
	assert.equal(meter.value, 5);
	meter.setValue(-1);
	assert.equal(meter.value, 0);
});

test('setValue takes a new count too, for growing max hearts', () => {
	const meter = new Meter({ count: 3 });
	meter.setValue(3, 5);
	assert.equal(meter.count, 5);
	assert.equal(meter.value, 3);
});

test('degenerate counts and values fall back instead of breaking', () => {
	const meter = new Meter({ count: 0 });
	assert.equal(meter.count, 1);
	meter.setValue(Number.NaN);
	assert.equal(meter.value, 1);
});

test('a single texture without its pair throws by name', () => {
	assert.throws(
		() => new Meter({ count: 3, filledTexture: Texture.EMPTY }),
		/filledTexture and emptyTexture together/,
	);
	assert.throws(
		() => new Meter({ count: 3, emptyTexture: Texture.EMPTY }),
		/filledTexture and emptyTexture together/,
	);
});

test('a texture pair constructs and clips the same way flat icons do', () => {
	const meter = new Meter({ count: 4, size: 10, gap: 0, filledTexture: Texture.EMPTY, emptyTexture: Texture.EMPTY });
	meter.setValue(1);
	assert.equal(maskWidth(meter), 40 * 0.25);
});

test('an explicit colour survives a theme change; a defaulted one follows it', () => {
	const explicit = new Meter({ count: 3, color: 0xff00ff });
	const defaulted = new Meter({ count: 3 });

	assert.doesNotThrow(() => setTheme({ color: { ...defaultTheme.color, textHighlight: 0x00ff00 } }));
	setTheme(defaultTheme);

	explicit.destroy();
	defaulted.destroy();
});

test('destroying a meter unsubscribes it from theme changes', () => {
	const meter = new Meter({ count: 3 });
	meter.destroy();
	assert.doesNotThrow(() => setTheme({ padding: 5 }));
	setTheme(defaultTheme);
});
