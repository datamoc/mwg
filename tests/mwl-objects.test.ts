import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, nodesToObjects, type MwlTagSchema } from '../src/mwl/index.ts';

const schemas = {
	bridge: {
		attributes: { id: 'string', budget: 'number', optional: 'number' },
		required: ['id'],
		children: ['anchor', 'view'],
		cardinality: { view: { max: 1 } },
	},
	anchor: { attributes: { x: 'integer', fixed: 'boolean' }, children: [] },
	view: { attributes: { width: 'number' }, children: [] },
} satisfies Record<string, MwlTagSchema>;

test('nodesToObjects converts typed fields and ordered children without retaining compiler metadata', () => {
	const game = compile(
		`[{ tag: 'bridge', id: '01', budget: 20.5, children: [
		{ tag: 'anchor', x: -4, fixed: 'yes' },
		{ tag: 'view', width: 640 },
		{ tag: 'anchor', x: 8, fixed: false }
	] }, { tag: 'bridge', id: '02' }]`,
		{ schemas },
	);
	const result = nodesToObjects(game.roots, schemas);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.value, [
		{
			id: '01',
			budget: 20.5,
			anchor: [
				{ x: -4, fixed: true },
				{ x: 8, fixed: false },
			],
			view: { width: 640 },
		},
		{ id: '02' },
	]);
	assert.deepEqual(JSON.parse(JSON.stringify(result.value)), result.value);
	assert.equal(game.roots[0].attributes.budget, '20.5');
});

test('nodesToObjects reports invalid manually built nodes with their source location', () => {
	const location = { file: 'bridge.mwl', line: 12, column: 3 };
	const result = nodesToObjects(
		[
			{ tag: 'bridge', attributes: { budget: 'oops' }, children: [], location },
			{ tag: 'unknown', attributes: {}, children: [], location },
		],
		schemas,
	);
	assert.equal(result.diagnostics.length, 3);
	assert.ok(result.diagnostics.every((issue) => issue.location === location));
	assert.match(result.diagnostics[0].message, /budget/);
	assert.match(result.diagnostics[1].message, /required.*id/);
	assert.match(result.diagnostics[2].message, /unknown/);
});

test('nodesToObjects refuses field collisions and duplicate singleton children', () => {
	const child = { tag: 'view', attributes: { width: '2' }, children: [] };
	const duplicate = nodesToObjects([{ tag: 'bridge', attributes: { id: 'a' }, children: [child, child] }], schemas);
	assert.match(duplicate.diagnostics[0].message, /multiple.*view/);
	const collision = nodesToObjects([{ tag: 'bridge', attributes: { id: 'a', view: 'name' }, children: [child] }], {
		...schemas,
		bridge: { ...schemas.bridge, openAttributes: 'string' },
	});
	assert.match(collision.diagnostics[0].message, /collide/);
	assert.equal(collision.value[0].view, 'name');
});

test('nodesToObjects preserves a JSON property named __proto__ without changing its prototype', () => {
	const result = nodesToObjects([{ tag: 'data', attributes: JSON.parse('{"__proto__":"safe"}'), children: [] }], {
		data: { openAttributes: 'string' },
	});
	assert.deepEqual(result.diagnostics, []);
	assert.equal(Object.getPrototypeOf(result.value[0]), Object.prototype);
	assert.equal(JSON.stringify(result.value[0]), '{"__proto__":"safe"}');
});
