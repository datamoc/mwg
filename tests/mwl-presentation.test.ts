import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePresentation, emitPresentationModule, type PresentationManifest } from '../src/mwl/presentation.ts';
import { MwlPresentation } from '../src/two-d/presentation/index.ts';
import { Node2D } from '../src/two-d/render/Shape2D.ts';
import { Signal } from '../src/core/Signal.ts';
import * as Input from '../src/core/Input.ts';
import { themeChanged } from '../src/two-d/ui/theme.ts';

type AuthoredNode = { tag: string; [key: string]: unknown };
const palette = {
	panel: 0x111827,
	text: 0xffffff,
	accent: 0x99ccff,
	success: 0x88eeaa,
	warning: 0xffcc66,
	danger: 0xff8888,
	selection: 0x627ab0,
	sky: 0x4488bb,
};
function themeNode(id = 'base'): AuthoredNode {
	return {
		tag: 'theme_definition',
		id,
		children: Object.entries(palette).map(([id, value]) => ({ tag: 'theme_token', id, value })),
	};
}
const manifest: PresentationManifest = {
	values: {
		caption: 'string',
		cost: 'number',
		show: 'boolean',
		rows: { type: 'items', fields: { id: 'string', text: 'string', disabled: 'boolean' } },
	},
	actions: ['run'],
	adapters: ['world'],
	assets: ['sky.svg'],
};
function compile(nodes: AuthoredNode[], declarations = manifest) {
	return compilePresentation([{ file: 'ui.mwl', source: JSON.stringify([themeNode(), ...nodes]) }], declarations);
}
function scene(children: AuthoredNode[]): AuthoredNode {
	return { tag: 'scene_definition', id: 'game', theme: 'base', children };
}

test('presentation compilation expands reusable trees, checks typed bindings and emits stable literal IDs', () => {
	const data = compile([
		{
			tag: 'ui_component',
			id: 'controls',
			children: [{ tag: 'ui_button', id: 'go', text_binding: 'caption', action: 'run' }],
		},
		scene([{ tag: 'ui_mount', id: 'hud', component: 'controls' }]),
	]);
	assert.equal(data.scenes.game.children[0].children[0].source, 'component:controls/go');
	assert.deepEqual(data.ids, ['game/hud', 'game/hud/go']);
	assert.equal(
		emitPresentationModule(data),
		emitPresentationModule(
			compile([
				{
					tag: 'ui_component',
					id: 'controls',
					children: [{ tag: 'ui_button', id: 'go', text_binding: 'caption', action: 'run' }],
				},
				scene([{ tag: 'ui_mount', id: 'hud', component: 'controls' }]),
			]),
		),
	);
	assert.match(emitPresentationModule(data), /export type PresentationId/);
});

test('unknown actions, bindings, assets, adapters, variants and override targets fail with the authored file and line', () => {
	for (const [node, message] of [
		[{ tag: 'ui_button', id: 'go', action: 'absent' }, /unknown action/],
		[{ tag: 'ui_label', id: 'label', text_binding: 'cost' }, /must be string/],
		[{ tag: 'ui_adapter', id: 'world', adapter: 'absent' }, /unknown adapter/],
		[{ tag: 'scene_layer', id: 'world', image: 'absent.svg' }, /unknown asset/],
		[{ tag: 'ui_label', id: 'label', variant: 'absent' }, /unknown component_variant/],
	] as const)
		assert.throws(
			() => compile([scene([node])]),
			(error: unknown) =>
				error instanceof Error && error.message.startsWith('ui.mwl:1:') && message.test(error.message),
		);
	assert.throws(
		() =>
			compile([
				{
					tag: 'presentation_context',
					id: 'snow',
					theme: 'base',
					children: [{ tag: 'ui_override', target: 'absent' }],
				},
			]),
		/unknown override target/,
	);
});

test('component cycles and duplicate sibling IDs fail before presentation is instantiated', () => {
	assert.throws(
		() =>
			compile([
				{ tag: 'ui_component', id: 'loop', children: [{ tag: 'ui_mount', id: 'again', component: 'loop' }] },
				scene([{ tag: 'ui_mount', id: 'hud', component: 'loop' }]),
			]),
		/component cycle/,
	);
	assert.throws(
		() =>
			compile([
				scene([
					{ tag: 'ui_label', id: 'a' },
					{ tag: 'ui_label', id: 'a' },
				]),
			]),
		/duplicate or missing component id/,
	);
});

test('repeat templates validate item fields and stable keys against their collection manifest', () => {
	const repeat = {
		tag: 'ui_repeat',
		id: 'rows',
		items_binding: 'rows',
		key: 'id',
		children: [
			{
				tag: 'ui_button',
				id: 'row',
				text_binding: 'item.text',
				disabled_binding: 'item.disabled',
				action: 'run',
			},
		],
	};
	const data = compile([scene([repeat])]);
	assert.ok(data.ids.includes('game/rows/*/row'));
	assert.throws(() => compile([scene([{ ...repeat, key: 'disabled' }])]), /key .* must be a string or number/);
	assert.throws(
		() =>
			compile([scene([{ ...repeat, children: [{ tag: 'ui_label', id: 'row', text_binding: 'item.absent' }] }])]),
		/must be string/,
	);
	assert.throws(() => compile([scene([{ ...repeat, children: [] }])]), /exactly one template/);
	assert.throws(() => compile([scene([{ ...repeat, items_binding: 'caption' }])]), /unknown collection/);
});

test('palette validation rejects unreadable text and indistinguishable danger and selection tokens', () => {
	for (const id of ['text', 'danger', 'selection']) {
		const invalid = themeNode();
		invalid.children = Object.entries({ ...palette, [id]: palette.panel }).map(([id, value]) => ({
			tag: 'theme_token',
			id,
			value,
		}));
		assert.throws(
			() => compilePresentation([{ file: 'colors.mwl', source: JSON.stringify([invalid]) }], manifest),
			/contrast/,
		);
	}
	assert.throws(
		() => compile([scene([{ tag: 'ui_label', id: 'label', color_token: 'absent' }])]),
		/unknown theme token/,
	);
	assert.throws(
		() =>
			compile([
				{
					tag: 'presentation_context',
					id: 'snow',
					theme: 'base',
					children: [{ tag: 'theme_token', id: 'text', value: palette.panel }],
				},
			]),
		/contrast/,
	);
});

test('gettext messages and known scene assets use the existing MWL extraction pipeline', () => {
	const source = JSON.stringify([
		themeNode(),
		scene([
			{ tag: 'ui_label', id: 'label', text: 'Hello' },
			{ tag: 'scene_layer', id: 'backdrop', image: 'sky.svg' },
		]),
	]).replace('"Hello"', '_("Hello")');
	const data = compilePresentation([{ file: 'text.mwl', source }], manifest);
	assert.deepEqual(data.messages, ['Hello']);
	assert.deepEqual(data.assets, ['sky.svg']);
});

test('contexts restyle live adapters without recreating game state, and destruction detaches every owned subscription', () => {
	const data = compile(
		[
			scene([{ tag: 'scene_layer', id: 'world', adapter: 'world', space: 'world' }]),
			{
				tag: 'presentation_context',
				id: 'snow',
				theme: 'base',
				children: [{ tag: 'theme_token', id: 'sky', value: 0xddddff }],
			},
		],
		{ values: {}, actions: [], adapters: ['world'] },
	);
	const parent = new Node2D(),
		changes = new Signal<void>();
	const themeListeners = themeChanged.size,
		inputListeners = Input.onAction.size;
	let created = 0,
		destroyed = 0,
		restyled = 0,
		sky = 0;
	const ui = new MwlPresentation(data, 'game', {
		parent,
		state: () => ({}),
		actions: {},
		adapters: {
			world: () => {
				created++;
				return {
					view: new Node2D(),
					restyle: ({ tokens }) => {
						restyled++;
						sky = tokens.sky;
					},
					destroy: () => {
						destroyed++;
					},
				};
			},
		},
		subscribe: (refresh) => {
			changes.add(refresh);
			return () => changes.remove(refresh);
		},
	});
	const world = ui.get('game/world');
	ui.resize(800, 600);
	ui.setContext('snow');
	assert.equal(ui.get('game/world'), world);
	assert.equal(created, 1);
	assert.equal(sky, 0xddddff);
	assert.equal(changes.size, 1);
	const styled = restyled;
	ui.update();
	ui.update();
	assert.equal(restyled, styled, 'unchanged state does not restyle the adapter');
	assert.throws(() => ui.setContext('absent'), /unknown presentation context/);
	assert.equal(ui.activeContext, 'snow');
	ui.destroy();
	ui.destroy();
	assert.equal(destroyed, 1);
	assert.equal(changes.size, 0);
	assert.equal(parent.children.length, 0);
	assert.equal(themeChanged.size, themeListeners);
	assert.equal(Input.onAction.size, inputListeners);
	assert.throws(() => ui.update(), /destroyed/);
});

test('base, context, component variant and component state resolve in that order', () => {
	const data = compile(
		[
			{ tag: 'component_variant', id: 'wide', width: 140 },
			scene([{ tag: 'ui_adapter', id: 'adapter', adapter: 'world', width: 80, variant: 'wide', children: [] }]),
			{
				tag: 'presentation_context',
				id: 'snow',
				theme: 'base',
				children: [{ tag: 'ui_override', target: 'scene:game/adapter', width: 100 }],
			},
		],
		{ values: {}, actions: [], adapters: ['world'] },
	);
	let width = '';
	const ui = new MwlPresentation(data, 'game', {
		parent: new Node2D(),
		state: () => ({}),
		actions: {},
		adapters: {
			world: () => ({
				view: new Node2D(),
				restyle: (context) => {
					width = context.properties.width;
				},
			}),
		},
	});
	ui.setContext('snow');
	assert.equal(width, '140');
	ui.destroy();
});

test('keyed repeat instances and their adapter subscriptions survive reorder and detach only when removed', () => {
	const declarations: PresentationManifest = {
		values: { rows: { type: 'items', fields: { id: 'string', shown: 'boolean' } } },
		actions: [],
		adapters: ['world'],
	};
	const data = compile(
		[
			scene([
				{
					tag: 'ui_repeat',
					id: 'rows',
					items_binding: 'rows',
					key: 'id',
					gap: 8,
					children: [
						{
							tag: 'ui_container',
							id: 'item',
							width: 100,
							height: 20,
							visible_binding: 'item.shown',
							children: [{ tag: 'ui_adapter', id: 'view', adapter: 'world', width: 100, height: 20 }],
						},
					],
				},
			]),
		],
		declarations,
	);
	let rows = [
		{ id: 'a/b', shown: true },
		{ id: 'b', shown: true },
	];
	let created = 0,
		removed = 0;
	const ui = new MwlPresentation(data, 'game', {
		parent: new Node2D(),
		state: () => ({ rows }),
		actions: {},
		adapters: {
			world: () => {
				created++;
				return {
					view: new Node2D(),
					destroy: () => {
						removed++;
					},
				};
			},
		},
	});
	ui.resize(180, 300);
	const first = ui.get('game/rows/a%2Fb/item');
	const second = ui.get('game/rows/b/item');
	assert.equal(second?.y, 28, 'wrapping uses the preceding row height and gap');
	rows.reverse();
	ui.update();
	assert.equal(ui.get('game/rows/a%2Fb/item'), first);
	assert.equal(ui.get('game/rows/b/item'), second);
	assert.equal(second?.y, 0);
	assert.equal(first?.y, 28);
	assert.equal(created, 2);
	rows = [
		{ id: 'a/b', shown: false },
		{ id: 'b', shown: true },
	];
	ui.update();
	assert.equal(first?.visible, false);
	assert.equal(second?.y, 0);
	rows = [{ id: 'b', shown: true }];
	ui.update();
	assert.equal(first?.destroyed, true);
	assert.equal(ui.get('game/rows/a%2Fb/item'), null);
	assert.equal(removed, 1);
	ui.destroy();
	assert.equal(removed, 2);
});

test('repeat duplicate keys and invalid collection values fail before existing instances are replaced', () => {
	const data = compile([
		scene([
			{
				tag: 'ui_repeat',
				id: 'rows',
				items_binding: 'rows',
				key: 'id',
				children: [{ tag: 'ui_container', id: 'row', height: 20 }],
			},
		]),
	]);
	let rows: unknown = [{ id: 'a' }];
	const ui = new MwlPresentation(data, 'game', {
		parent: new Node2D(),
		state: () => ({ rows }) as never,
		actions: { run: () => {} },
		adapters: { world: () => ({ view: new Node2D() }) },
	});
	const row = ui.get('game/rows/a/row');
	for (const invalid of [[{ id: 'a' }, { id: 'a' }], [{ id: false }], 'absent']) {
		rows = invalid;
		assert.throws(() => ui.update(), /duplicate repeat key|invalid repeat key|must be an array/);
		assert.equal(ui.get('game/rows/a/row'), row);
		assert.equal(row?.destroyed, false);
	}
	rows = [{ id: 'a' }];
	ui.update();
	ui.destroy();
});

test('anchor, column and grid geometry use the existing layout helpers and resize adapters in their cells', () => {
	const data = compile(
		[
			scene([
				{
					tag: 'ui_column',
					id: 'column',
					width: 100,
					gap: 7,
					anchor: 'bottom-right',
					children: [
						{ tag: 'ui_adapter', id: 'a', adapter: 'world', width: 80, height: 20 },
						{ tag: 'ui_adapter', id: 'b', adapter: 'world', width: 80, height: 30 },
					],
				},
				{
					tag: 'ui_grid',
					id: 'grid',
					width: 300,
					height: 100,
					columns: 2,
					gap: 10,
					children: [
						{ tag: 'ui_adapter', id: 'a', adapter: 'world', height: 20 },
						{ tag: 'ui_adapter', id: 'b', adapter: 'world', height: 20 },
						{ tag: 'ui_adapter', id: 'c', adapter: 'world', height: 20 },
					],
				},
			]),
		],
		{ values: {}, actions: [], adapters: ['world'] },
	);
	const sizes: number[] = [];
	const ui = new MwlPresentation(data, 'game', {
		parent: new Node2D(),
		state: () => ({}),
		actions: {},
		adapters: { world: () => ({ view: new Node2D(), resize: (width) => sizes.push(width) }) },
	});
	ui.resize(800, 600);
	assert.equal(ui.get('game/column')?.x, 700);
	assert.equal(ui.get('game/column')?.y, 543);
	assert.equal(ui.get('game/column/b')?.y, 27);
	assert.equal(ui.get('game/grid/b')?.x, 155);
	assert.equal(ui.get('game/grid/c')?.y, 30);
	assert.ok(sizes.includes(145));
	assert.throws(() => ui.resize(-1, 600), /nonnegative/);
	ui.destroy();
});

test('component state styling wins over variants and context overrides', () => {
	const data = compile(
		[
			{ tag: 'component_variant', id: 'wide', width: 140 },
			scene([
				{
					tag: 'ui_container',
					id: 'box',
					width: 80,
					height: 20,
					background_token: 'panel',
					variant: 'wide',
					children: [{ tag: 'ui_state', state: 'idle', width: 160 }],
				},
			]),
			{
				tag: 'presentation_context',
				id: 'snow',
				theme: 'base',
				children: [{ tag: 'ui_override', target: 'scene:game/box', width: 100 }],
			},
		],
		{ values: {}, actions: [] },
	);
	const ui = new MwlPresentation(data, 'game', { parent: new Node2D(), state: () => ({}), actions: {} });
	ui.resize(800, 600);
	ui.setContext('snow');
	assert.equal(ui.get('game/box')?.width, 160);
	ui.destroy();
});

test('constructor failures and throwing adapter destructors still release the rest of the presentation', () => {
	const data = compile(
		[
			scene([
				{ tag: 'ui_adapter', id: 'a', adapter: 'world' },
				{ tag: 'ui_adapter', id: 'b', adapter: 'world' },
			]),
		],
		{ values: {}, actions: [], adapters: ['world'] },
	);
	const baselineTheme = themeChanged.size,
		baselineInput = Input.onAction.size;
	const parent = new Node2D();
	let created = 0,
		removed = 0;
	assert.throws(
		() =>
			new MwlPresentation(data, 'game', {
				parent,
				state: () => ({}),
				actions: {},
				adapters: {
					world: () => {
						if (++created === 2) throw new Error('adapter mount failed');
						return {
							view: new Node2D(),
							destroy: () => {
								removed++;
							},
						};
					},
				},
			}),
		/adapter mount failed/,
	);
	assert.equal(removed, 1);
	assert.equal(parent.children.length, 0);
	assert.equal(themeChanged.size, baselineTheme);
	assert.equal(Input.onAction.size, baselineInput);
	removed = 0;
	const ui = new MwlPresentation(data, 'game', {
		parent,
		state: () => ({}),
		actions: {},
		adapters: {
			world: () => ({
				view: new Node2D(),
				destroy: () => {
					removed++;
					throw new Error('adapter cleanup failed');
				},
			}),
		},
	});
	assert.throws(() => ui.destroy(), AggregateError);
	assert.equal(removed, 2);
	assert.equal(parent.children.length, 0);
	assert.equal(themeChanged.size, baselineTheme);
	assert.equal(Input.onAction.size, baselineInput);
	ui.destroy();
});
