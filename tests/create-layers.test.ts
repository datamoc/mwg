import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Node2D, createLayers } from '../src/two-d/render/Shape2D.ts';

test('createLayers builds one labeled Node2D per name and attaches them in order', () => {
	const parent = new Node2D();

	const layers = createLayers(parent, ['terrain', 'units', 'effects', 'ui']);

	assert.deepEqual(Object.keys(layers), ['terrain', 'units', 'effects', 'ui']);
	assert.deepEqual(
		parent.children.map((child) => child.label),
		['terrain', 'units', 'effects', 'ui'],
	);
	assert.equal(layers.units.parent, parent);
	assert.notEqual(layers.units, layers.effects, 'each name gets its own layer');
});

test('createLayers names nothing and adds nothing for an empty list', () => {
	const parent = new Node2D();

	const layers = createLayers(parent, []);

	assert.deepEqual(layers, {});
	assert.equal(parent.children.length, 0);
});
