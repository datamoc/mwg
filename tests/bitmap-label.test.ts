import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bitmapLabelStyle } from '../src/ui/BitmapLabel.ts';
import { defaultTheme } from '../src/ui/theme.ts';

//BitmapText needs a real DOM `document` even to construct (unlike Pixi's Text, which only
//fails on measurement), so this tests the pure style-mapping logic BitmapLabel builds its
//BitmapText style from, rather than the widget itself - verified visually in a browser
//instead, the way every other Pixi-text-backed widget in mwg/ui already is

test('an explicit color/size/align/bold override the theme', () => {
	const style = bitmapLabelStyle({ color: 0x112233, size: 20, align: 'right', bold: true }, defaultTheme);
	assert.equal(style.fill, 0x112233);
	assert.equal(style.fontSize, 20);
	assert.equal(style.align, 'right');
	assert.equal(style.fontWeight, 'bold');
});

test('unset options fall back to the theme', () => {
	const style = bitmapLabelStyle({}, defaultTheme);
	assert.equal(style.fill, defaultTheme.color.text);
	assert.equal(style.fontSize, defaultTheme.font.size);
	assert.equal(style.fontFamily, defaultTheme.font.family);
	assert.equal(style.fontWeight, 'normal');
});

test('align defaults from the theme direction when not given explicitly', () => {
	assert.equal(bitmapLabelStyle({}, { ...defaultTheme, direction: 'ltr' }).align, 'left');
	assert.equal(bitmapLabelStyle({}, { ...defaultTheme, direction: 'rtl' }).align, 'right');
});

test('wrapWidth turns on word wrap at that width; omitting it leaves wrap off', () => {
	const wrapped = bitmapLabelStyle({ wrapWidth: 240 }, defaultTheme);
	assert.equal(wrapped.wordWrap, true);
	assert.equal(wrapped.wordWrapWidth, 240);

	const unwrapped = bitmapLabelStyle({}, defaultTheme);
	assert.equal(unwrapped.wordWrap, false);
});
