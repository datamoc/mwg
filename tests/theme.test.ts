import { test } from 'node:test';
import assert from 'node:assert/strict';

import { theme, themeChanged, setTheme, defaultTheme, highContrastTheme } from '../src/ui/theme.ts';

test('setTheme dispatches the merged theme to themeChanged listeners', () => {
	const seen: number[] = [];
	const listener = (t: { color: { text: number } }) => {
		seen.push(t.color.text);
	};
	themeChanged.add(listener);

	try {
		setTheme({ color: { ...defaultTheme.color, text: 0x123456 } });
		assert.deepEqual(seen, [0x123456]);
		assert.equal(theme().color.text, 0x123456);
	} finally {
		themeChanged.remove(listener);
		setTheme(defaultTheme);
	}
});

test('a listener removed before setTheme is not called', () => {
	let called = false;
	const listener = () => {
		called = true;
	};
	themeChanged.add(listener);
	themeChanged.remove(listener);

	setTheme({ padding: 99 });
	setTheme(defaultTheme);

	assert.equal(called, false);
});

test('highContrastTheme applies through setTheme like any other theme, replacing the palette', () => {
	try {
		setTheme(highContrastTheme);
		assert.equal(theme().color.text, 0xffffff);
		assert.equal(theme().color.panelFill, 0x000000);
	} finally {
		setTheme(defaultTheme);
	}
});

test('highContrastTheme uses pure white text on a black panel, and a thicker border than the default', () => {
	assert.equal(highContrastTheme.color.text, 0xffffff);
	assert.equal(highContrastTheme.color.panelFill, 0x000000);
	assert.ok(highContrastTheme.panelBorder > defaultTheme.panelBorder);
});
