import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contrastRatio, meetsContrast, relativeLuminance } from '../src/two-d/ui/contrast.ts';
import { defaultTheme, highContrastTheme } from '../src/two-d/ui/theme.ts';

test('relative luminance runs from black to white', () => {
	assert.equal(relativeLuminance(0x000000), 0);
	assert.equal(relativeLuminance(0xffffff), 1);
	assert.ok(relativeLuminance(0x808080) > 0.2 && relativeLuminance(0x808080) < 0.25);
});

test('contrast ratio spans 1 to 21 and is symmetric', () => {
	assert.equal(contrastRatio(0xffffff, 0xffffff), 1);
	assert.equal(Math.round(contrastRatio(0x000000, 0xffffff) * 10) / 10, 21);
	assert.equal(contrastRatio(0x123456, 0xabcdef), contrastRatio(0xabcdef, 0x123456));
});

test('the AA and AAA thresholds, relaxed for large text', () => {
	//a mid-grey on white is around 4.6:1, just over AA but nowhere near AAA
	const grey = 0x767676;
	assert.equal(meetsContrast(grey, 0xffffff, 'AA'), true);
	assert.equal(meetsContrast(grey, 0xffffff, 'AAA'), false);
	assert.equal(meetsContrast(0x949494, 0xffffff, 'AA'), false, 'lighter grey fails AA');
	assert.equal(meetsContrast(0x949494, 0xffffff, 'AA', true), true, 'but passes AA large');
	assert.equal(meetsContrast(0x000000, 0xffffff, 'AAA'), true);
});

test('the shipped themes pass the contrast they claim', () => {
	assert.equal(meetsContrast(defaultTheme.color.text, defaultTheme.color.panelFill, 'AA'), true);
	assert.equal(meetsContrast(highContrastTheme.color.text, highContrastTheme.color.panelFill, 'AAA'), true);
	assert.equal(
		meetsContrast(highContrastTheme.color.textHighlight, highContrastTheme.color.panelFill, 'AA'),
		true,
		'highlighted text on the high-contrast panel',
	);
});
