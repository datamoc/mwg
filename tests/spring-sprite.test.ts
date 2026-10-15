import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graphics } from 'pixi.js';

import { Spring } from '../src/physics/spring/index.ts';
import { SpringSprite } from '../src/two-d/render/SpringSprite.ts';

/**
 * Item 424, the debug view: a line from the anchor to the bob. A `Graphics` exists
 * without a renderer (like the halo tests), so construction and the redraw path are
 * checked here; what the line looks like is the spring example's job.
 */

test('a spring line builds on a spring and redraws without a renderer', () => {
	const spring = new Spring({ stiffness: 120, damping: 8 });
	const line = new SpringSprite({ spring, color: 0xff0000, lineWidth: 3 });
	assert.ok(line instanceof Graphics);
	spring.setAnchor(10, 0);
	spring.update(1 / 60);
	assert.doesNotThrow(() => line.sync());
});
