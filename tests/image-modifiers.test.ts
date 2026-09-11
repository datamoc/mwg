import assert from 'node:assert/strict';
import test from 'node:test';
import { colorShiftMatrix, imageModifier, parseImagePath } from '../src/two-d/render/ImageModifiers.ts';

test('image modifier paths preserve nested assets and normalize modifier names', () => {
	const parsed = parseImagePath('attacks/blank-attack.png~BLIT(attacks/claws.png~FL(horiz),4,4)~CS(-20,0,30)');
	assert.equal(parsed.path, 'attacks/blank-attack.png');
	assert.deepEqual(parsed.modifiers[0], { name: 'BLIT', args: ['attacks/claws.png~FL(horiz)', '4', '4'] });
	assert.deepEqual(imageModifier(parsed, 'cs'), { name: 'CS', args: ['-20', '0', '30'] });
});

test('image modifier paths accept quoted values and shorthand scale', () => {
	const parsed = parseImagePath('"units/human.png~SCALE(48)~FL(vert)"');
	assert.equal(parsed.path, 'units/human.png');
	assert.deepEqual(
		parsed.modifiers.map((entry) => entry.name),
		['SCALE', 'FL'],
	);
	assert.deepEqual(parsed.modifiers[0].args, ['48']);
});

test('CS builds a per-channel additive matrix', () => {
	const matrix = colorShiftMatrix(-20, 0, 30);
	assert.equal(matrix.length, 20);
	assert.equal(matrix[4], -20 / 255);
	assert.equal(matrix[9], 0);
	assert.equal(matrix[14], 30 / 255);
});
