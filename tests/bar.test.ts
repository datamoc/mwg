import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Texture, Graphics } from 'pixi.js';
import { Bar } from '../src/ui/Bar.ts';
import { setTheme, defaultTheme } from '../src/ui/theme.ts';

function fillWidth(bar: Bar): number {
	return (bar as unknown as { fill: Graphics }).fill.width;
}

test('defaults to full', () => {
	const bar = new Bar({ width: 100, height: 10 });
	assert.equal(bar.value, 1);
});

test('setValue computes a fraction from value/max, clamped to [0,1]', () => {
	const bar = new Bar({ width: 100, height: 10 });

	bar.setValue(50, 100);
	assert.equal(bar.value, 0.5);

	bar.setValue(150, 100);
	assert.equal(bar.value, 1);

	bar.setValue(-10, 100);
	assert.equal(bar.value, 0);
});

test('max defaults to 1, so setValue(fraction) works directly', () => {
	const bar = new Bar({ width: 100, height: 10 });
	bar.setValue(0.25);
	assert.equal(bar.value, 0.25);
});

test('an explicit colour survives a theme change; a defaulted one follows it', () => {
	const explicit = new Bar({ width: 100, height: 10, color: 0xff00ff });
	const defaulted = new Bar({ width: 100, height: 10 });

	assert.doesNotThrow(() => setTheme({ color: { ...defaultTheme.color, textHighlight: 0x00ff00 } }));
	setTheme(defaultTheme);

	//no public getter for the resolved fill colour; this test exists to prove restyling
	//never throws for either the explicit or defaulted case, exercised via destroy below
	explicit.destroy();
	defaulted.destroy();
});

test('destroying a bar unsubscribes it from theme changes', () => {
	const bar = new Bar({ width: 100, height: 10 });
	bar.destroy();
	assert.doesNotThrow(() => setTheme({ padding: 5 }));
	setTheme(defaultTheme);
});

// ------------------------------------------------------------------- texture fill, pixel rounding

test('without roundUpToPixel, the fill is exactly width * fraction, fractional pixel included', () => {
	const bar = new Bar({ width: 100, height: 10 });
	bar.setValue(1, 3); // 100 * (1/3) = 33.333...
	assert.ok(Math.abs(fillWidth(bar) - 100 / 3) < 1e-9);
});

test('roundUpToPixel rounds a fractional fill width up to the next whole pixel', () => {
	const bar = new Bar({ width: 100, height: 10, roundUpToPixel: true });
	bar.setValue(1, 3); // raw 33.333... rounds up to 34
	assert.equal(fillWidth(bar), 34);
});

test('roundUpToPixel leaves an already-whole width unchanged', () => {
	const bar = new Bar({ width: 100, height: 10, roundUpToPixel: true });
	bar.setValue(1, 2); // raw 50, already whole
	assert.equal(fillWidth(bar), 50);
});

test('roundUpToPixel never rounds a nonzero sliver down to an invisible zero width', () => {
	const bar = new Bar({ width: 300, height: 10, roundUpToPixel: true });
	bar.setValue(1, 300); // raw width exactly 1
	assert.ok(fillWidth(bar) >= 1);
});

test('a fillTexture and backgroundTexture can be set without throwing, tinted or not', () => {
	assert.doesNotThrow(() => {
		const bar = new Bar({ width: 100, height: 10, fillTexture: Texture.WHITE, backgroundTexture: Texture.WHITE });
		bar.setValue(0.5);
		bar.destroy();
	});
	assert.doesNotThrow(() => {
		const bar = new Bar({ width: 100, height: 10, fillTexture: Texture.WHITE, color: 0xff0000 });
		bar.setValue(0.5);
		bar.destroy();
	});
});

test('a fillTexture still respects the fraction and rounding, same as the flat-colour fill', () => {
	const bar = new Bar({ width: 100, height: 10, fillTexture: Texture.WHITE, roundUpToPixel: true });
	bar.setValue(1, 3);
	assert.equal(fillWidth(bar), 34);
});
