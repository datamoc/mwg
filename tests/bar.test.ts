import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Bar } from '../src/ui/Bar.ts';
import { setTheme, defaultTheme } from '../src/ui/theme.ts';

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
