import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeSvg, svgDataUri, svgScaleVariants, splitSvgGroups } from '../src/assets/svg.ts';

const puppet =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
	'<g id="arm"><rect width="4" height="8"/></g>' +
	'<g id="leg"><rect y="8" width="4" height="8"/><g id="toe"><rect x="4" y="14" width="2" height="2"/></g></g>' +
	'</svg>';

test('sanitization refuses active content by name and passes what it names as inert', () => {
	assert.equal(sanitizeSvg(puppet), puppet);
	const refused = [
		['<script>', '<svg><script>alert(1)</script></svg>'],
		['<foreignObject>', '<svg><foreignObject></foreignObject></svg>'],
		['an event-handler', '<svg><rect onclick="alert(1)"/></svg>'],
		['javascript: URL', '<svg><a href="javascript:alert(1)"/></svg>'],
		['data: URL of an active type', '<svg><use href="data:image/svg+xml,x"/></svg>'],
	];
	for (const [name, source] of refused)
		assert.throws(() => sanitizeSvg(source), new RegExp(name.split(' ')[0]), name);
	//the gate is a refusal, not a rewrite: nothing is silently stripped
	assert.throws(() => sanitizeSvg('<svg><script>x</script></svg>'), /refused: contains/);
});

test('one source, one variant per named scale, each ready for the loader', () => {
	const variants = svgScaleVariants(puppet, [
		{ name: '1x', resolution: 1 },
		{ name: '2x', resolution: 2 },
		{ name: '3x', resolution: 3 },
	]);
	assert.deepEqual(
		variants.map((variant) => variant.name),
		['1x', '2x', '3x'],
	);
	for (const variant of variants) {
		assert.ok(variant.src.startsWith('data:image/svg+xml,'));
		assert.ok(variant.src.includes(encodeURIComponent('<rect width="4" height="8"/>')));
		assert.equal(variant.resolution, Number(variant.name[0]));
	}
	assert.equal(svgDataUri('<svg/>'), 'data:image/svg+xml,%3Csvg%2F%3E');
	assert.throws(() => svgScaleVariants(puppet, []), /at least one/);
	assert.throws(
		() =>
			svgScaleVariants(puppet, [
				{ name: 'a', resolution: 1 },
				{ name: 'a', resolution: 2 },
			]),
		/duplicate/,
	);
	assert.throws(() => svgScaleVariants(puppet, [{ name: 'a', resolution: 0 }]), /positive resolution/);
	assert.throws(() => svgScaleVariants('<svg><script/></svg>', [{ name: 'a', resolution: 1 }]), /refused/);
});

test('a group-authored SVG splits into one standalone part per named group', () => {
	const parts = splitSvgGroups(puppet);
	//the split is at the top level: a nested group stays part of its parent, which is
	//the authoring form (arm, leg, head as siblings in one drawing)
	assert.deepEqual(Object.keys(parts), ['arm', 'leg']);
	for (const part of Object.values(parts)) {
		assert.ok(part.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'));
		assert.ok(part.endsWith('</svg>'));
		assert.equal(part.split('<svg').length - 1, 1, 'each part is one standalone svg');
	}
	assert.ok(parts.arm.includes('<rect width="4" height="8"/>'));
	//one drawing, one source of truth, split at load: the leg keeps its nested toe
	assert.ok(parts.leg.includes('id="toe"'));
	assert.ok(parts.leg.includes('width="2" height="2"'));
});

test('group split refuses what it cannot prove by name', () => {
	assert.throws(() => splitSvgGroups('<svg><g><rect/></g></svg>'), /no id/);
	assert.throws(() => splitSvgGroups('<svg><g id="a"/><g id="a"/></svg>'), /duplicate id a/);
	assert.throws(() => splitSvgGroups('<svg><g id="a"><rect/></svg>'), /never closes/);
	assert.throws(() => splitSvgGroups('<svg><rect/></svg>'), /no named groups/);
	assert.throws(() => splitSvgGroups('<svg><script/></svg>'), /refused/);
});

test('SVG parts retain shared definitions, group transforms and nested empty groups', () => {
	const parts = splitSvgGroups(
		'<svg viewBox="0 0 20 20"><defs><linearGradient id="paint"/></defs><style>.car{fill:red}</style><g id="body" transform="translate(2 3)" opacity=".5"><g/><rect fill="url(#paint)"/></g><g id="wheel"/></svg>',
	);
	assert.ok(parts.body.includes('<defs>'));
	assert.ok(parts.body.includes('<style>'));
	assert.ok(parts.body.includes('transform="translate(2 3)" opacity=".5"'));
	assert.ok(parts.body.includes('<g/>'));
	assert.ok(parts.wheel.includes('<g id="wheel"/>'));
	assert.throws(() => splitSvgGroups('<svg><g id="a"><g></g></svg>'), /never closes/);
});
