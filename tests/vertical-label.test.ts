import { test } from 'node:test';
import assert from 'node:assert/strict';

import { layoutVertical } from '../src/ui/VerticalLabel.ts';

/**
 * Only the pure layout math is tested: `VerticalLabel` itself creates Pixi `Text` objects,
 * which need a real `document` to measure glyphs and cannot exist outside a browser -
 * `Label` has the same limitation, which is why nothing in this suite constructs one.
 */

//never matches, so these tests isolate column/row placement from the rotation offset
const NEVER_ROTATE = /(?!)/;

test('characters stack top to bottom within a column', () => {
	const glyphs = layoutVertical('abc', { lineHeight: 10, columnHeight: 100, rotate: NEVER_ROTATE });

	assert.deepEqual(
		glyphs.map((g) => g.y),
		[0, 10, 20]
	);
	assert.ok(glyphs.every((g) => g.x === 0));
});

test('a column wraps once it reaches columnHeight, moving further left', () => {
	const glyphs = layoutVertical('abcd', { lineHeight: 10, columnHeight: 25, rotate: NEVER_ROTATE });

	//three rows fit (0, 10, 20 < 25), the fourth wraps to a new column
	assert.deepEqual(
		glyphs.map((g) => g.x),
		[0, 0, 0, -10]
	);
	assert.equal(glyphs[3].y, 0);
});

test('a newline forces a new column, even if the current one is not full', () => {
	const glyphs = layoutVertical('a\nb', { lineHeight: 10, columnHeight: 100, rotate: NEVER_ROTATE });

	assert.equal(glyphs.length, 2);
	assert.equal(glyphs[0].x, 0);
	assert.equal(glyphs[1].x, -10);
	assert.equal(glyphs[1].y, 0);
});

test('latin letters and digits are flagged to rotate; other characters are not', () => {
	const glyphs = layoutVertical('A1あ', { lineHeight: 10, columnHeight: 100 });

	assert.equal(glyphs[0].rotate, true);
	assert.equal(glyphs[1].rotate, true);
	assert.equal(glyphs[2].rotate, false);
});

test('a rotated glyph is offset by half a line, to centre it in its cell', () => {
	const glyphs = layoutVertical('A', { lineHeight: 10, columnHeight: 100 });
	assert.equal(glyphs[0].x, -5);
	assert.equal(glyphs[0].y, 5);
});

test('a custom rotate pattern overrides the default', () => {
	const glyphs = layoutVertical('Aあ', { lineHeight: 10, columnHeight: 100, rotate: /[぀-ゟ]/ });

	assert.equal(glyphs[0].rotate, false); // 'A' no longer matches
	assert.equal(glyphs[1].rotate, true); // hiragana does
});
