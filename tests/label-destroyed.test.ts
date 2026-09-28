import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Label } from '../src/two-d/ui/Label.ts';

test('a destroyed label ignores text, colour and reveal calls instead of updating a released texture', () => {
	const label = new Label('before');
	label.destroy();
	assert.equal(label.destroyed, true);
	assert.doesNotThrow(() => {
		label.setText('after');
		label.setColor(0xff0000);
		label.showProgressive('slow text');
		label.completeReveal();
	});
	assert.equal(label.updateReveal(1), true);
});
