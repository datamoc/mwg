import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Text2D } from '../src/two-d/render/Shape2D.ts';

test('a destroyed Text2D ignores text and fill updates instead of updating a released texture', () => {
	const text = new Text2D({ text: 'before', style: { fill: 0xffffff } });
	text.setText('after');
	assert.equal(text.text, 'after');

	text.destroy();
	assert.equal(text.destroyed, true);
	assert.doesNotThrow(() => {
		text.setText('later');
		text.text = 'later still';
		text.setFill(0xff0000);
	});
});

test('Text2D.setText skips an unchanged string and the direct setter still works while alive', () => {
	const text = new Text2D({ text: 'same' });
	text.setText('same');
	text.text = 'direct';
	assert.equal(text.text, 'direct');
	text.setFill(0x00ff00);
	assert.equal(text.style.fill, 0x00ff00);
});
