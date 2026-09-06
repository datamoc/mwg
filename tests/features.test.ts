import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureLayer, type CellFeatureDef } from '../src/roguelike/Features.ts';

type Ctx = { log: string[]; hasKey: boolean };

test('placing an undefined kind throws', () => {
	const layer = new FeatureLayer<Ctx>();
	assert.throws(() => layer.place(5, 'sign'));
});

test('inspect calls the def without triggering a consequence', () => {
	const layer = new FeatureLayer<Ctx>();
	layer.define('sign', {
		inspect: (_cell, ctx) => ctx.log.push('read'),
		consequence: (_cell, ctx) => ctx.log.push('consequence'),
	});
	layer.place(3, 'sign');

	const ctx: Ctx = { log: [], hasKey: false };
	layer.inspect(3, ctx);
	assert.deepEqual(ctx.log, ['read']);
});

test('interact runs the consequence when interact does not refuse (or is absent)', () => {
	const layer = new FeatureLayer<Ctx>();
	layer.define('well', {
		consequence: (_cell, ctx) => ctx.log.push('healed'),
	});
	layer.place(9, 'well');

	const ctx: Ctx = { log: [], hasKey: false };
	layer.interact(9, ctx);
	assert.deepEqual(ctx.log, ['healed']);
});

test('interact returning false refuses the consequence', () => {
	const layer = new FeatureLayer<Ctx>();
	const def: CellFeatureDef<Ctx> = {
		interact: (_cell, ctx) => ctx.hasKey,
		consequence: (_cell, ctx) => ctx.log.push('opened'),
	};
	layer.define('locked door', def);
	layer.place(1, 'locked door');

	const noKey: Ctx = { log: [], hasKey: false };
	layer.interact(1, noKey);
	assert.deepEqual(noKey.log, []);

	const withKey: Ctx = { log: [], hasKey: true };
	layer.interact(1, withKey);
	assert.deepEqual(withKey.log, ['opened']);
});

test('a non-persistent feature is removed after its consequence runs once', () => {
	const layer = new FeatureLayer<Ctx>();
	layer.define('trap', { consequence: (_cell, ctx) => ctx.log.push('sprung'), persistent: false });
	layer.place(4, 'trap');

	const ctx: Ctx = { log: [], hasKey: false };
	layer.interact(4, ctx);
	assert.ok(!layer.has(4));

	//a second interaction on an already-removed cell is a silent no-op
	layer.interact(4, ctx);
	assert.deepEqual(ctx.log, ['sprung']);
});

test('a persistent feature (the default) stays after triggering repeatedly', () => {
	const layer = new FeatureLayer<Ctx>();
	layer.define('statue', { consequence: (_cell, ctx) => ctx.log.push('blessed') });
	layer.place(2, 'statue');

	const ctx: Ctx = { log: [], hasKey: false };
	layer.interact(2, ctx);
	layer.interact(2, ctx);
	assert.ok(layer.has(2));
	assert.deepEqual(ctx.log, ['blessed', 'blessed']);
});

test('inspecting or interacting with a cell with no feature does nothing', () => {
	const layer = new FeatureLayer<Ctx>();
	const ctx: Ctx = { log: [], hasKey: false };
	layer.inspect(99, ctx);
	layer.interact(99, ctx);
	assert.deepEqual(ctx.log, []);
});

test('toJSON/fromJSON round-trips which cell holds which kind, definitions supplied fresh', () => {
	const layer = new FeatureLayer<Ctx>();
	layer.define('sign', { inspect: (_cell, ctx) => ctx.log.push('read') });
	layer.place(3, 'sign');
	layer.place(10, 'sign');

	const data = layer.toJSON();
	const defs = new Map<string, CellFeatureDef<Ctx>>([['sign', { inspect: (_cell, ctx) => ctx.log.push('read again') }]]);
	const restored = FeatureLayer.fromJSON(defs, data);

	assert.ok(restored.has(3) && restored.has(10));
	assert.equal(restored.kindAt(3), 'sign');

	const ctx: Ctx = { log: [], hasKey: false };
	restored.inspect(3, ctx);
	assert.deepEqual(ctx.log, ['read again']);
});
