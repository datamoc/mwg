import assert from 'node:assert/strict';
import test from 'node:test';
import {
	compile,
	compileAndEmitSources,
	compileNodes,
	compileSources,
	emitArtifacts,
	extractCatalog,
} from '../src/mwl/compiler.ts';
import { parse, preprocess, type MwlNode } from '../src/mwl/grammar.ts';
import {
	collectHookReferences,
	emitHooksDeclaration,
	parseHookReference,
	validateHookReferences,
} from '../src/mwl/hooks.ts';
import { createWorld, execute, MwlRuntime } from '../src/mwl/runtime.ts';
import { MWL_SCHEMA_10, schema01, schema10, validate } from '../src/mwl/schema.ts';
import { contentCatalog } from '../src/mwl/content.ts';
import { composeEffects, effectToModifier, inventoryItem, itemDefinition } from '../src/mwl/actors.ts';
import { evaluateExpression } from '../src/mwl/expression.ts';
import { validateCatalog } from '../src/mwl/catalog.ts';
import { decodeSave, encodeSave } from '../src/mwl/persistence.ts';
import { createFengariScriptHost } from '../src/mwl/fengari.ts';
import { createExpressionScriptHost } from '../src/mwl/scripts.ts';
import { contentReport, loadContent } from '../src/mwl/report.ts';
import { readAttributes, readChildren, readTableIndex, readTableMap, tableKey } from '../src/mwl/readers.ts';
import { evaluateCondition } from '../src/mwl/conditions.ts';
import { EntityRegistry } from '../src/core/Entity.ts';

test('EntityRegistry accepts stable caller-chosen ids and rejects collisions', () => {
	const registry = new EntityRegistry<{ name: string }>();
	const hero = { name: 'hero' };
	assert.equal(registry.add(hero, 'hero-N'), 'hero-N');
	assert.equal(registry.add(hero, 'hero-N'), 'hero-N');
	assert.throws(() => registry.add({ name: 'other' }, 'hero-N'), /already exists/);
	assert.equal(registry.add({ name: 'generated' }), 'e0');
});

test('MWL preprocesses macros, conditionals, and gettext values', () => {
	const source =
		"#define UNIT ID\n{ tag: 'unit_type', id: '{ID}', name: _(\"Hero\") }\n#enddef\n#ifdef HERO\n{UNIT hero}\n#endif";
	const expanded = preprocess(source, { defines: ['HERO'] });
	assert.match(expanded, /tag: 'unit_type'/);
	assert.match(expanded, /id: 'hero'/);
	assert.match(expanded, /\$gettext/);
});

test('MWL parses nested tags with source locations and validates types', () => {
	const nodes = parse(
		"[\n  { tag: 'game', schema: 0.1, children: [\n    { tag: 'unit_type', id: 'hero', hitpoints: 32 },\n  ] },\n]",
		'game.mwl',
	);
	assert.equal(nodes[0].children[0].location.line, 3);
	assert.deepEqual(validate(nodes), []);
});

test('MWL records exact attribute and value locations', () => {
	const nodes = parse(
		`[
	  { tag: 'game',
	    title: 'Campaign',
	    children: [{ tag: 'event', id: 'start' }],
	  },
]`,
		'locations.mwl',
	);
	assert.deepEqual(nodes[0].attributeLocations?.title, { file: 'locations.mwl', line: 3, column: 6 });
	assert.deepEqual(nodes[0].valueLocations?.title, { file: 'locations.mwl', line: 3, column: 13 });
	assert.deepEqual(nodes[0].children[0].attributeLocations?.id, { file: 'locations.mwl', line: 4, column: 33 });
	assert.deepEqual(nodes[0].children[0].valueLocations?.id, { file: 'locations.mwl', line: 4, column: 37 });
});

test('MWL accepts schema-neutral named node sugar and repeated children', () => {
	const nodes = parse(`[{ game: {
		schema: 0.1,
		unit_type: [
			{ id: 'hero', name: _('Hero') },
			{ id: 'scout', name: 'Scout' },
		],
	} }]`);
	assert.equal(nodes[0].tag, 'game');
	assert.deepEqual(
		nodes[0].children.map((node) => [node.tag, node.attributes.id]),
		[
			['unit_type', 'hero'],
			['unit_type', 'scout'],
		],
	);
	assert.equal(nodes[0].children[0].attributes.name, 'Hero');
	assert.deepEqual(validate(nodes), []);
});

test('MWL accepts campaign metadata and preserves game-owned campaign children', () => {
	const game = compile(`[{ tag: 'game', children: [
		{ tag: 'campaign', id: 'prologue', title: 'The Beginning', description: 'A first journey',
			start_scene: 'opening', children: [{ tag: 'scenario', id: 'opening' }] },
	] }]`);
	assert.equal(game.roots[0].children[0].location!.line, 2);
	assert.deepEqual(contentCatalog(game).campaigns, [
		{
			id: 'prologue',
			name: undefined,
			title: 'The Beginning',
			description: 'A first journey',
			startScene: 'opening',
			firstScenario: undefined,
			scenarios: [{ id: 'opening', nextScenario: undefined }],
		},
	]);
	assert.equal(game.roots[0].children[0].children[0].tag, 'scenario');
});

test('MWL validation reports unknown tags and attributes', () => {
	const nodes = parse("[{ tag: 'game', wat: 1, children: [{ tag: 'nope' }] }]");
	const diagnostics = validate(nodes);
	assert.equal(diagnostics[0].code, 'MWL_UNKNOWN_ATTRIBUTE');
	assert.deepEqual(diagnostics[0].location, { file: '<mwl>', line: 1, column: 17 });
	assert.equal(diagnostics[1].code, 'MWL_CHILD');
});

test('MWL validates typed tables and exposes typed rows through the content catalog', () => {
	const game = compile(`[{ tag: 'game', children: [
		{ tag: 'table', id: 'room_counts', columns: 'kind:string|specialBase:number|flags:list|modifiers:map',
			list_delimiter: ';', map_delimiter: '=', children: [
			{ tag: 'row', kind: 'standard', specialBase: 7, flags: 'small;secret', modifiers: 'str=2;dex=-1' },
		] },
	] }]`);
	assert.equal(game.roots[0].children[0].location!.line, 2);
	assert.deepEqual(contentCatalog(game).tables, [
		{
			id: 'room_counts',
			columns: [
				{ name: 'kind', type: 'string' },
				{ name: 'specialBase', type: 'number' },
				{ name: 'flags', type: 'list' },
				{ name: 'modifiers', type: 'map' },
			],
			rows: [
				{ kind: 'standard', specialBase: 7, flags: ['small', 'secret'], modifiers: { str: '2', dex: '-1' } },
			],
		},
	]);
});

test('MWL rejects malformed table shape and typed cells before compilation', () => {
	assert.throws(
		() =>
			compile(
				"[{ tag: 'table', id: 'rooms', columns: 'base:number|special:number', children: [{ tag: 'row', base: 6, extra: true }] }]",
			),
		/unknown table column extra/,
	);
	assert.throws(
		() =>
			compile(
				"[{ tag: 'table', id: 'rooms', columns: 'base:number|special:number', children: [{ tag: 'row', base: 'bad', special: 7 }] }]",
			),
		/base must be a number/,
	);
});

test('MWL validates declared references and acyclic reference graphs', () => {
	const schemas = {
		node: {
			attributes: { id: 'id', parent: 'ref' as const },
			refTargets: { parent: 'node' },
			acyclicRefs: ['parent'],
		},
	} as const;
	assert.equal(
		validate(parse("[{ tag: 'node', id: 'a' }, { tag: 'node', id: 'b', parent: 'a' }]"), schemas).length,
		0,
	);
	assert.equal(validate(parse("[{ tag: 'node', id: 'b', parent: 'missing' }]"), schemas)[0].code, 'MWL_REF_MISSING');
	assert.equal(
		validate(
			parse("[{ tag: 'node', id: 'a' }, { tag: 'node', id: 'a' }, { tag: 'node', id: 'b', parent: 'a' }]"),
			schemas,
		)[0].code,
		'MWL_REF_DUPLICATE',
	);
	assert.equal(
		validate(parse("[{ tag: 'node', id: 'a', parent: 'b' }, { tag: 'node', id: 'b', parent: 'a' }]"), schemas)[0]
			.code,
		'MWL_REF_CYCLE',
	);
});

test('MWL compiles JSON-shaped data, messages, and asset manifest', () => {
	const result = compile(
		"[{ tag: 'game', schema: 0.1, title: _(\"Demo\"), children: [{ tag: 'unit_type', id: 'hero', name: _(\"Hero\"), image: 'units/hero.png' }] }]",
	);
	assert.deepEqual(result.assets, ['units/hero.png']);
	assert.deepEqual(result.messages, ['Demo', 'Hero']);
});

test('MWL compiles a directory-shaped source set in stable file order', () => {
	const game = compileSources([
		{ file: 'content/z.mwl', source: "[{ tag: 'item', id: 'z', name: _(\"Z\") }]" },
		{ file: 'content/a.mwl', source: "[{ tag: 'item', id: 'a', name: _(\"A\") }]" },
	]);
	assert.deepEqual(
		game.roots.map((node) => node.attributes.id),
		['a', 'z'],
	);
	assert.deepEqual(game.messages, ['A', 'Z']);
});

test('MWL artifact emission is stable and accepts game-owned generated files', () => {
	const files = [{ file: 'game.mwl', source: "[{ tag: 'item', id: 'a', name: 'A' }]" }];
	const emitted: string[] = [];
	const artifacts = emitArtifacts(compileSources(files), {
		artifacts: { 'z.ts': 'export const z = 1;\n', 'a.ts': 'export const a = 1;\n' },
		onEmit: (artifact) => emitted.push(artifact.name),
	});
	assert.deepEqual(
		artifacts.map((artifact) => artifact.name),
		['game-data.ts', 'i18n.json', 'assets.json', 'a.ts', 'z.ts'],
	);
	assert.deepEqual(
		emitted,
		artifacts.map((artifact) => artifact.name),
	);
	assert.equal(
		compileAndEmitSources(files, {}, { artifacts: { 'generated.ts': 'ok\n' } }).at(-1)?.name,
		'generated.ts',
	);
});

test('MWL asset extraction accepts native CFG image and sound attributes', () => {
	const game = compile(
		"[{ tag: 'unit_type', id: 'hero', image: 'units/hero.png~FL(horiz)', profile: 'portraits/hero.png' }, { tag: 'attack', id: 'hit', sound: 'audio/hit.wav,audio/hit.ogg' }]",
	);
	assert.deepEqual(game.assets, ['audio/hit.ogg', 'audio/hit.wav', 'portraits/hero.png', 'units/hero.png']);
});

test('MWL asset extraction preserves sound range notation', () => {
	const game = compile("[{ tag: 'attack', id: 'hit', sound: 'human-hit-[1~5].ogg' }]");
	assert.deepEqual(game.assets, ['human-hit-[1~5].ogg']);
});

test('MWL asset extraction does not split transform arguments into assets', () => {
	const game = compile(
		"[{ tag: 'attack', id: 'hit', icon: 'attacks/blank.png~CS(-20,-20,50)~BLIT(attacks/border.png)' }]",
	);
	assert.deepEqual(game.assets, ['attacks/blank.png']);
});

test('MWL asset extraction does not split bracketed asset lists', () => {
	const game = compile("[{ tag: 'attack', id: 'hit', icon: 'attacks/hit-[1,2].png' }]");
	assert.deepEqual(game.assets, ['attacks/hit-[1,2].png']);
});

test('MWL asset extraction ignores numeric sound parameters', () => {
	const game = compile(
		"[{ tag: 'unit_type', id: 'hero', image: 'units/hero.png' }, { tag: 'attack', id: 'hit', sound: -20 }]",
	);
	assert.deepEqual(game.assets, ['units/hero.png']);
});

test('MWL content catalog exposes reusable item, monster, status, loot, and clock data', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [" +
			"{ tag: 'item', id: 'ring_haste', name: 'Haste', slot: 'ring', stackable: false, weight: 0.1, children: [{ tag: 'effect', apply_to: 'speed', increase: '10%' }] }," +
			"{ tag: 'monster', id: 'rat', name: 'Rat', hp: 8, damage_min: 1, damage_max: 4 }," +
			"{ tag: 'status', id: 'poisoned', duration: 3, tick: 'damage' }," +
			"{ tag: 'loot', item: 'ring_haste', chance: 0.25 }," +
			"{ tag: 'turn_clock', id: 'default', tick: 1, hunger: 0.1 }," +
			'] }]',
	);
	const result = contentCatalog(game);
	assert.equal(result.items[0].effects[0].applyTo, 'speed');
	assert.deepEqual(result.monsters[0].damage, [1, 4]);
	assert.equal(result.statuses[0].duration, 3);
	assert.equal(result.loot[0].chance, 0.25);
	assert.equal(result.turnClocks[0].hunger, 0.1);
});

test('MWL extracts only gettext-marked strings and builds an i18n catalog', () => {
	const result = compile(
		"[{ tag: 'game', schema: 0.1, title: _(\"Demo\"), children: [{ tag: 'movetype', name: 'smallfoot' }, { tag: 'unit_type', id: 'hero', name: 'Hero' }] }]",
	);
	// The unmarked technical `name` values are not translation messages.
	assert.deepEqual(result.messages, ['Demo']);
	const catalog = extractCatalog(result);
	assert.equal(catalog.locale, 'en');
	assert.equal(catalog.direction, 'ltr');
	assert.deepEqual(catalog.messages, { Demo: 'Demo' });
	assert.deepEqual(extractCatalog(result, { locale: 'fr' }).locale, 'fr');
});

test('MWL records which attributes carried the gettext marker', () => {
	const nodes = parse("[{ tag: 'unit_type', id: 'hero', name: _(\"Hero\") }]");
	assert.deepEqual(nodes[0].gettext, ['name']);
	assert.equal(nodes[0].attributes.name, 'Hero');
});

test('MWL keeps leading-underscore values such as aliasof=_bas intact', () => {
	const nodes = parse("[{ tag: 'terrain_type', id: 'village', string: '^Ve', aliasof: '_bas, Vt' }]");
	assert.equal(nodes[0].attributes.aliasof, '_bas, Vt');
	assert.deepEqual(nodes[0].gettext, []);
});

test('a "\\n" escape in a value keeps its text exactly as written', () => {
	const nodes = parse("[{ tag: 'message', text: 'Line one\\n  Line two\\n' }]");
	assert.equal(nodes[0].attributes.text, 'Line one\n  Line two\n');
});

test('a multi-line value may carry the gettext marker and reach the message catalog', () => {
	const nodes = parse('[{ tag: \'message\', text: _("Hold the line,\\nthen advance.") }]');
	assert.equal(nodes[0].attributes.text, 'Hold the line,\nthen advance.');
	assert.deepEqual(nodes[0].gettext, ['text']);
	const compiled = compile('[{ tag: \'game\', schema: 0.1, title: _("Hold the line,\\nthen advance.") }]');
	assert.deepEqual(compiled.messages, ['Hold the line,\nthen advance.']);
});

test('a backslash line continuation joins a value across source lines', () => {
	const nodes = parse(
		'[{ tag: \'message\', text: "The old king spoke slowly, \\\nas though each word cost him something." }]',
	);
	assert.equal(nodes[0].attributes.text, 'The old king spoke slowly, as though each word cost him something.');
});

test('a node after a multi-line value keeps its own source location', () => {
	const nodes = parse(
		"[\n  { tag: 'game', title: \"one\\ntwo\", children: [\n    { tag: 'unit_type', id: 'hero' },\n  ] },\n]",
		'game.mwl',
	);
	assert.equal(nodes[0].children[0].location.line, 3);
});

test('an unterminated document or a non-scalar attribute value is a syntax error', () => {
	assert.throws(() => parse("[{ tag: 'message'"), /JSON5/);
	assert.throws(() => parse("[{ tag: 'message', text: ['never', 'a scalar'] }]"), /must be a string/);
	assert.throws(() => parse("{ tag: 'game' }"), /top-level array/);
});

test('MWL collects, validates, and declares hook references', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [" +
			"{ tag: 'event', id: 'e', on: 'start', children: [{ tag: 'hook', name: 'command:haunted_ruin', intensity: 3 }] }," +
			"{ tag: 'objectives', children: [{ tag: 'victory', side: 1, condition: 'hook', hook: 'predicate:relic_recovered' }] }," +
			'] }]',
	);
	const references = collectHookReferences(game);
	assert.deepEqual(
		references.map((reference) => `${reference.type}:${reference.name}`),
		['command:haunted_ruin', 'predicate:relic_recovered'],
	);
	const diagnostics = validateHookReferences(references, ['predicate:relic_recovered']);
	assert.equal(diagnostics.length, 1);
	assert.equal(diagnostics[0].code, 'MWL_HOOK');
	assert.equal(diagnostics[0].message, 'hook command:haunted_ruin is not implemented');
	const declaration = emitHooksDeclaration(references);
	assert.match(declaration, /'command:haunted_ruin': CommandHook;/);
	assert.match(declaration, /'predicate:relic_recovered': PredicateHook;/);
	assert.equal(parseHookReference('nope'), null);
	assert.deepEqual(parseHookReference('modifier:backstab'), { type: 'modifier', name: 'backstab' });
});

test('MWL accepts game-declared domain hook namespaces without knowing their domain types', () => {
	assert.deepEqual(parseHookReference('item-effect:potion-strength'), {
		type: 'item-effect',
		name: 'potion-strength',
	});
	const declaration = emitHooksDeclaration([{ type: 'item-effect', name: 'potion-strength' }]);
	assert.match(declaration, /'item-effect:potion-strength': MwlDomainHook;/);
	const game = compile("[{ tag: 'hook', name: 'item-effect:potion-strength' }]");
	assert.deepEqual(
		validateCatalog(game, {
			hooks: ['item-effect:potion-strength'],
		}),
		[],
	);
});

test('MWL runtime executes deterministic world commands', () => {
	const world = createWorld();
	execute(world, { name: 'spawn', target: 'hero', x: 1, y: 2, hp: 10 });
	execute(world, { name: 'move', target: 'hero', x: 2, y: 2 });
	execute(world, { name: 'modify_gold', target: 'side1', amount: 5 });
	execute(world, { name: 'end_turn' });
	execute(world, { name: 'set_variable', target: 'progress.stage', value: 'two' });
	assert.deepEqual(world.units.hero, { hp: 10, x: 2, y: 2, alive: true });
	assert.equal(world.gold.side1, 5);
	assert.equal(world.turn, 2);
	assert.deepEqual(world.variables.progress, { stage: 'two' });
});

test('MWL runtime loads units and runs compiled event commands', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [" +
			"{ tag: 'unit', id: 'hero', hp: 20, x: 0, y: 1 }," +
			"{ tag: 'event', id: 'start', trigger: 'start', children: [" +
			"{ tag: 'command', name: 'move', target: 'hero', x: 2, y: 3 }," +
			"{ tag: 'command', name: 'set_variable', target: 'started', value: true }," +
			'] },' +
			'] }]',
	);
	const runtime = new MwlRuntime(game);
	runtime.run('start');
	assert.deepEqual(runtime.world.units.hero, { hp: 20, x: 2, y: 3, alive: true });
	assert.equal(runtime.world.variables.started, 'true');
	assert.deepEqual(runtime.world.sides, {});
	const saved = runtime.save();
	execute(runtime.world, { name: 'kill', target: 'hero' });
	runtime.restore(saved);
	assert.equal(runtime.world.units.hero.alive, true);
});

test('MWL event runtime supports numeric conditions, expressions, fire-by-id, ids, and coordinate ranges', () => {
	const source =
		"[{ tag: 'game', children: [{ tag: 'unit', id: 'hero', x: 2, y: 3 }," +
		"{ tag: 'event', id: 'start', on: 'start', children: [{ tag: 'set_variable', name: 'count', value: 1 }] }," +
		"{ tag: 'event', id: 'counter', on: 'turn', children: [{ tag: 'condition', variable: 'count', equals: 1 }, { tag: 'set_variable', name: 'count', value: 'count + 2' }] }," +
		"{ tag: 'event', id: 'move-id', on: 'moveto', x: '1,2,4-5', y: 3, once: false, children: [{ tag: 'filter', unit: 'hero' }, { tag: 'set_variable', name: 'arrived', value: 'yes' }] }," +
		"{ tag: 'event', id: 'manual', on: 'never', children: [{ tag: 'set_variable', name: 'manual', value: 'done' }] }," +
		'] }]';
	const runtime = new MwlRuntime(compile(source));
	runtime.run('start');
	assert.equal(runtime.world.variables.count, 1);
	runtime.run('turn');
	assert.equal(runtime.world.variables.count, 3);
	assert.equal(runtime.fireEvent('manual'), true);
	assert.equal(runtime.world.variables.manual, 'done');
	runtime.fireMoveto('hero');
	assert.equal(runtime.world.variables.arrived, 'yes');
});

test('MWL unit filters accept coordinate ranges and lists, the same shape a moveto event uses', () => {
	const source =
		"[{ tag: 'game', children: [{ tag: 'unit', id: 'hero', x: 4, y: 3 }," +
		"{ tag: 'event', id: 'in-range', on: 'turn', children: [{ tag: 'filter', x: '1,2,4-5', y: 3 }, { tag: 'set_variable', name: 'found', value: 'yes' }] }," +
		"{ tag: 'event', id: 'out-of-range', on: 'turn', children: [{ tag: 'filter', x: '6-9' }, { tag: 'set_variable', name: 'missed', value: 'yes' }] }," +
		'] }]';
	const runtime = new MwlRuntime(compile(source));
	runtime.run('turn');
	assert.equal(runtime.world.variables.found, 'yes');
	assert.equal(runtime.world.variables.missed, undefined);
});

test('MWL unit filters and unit_at objectives can constrain by unit id and side', () => {
	const source =
		"[{ tag: 'game', children: [{ tag: 'unit', id: 'hero', side: 2, x: 1, y: 1 }," +
		"{ tag: 'event', id: 'hit', on: 'turn', children: [{ tag: 'filter', unit: 'hero' }, { tag: 'set_variable', name: 'found', value: 'yes' }] }," +
		"{ tag: 'objectives', children: [{ tag: 'victory', condition: 'unit_at', x: 1, y: 1, side_filter: 2 }] }," +
		'] }]';
	const runtime = new MwlRuntime(compile(source));
	runtime.run('turn');
	assert.equal(runtime.world.variables.found, 'yes');
	assert.equal(runtime.evaluate(), 'won');
});

test('MWL runtime respects event conditions and resolves attack damage', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [" +
			"{ tag: 'unit', id: 'hero', hp: 5 }," +
			"{ tag: 'event', id: 'hit', trigger: 'turn', children: [" +
			"{ tag: 'condition', variable: 'armed', equals: true }," +
			"{ tag: 'command', name: 'attack', target: 'hero', amount: 5 }," +
			'] },' +
			'] }]',
	);
	const runtime = new MwlRuntime(game);
	runtime.run('turn');
	assert.equal(runtime.world.units.hero.alive, true);
	runtime.world.variables.armed = 'true';
	runtime.run('turn');
	assert.equal(runtime.world.units.hero.alive, false);
});

test('MWL runtime accepts the documented command tags and unit filters', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [" +
			"{ tag: 'unit', id: 'hero', type: 'Spearman', side: 1, hp: 5 }," +
			"{ tag: 'event', id: 'start', on: 'start', children: [" +
			"{ tag: 'filter', side: 1, type: 'Spearman' }," +
			"{ tag: 'attack', defender: 'hero', amount: 2 }," +
			"{ tag: 'gold', side: 1, delta: 10 }," +
			'] },' +
			'] }]',
	);
	const runtime = new MwlRuntime(game);
	runtime.run('start');
	assert.equal(runtime.world.units.hero.hp, 3);
	assert.equal(runtime.world.sides['1'], undefined);
	assert.equal(runtime.world.gold['1'], 10);
});

test('MWL open attribute maps accept game-defined keys and check their values', () => {
	const nodes = parse(
		"[{ tag: 'movetype', name: 'smallfoot', children: [" +
			"{ tag: 'movement_costs', flat: 1, forest: 2 }," +
			"{ tag: 'defense', flat: 60, forest: 50 }," +
			"{ tag: 'resistance', arcane: 90, pierce: 100 }," +
			'] }]',
	);
	assert.deepEqual(validate(nodes), []);
	const bad = parse("[{ tag: 'movetype', name: 'smallfoot', children: [{ tag: 'movement_costs', flat: 'fast' }] }]");
	const diagnostics = validate(bad);
	assert.equal(diagnostics[0].code, 'MWL_VALUE');
	assert.match(diagnostics[0].message, /must be number/);
});

test('MWL open child schemas accept opaque nested game-owned tags', () => {
	const nodes = parse(
		"[{ tag: 'container', children: [{ tag: 'damage', type: 'fire', amount: 2, children: [{ tag: 'filter', role: 'leader' }] }] }]",
	);
	assert.deepEqual(
		validate(nodes, {
			container: { children: [], openChildren: true },
		}),
		[],
	);
});

test('MWL closed schemas still reject unknown child tags', () => {
	const diagnostics = validate(parse("[{ tag: 'container', children: [{ tag: 'damage', type: 'fire' }] }]"), {
		container: { children: [] },
	});
	assert.equal(diagnostics[0].code, 'MWL_CHILD');
	assert.equal(diagnostics[1].code, 'MWL_UNKNOWN_TAG');
});

test('MWL terrain_type accepts the generic terrain attributes', () => {
	const nodes = parse(
		"[{ tag: 'terrain_type', id: 'grassland', string: 'Gg', aliasof: 'Gt', mvt_alias: '-,_bas,St', default_base: 'Gg', heals: 8, gives_income: true }]",
	);
	assert.deepEqual(validate(nodes), []);
});

test('MWL still rejects unknown attributes on closed tags', () => {
	const diagnostics = validate(parse("[{ tag: 'terrain_type', id: 'meadow', wat: 1 }]"));
	assert.equal(diagnostics[0].code, 'MWL_UNKNOWN_ATTRIBUTE');
});

test('MWL expressions and item effects stay game-defined', () => {
	assert.ok(Math.abs(evaluateExpression('1.3^level', { level: 2 }) - 1.69) < 1e-12);
	assert.equal(evaluateExpression('(1+2)*3-4/2', {}), 7);
	assert.equal(
		composeEffects(10, [
			{ applyTo: 'attack', operation: 'add', value: '2' },
			{ applyTo: 'attack', operation: 'multiply', value: '1.5' },
		]),
		18,
	);
	assert.throws(() => evaluateExpression('1/0', {}));
	assert.throws(() => evaluateExpression('level', {}));
	assert.throws(() => evaluateExpression('(', {}));
	assert.deepEqual(
		effectToModifier(
			{ applyTo: 'attack', operation: 'add', value: 'missing_hp_fraction' },
			{ missing_hp_fraction: 4 },
		),
		{
			stat: 'attack',
			op: 'add',
			value: 4,
		},
	);
});

test('MWL actor adapters translate every supported modifier operation', () => {
	assert.equal(effectToModifier({ applyTo: 'attack', operation: 'sub', value: '2' }).value, -2);
	assert.equal(effectToModifier({ applyTo: 'speed', operation: 'divide', value: '2' }).value, 0.5);
	assert.equal(effectToModifier({ applyTo: 'hp', operation: 'set', value: '7' }).op, 'set');
	assert.throws(() => effectToModifier({ applyTo: 'hp', operation: 'unknown', value: '1' }));
	assert.throws(() => effectToModifier({ applyTo: 'hp', operation: 'add' }));
	const item = itemDefinition({ id: 'potion', name: 'Potion', stackable: true, weight: 1, effects: [] });
	assert.deepEqual(inventoryItem(item, 3), { id: 'potion', quantity: 3, stackable: true, weight: 1 });
});

test('an item authors image/icon (item 307), collected into the asset manifest like any other asset attribute', () => {
	const game = compile(
		"[{ tag: 'game', schema: 0.1, children: [{ tag: 'item', id: 'potion', name: 'Potion', image: 'items/potion.png', icon: 'items/potion-icon.png' }] }]",
	);
	assert.deepEqual(new Set(game.assets), new Set(['items/potion.png', 'items/potion-icon.png']));

	const [item] = contentCatalog(game).items;
	assert.equal(item.image, 'items/potion.png');
	assert.equal(item.icon, 'items/potion-icon.png');
});

test('MWL catalog validation catches duplicate ids, slots, effects, and hooks', () => {
	const game = compile(
		"[{ tag: 'item', id: 'ring', name: 'Ring', slot: 'finger', children: [{ tag: 'effect', add: 1 }] }," +
			" { tag: 'item', id: 'ring', name: 'Other' }," +
			" { tag: 'hook', name: 'bad-hook' }]",
	);
	const codes = validateCatalog(game, { slots: ['weapon'], hooks: ['command:known'] }).map(
		(diagnostic) => diagnostic.code,
	);
	assert.deepEqual(codes, ['MWL_UNKNOWN_SLOT', 'MWL_INCOMPLETE_EFFECT', 'MWL_DUPLICATE_ID', 'MWL_INVALID_HOOK']);
});

test('MWL catalog validation rejects coordinates outside supplied map bounds', () => {
	const game = compile("[{ tag: 'filter', x: 3, y: '1-2' }]");
	const diagnostics = validateCatalog(game, { mapBounds: { width: 3, height: 4 } });
	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		['MWL_COORDINATE'],
	);
	assert.deepEqual(diagnostics[0].location, { file: '<mwl>', line: 1, column: 22 });
});

test('MWL catalog validation rejects cycles in resolved aliases', () => {
	const game = compile(
		`[{ tag: 'game', children: [
			{ tag: 'terrain_type', id: 'a', aliasof: 'b' },
			{ tag: 'terrain_type', id: 'b', aliasof: 'a' },
		] }]`,
	);
	const diagnostics = validateCatalog(game);
	assert.deepEqual(
		diagnostics.map((diagnostic) => diagnostic.code),
		['MWL_ALIAS_CYCLE'],
	);
	assert.equal(diagnostics[0].location.file, '<mwl>');
});

test('MWL publishes schema 1.0 as a lossless compatible vocabulary', () => {
	assert.equal(MWL_SCHEMA_10, '1.0');
	assert.notEqual(schema10.game, schema01.game);
	const migrated = compile("[{ tag: 'game', schema: '1.0' }]");
	assert.equal(migrated.schema, '1.0');
	const invalid = validate(parse("[{ tag: 'game', schema: '1.0' }]"), schema10);
	assert.deepEqual(
		invalid.map((diagnostic) => diagnostic.code),
		[],
	);
	assert.deepEqual(
		validate(parse("[{ tag: 'table', id: 'loot', columns: 'id:string' }]"), schema10).map(
			(diagnostic) => diagnostic.code,
		),
		['MWL_CARDINALITY'],
	);
	assert.deepEqual(
		validate(parse("[{ tag: 'unit', id: 'hero' }]"), schema10).map((diagnostic) => diagnostic.code),
		['MWL_REQUIRED_ATTRIBUTE', 'MWL_REQUIRED_ATTRIBUTE'],
	);
});

test('a declared hook validates the attributes its own [hook] calls carry', () => {
	const game = compile(
		"[{ tag: 'hook', name: 'command:set_variable_dynamic', mode: 'literal', value: 'ok' }," +
			" { tag: 'hook', name: 'command:set_variable_dynamic', mode: 'literl', value: 'ok' }]",
	);
	assert.deepEqual(
		validateCatalog(game, {
			hooks: [
				{
					id: 'command:set_variable_dynamic',
					attributes: { mode: ['literal', 'number', 'expression'], value: 'string' },
				},
			],
		}).map((diagnostic) => diagnostic.message),
		['mode must be one of literal, number, expression on hook command:set_variable_dynamic'],
	);
	assert.deepEqual(
		validateCatalog(game, {
			hooks: [{ id: 'command:set_variable_dynamic', openAttributes: 'string' }],
		}),
		[],
		'an open hook accepts any attribute name, the way an open tag does',
	);
});

test('an undeclared hook attribute and an undeclared hook name are both reported', () => {
	const game = compile("[{ tag: 'hook', name: 'command:mark', mark: 'ok' }]");
	assert.deepEqual(
		validateCatalog(game, { hooks: [{ id: 'command:mark', attributes: { value: 'string' } }] }).map(
			(diagnostic) => diagnostic.code,
		),
		['MWL_UNKNOWN_ATTRIBUTE'],
	);
	//a bare id declares the hook exists without claiming anything about its attributes
	assert.deepEqual(validateCatalog(game, { hooks: ['command:mark'] }), []);
	assert.deepEqual(
		validateCatalog(game, { hooks: ['command:other'] }).map((diagnostic) => diagnostic.code),
		['MWL_UNKNOWN_HOOK'],
	);
});

test('rowIdScope defaults to global: the same id reused across files is still a duplicate', () => {
	const game = compileSources([
		{ file: 'weapons.mwl', source: "[{ tag: 'item', id: 'sword', name: 'Sword' }]" },
		{ file: 'armor.mwl', source: "[{ tag: 'item', id: 'sword', name: 'Also Sword' }]" },
	]);
	const codes = validateCatalog(game).map((diagnostic) => diagnostic.code);
	assert.deepEqual(codes, ['MWL_DUPLICATE_ID']);
});

test("rowIdScope: 'file' allows the same id across files, catching a real duplicate within one", () => {
	const acrossFiles = compileSources([
		{ file: 'weapons.mwl', source: "[{ tag: 'item', id: 'sword', name: 'Sword' }]" },
		{ file: 'armor.mwl', source: "[{ tag: 'item', id: 'sword', name: 'Also Sword' }]" },
	]);
	assert.deepEqual(validateCatalog(acrossFiles, { rowIdScope: 'file' }), []);

	const withinOneFile = compileSources([
		{
			file: 'weapons.mwl',
			source: "[{ tag: 'item', id: 'sword', name: 'Sword' }, { tag: 'item', id: 'sword', name: 'Other' }]",
		},
	]);
	const codes = validateCatalog(withinOneFile, { rowIdScope: 'file' }).map((diagnostic) => diagnostic.code);
	assert.deepEqual(codes, ['MWL_DUPLICATE_ID']);
});

test('MWL saves are versioned and migrated, while legacy snapshots remain readable', () => {
	const world = {
		turn: 1,
		variables: {},
		units: {},
		sides: {},
		maps: {},
		gold: {},
		status: 'playing' as const,
		map: null,
		timeOfDay: '',
		scheduleIndex: 0,
	};
	const snapshot = encodeSave(world, { version: 1 });
	const restored = decodeSave(snapshot, {
		version: 2,
		migrations: { 2: (value) => ({ ...value, turn: value.turn + 1 }) },
	});
	assert.equal(restored.turn, 2);
	assert.equal(decodeSave(JSON.stringify(world), { version: 1 }).turn, 1);
});

test('MWL saves and restores explicitly declared game-owned hook state', () => {
	let charges = 3;
	const runtime = new MwlRuntime(compile("[{ tag: 'game', schema: 0.1 }]"), {
		hooks: {
			saveable: {
				'item-effect:potion-strength': {
					save: () => ({ charges }),
					restore: (state) => {
						charges = (state as { charges: number }).charges;
					},
				},
			},
		},
	});
	runtime.run('start');
	const snapshot = runtime.save();
	charges = 0;
	runtime.restore(snapshot);
	assert.equal(charges, 3);
	assert.match(snapshot, /"hookState"/);
	assert.deepEqual(
		runtime.journal.all.map((entry) => entry.action),
		[{ type: 'run', trigger: 'start' }],
	);
});

test('MWL unit_type accepts a spaced display id from a converted source', () => {
	const nodes = parse("[{ tag: 'unit_type', id: 'Drake Arbiter', hitpoints: 40 }]");
	assert.deepEqual(validate(nodes), []);
});

test('MWL compileNodes validates and compiles a programmatic node tree', () => {
	const location = { file: 'converted://terrain.cfg', line: 0, column: 0 };
	const nodes: MwlNode[] = [
		{
			tag: 'terrain_type',
			attributes: { id: 'grassland', string: 'Gg', aliasof: 'Gt', heals: '0', gives_income: 'false' },
			children: [],
			location,
		},
		{
			tag: 'movetype',
			attributes: { name: 'smallfoot' },
			children: [
				{ tag: 'movement_costs', attributes: { flat: '1' }, children: [], location },
				{ tag: 'defense', attributes: { flat: '60' }, children: [], location },
			],
			location,
		},
	];
	const game = compileNodes(nodes);
	assert.equal(game.roots.length, 2);
	assert.deepEqual(game.roots[1].children[0].attributes, { flat: '1' });
});

test('MWL content catalog exposes game-neutral AI behaviors', () => {
	const game = compile(
		"[{ tag: 'ai', id: 'basic', strategy: 'balanced', children: [{ tag: 'behavior', id: 'advance', when: 'enemy_visible', action: 'move_toward_enemy', hook: 'ai:advance' }] }]",
	);
	const catalog = contentCatalog(game);
	assert.deepEqual(catalog.ai[0], {
		id: 'basic',
		strategy: 'balanced',
		target: undefined,
		difficulty: undefined,
		scope: undefined,
		provider: undefined,
		algorithm: undefined,
		depth: undefined,
		maxNodes: undefined,
		player: undefined,
		moves: undefined,
		apply: undefined,
		terminal: undefined,
		evaluate: undefined,
		behaviors: [{ id: 'advance', when: 'enemy_visible', action: 'move_toward_enemy', hook: 'ai:advance' }],
	});
});

test('MWL describes actor and controller alpha-beta profiles', () => {
	const game = compile(
		"[{ tag: 'ai', id: 'hero-brain', scope: 'actor', provider: 'javascript', algorithm: 'alpha_beta', depth: 2, max_nodes: 500, moves: 'ai:legal', apply: 'ai:apply', terminal: 'ai:terminal', evaluate: 'ai:score' }," +
			" { tag: 'ai', id: 'chess-master', scope: 'controller', provider: 'lua', algorithm: 'alpha_beta', depth: 4, player: 'current_player' }]",
	);
	assert.deepEqual(contentCatalog(game).ai, [
		{
			id: 'hero-brain',
			strategy: undefined,
			target: undefined,
			difficulty: undefined,
			scope: 'actor',
			provider: 'javascript',
			algorithm: 'alpha_beta',
			depth: 2,
			maxNodes: 500,
			player: undefined,
			moves: 'ai:legal',
			apply: 'ai:apply',
			terminal: 'ai:terminal',
			evaluate: 'ai:score',
			behaviors: [],
		},
		{
			id: 'chess-master',
			strategy: undefined,
			target: undefined,
			difficulty: undefined,
			scope: 'controller',
			provider: 'lua',
			algorithm: 'alpha_beta',
			depth: 4,
			maxNodes: undefined,
			player: 'current_player',
			moves: undefined,
			apply: undefined,
			terminal: undefined,
			evaluate: undefined,
			behaviors: [],
		},
	]);
});

test('MWL Fengari host evaluates Lua with context and calls game-owned emitters', () => {
	const host = createFengariScriptHost({ seed: 7 });
	assert.equal(host.evaluate('hp + 2', { hp: 3 }), 5);
	const events: Array<[string, unknown]> = [];
	host.execute('mwg_emit("spawn", { type = unit_type, x = 2 })', { unit_type: 'scout' }, (name, payload) => {
		events.push([name, payload]);
	});
	assert.deepEqual(events, [['spawn', { type: 'scout', x: 2 }]]);
	host.execute('function double(value) return value * 2 end');
	assert.equal(host.call('double', [4]), 8);
	host.dispose();
});

test('MWL Fengari host is deterministic, sandboxed, and budgeted', () => {
	const first = createFengariScriptHost({ seed: 9 });
	const second = createFengariScriptHost({ seed: 9 });
	assert.equal(first.evaluate('math.random()'), second.evaluate('math.random()'));
	assert.throws(() => first.evaluate('os.execute("echo unsafe")'));
	first.dispose();
	second.dispose();
	const limited = createFengariScriptHost({ instructionLimit: 10 });
	assert.throws(() => limited.execute('while true do end'), /instruction limit/i);
	limited.dispose();
});

test('MWL expression host is the statement-free default', () => {
	const host = createExpressionScriptHost();
	assert.equal(host.evaluate('level * 2', { level: 4 }), 8);
	assert.throws(() => host.evaluate('level', { level: 'four' }), /numeric/i);
	assert.throws(() => host.execute('level = 2'), /cannot execute/i);
	host.dispose();
});

test('MWL content report counts tags and finds dangling references', () => {
	const report = contentReport(
		compile(
			"[{ tag: 'game', children: [{ tag: 'unit_type', id: 'hero', children: [{ tag: 'ability', id: 'heal', name: 'Heal' }] }, { tag: 'loot', item: 'missing' }] }]",
		),
	);
	assert.deepEqual(report.tags, { ability: 1, game: 1, loot: 1, unit_type: 1 });
	assert.deepEqual(report.danglingReferences, ['missing']);
});

test('MWL content loading returns resources, dependencies and diagnostics', () => {
	const loaded = loadContent([
		{
			file: 'content.mwl',
			source: "[{ tag: 'game', children: [{ tag: 'map', id: 'arena', file: 'hero.png' }] }]",
		},
	]);
	assert.deepEqual(loaded.resources, ['hero.png']);
	assert.deepEqual(loaded.diagnostics, []);
	assert.ok(loaded.game);
	const failed = loadContent([{ file: 'broken.mwl', source: "[{ tag: 'unknown', value: 'x' }]" }]);
	assert.equal(failed.game, undefined);
	assert.equal(failed.diagnostics[0]?.severity, 'error');
});

test('MWL readers coerce fields, collect children, and preserve diagnostics', () => {
	const node = compile("[{ tag: 'unit', id: 'hero', side: 2, x: 4, y: 5 }]").roots[0];
	const result = readAttributes<{ id: string; side: number; active: boolean }>(node, {
		id: { type: 'id', required: true },
		side: { type: 'integer' },
		active: { type: 'boolean', default: false },
	});
	assert.deepEqual(result.value, { id: 'hero', side: 2, active: false });
	assert.deepEqual(result.diagnostics, []);
	const badNode = { ...node, attributes: { ...node.attributes, side: 'two' } };
	const bad = readAttributes<{ side: number }>(badNode, {
		side: { type: 'integer', required: true },
	});
	assert.equal(bad.diagnostics[0].code, 'MWL_FIELD_TYPE');
	const children = readChildren(node, 'missing', (child) => readAttributes(child, {}));
	assert.deepEqual(children.value, []);
});

test('the id reader accepts the same names the schema does, index brackets included', () => {
	const node = compile("[{ tag: 'unit', id: 'hero' }]").roots[0];
	//the schema types a variable name as `id` and now accepts `a[0].b` there, so the reader
	//an adapter coerces that name with has to accept it too rather than call it invalid
	const read = readAttributes<{ name: string; list: string[] }>(
		{ ...node, attributes: { name: 'party[0].name', list: 'a,party[1]' } },
		{ name: { type: 'id' }, list: { type: 'id-list' } },
	);
	assert.deepEqual(read.value, { name: 'party[0].name', list: ['a', 'party[1]'] });
	assert.deepEqual(read.diagnostics, []);

	const bad = readAttributes<{ name: string }>({ ...node, attributes: { name: '0bad' } }, { name: { type: 'id' } });
	assert.equal(bad.diagnostics[0]?.code, 'MWL_FIELD_TYPE', 'a non-identifier is still refused');
});

test('unknown MWL macros fail strictly with their source location', () => {
	assert.throws(
		() => preprocess("[{ tag: 'game' }, {MISSING}]", { file: 'unknown.mwl' }),
		(error: unknown) => {
			assert.ok(error instanceof Error);
			assert.match(error.message, /unknown\.mwl:1:19: unknown macro "MISSING"/);
			return true;
		},
	);
	assert.equal(
		preprocess("[{ tag: 'game' }, {MISSING}]", { file: 'legacy.mwl', macroPolicy: 'ignore' }),
		"[{ tag: 'game' }, {MISSING}]",
	);
	assert.equal(
		preprocess("[{ tag: 'game', title: '{MISSING}' }] // {NOPE}"),
		"[{ tag: 'game', title: '{MISSING}' }] // {NOPE}",
	);
});

test('table readers project typed maps and preserve composite key types', () => {
	const rows = [
		{ item: 'potion', effect: 'heal', amount: 5 },
		{ item: 'potion', effect: 'speed', amount: 2 },
		{ item: 'scroll', effect: 'heal', amount: 8 },
	] as const;
	const map = readTableMap(rows, { key: ['item', 'effect'], value: (row) => row.amount });
	assert.equal(map.get(tableKey('potion', 'heal')), 5);
	assert.equal(map.get(tableKey('scroll', 'heal')), 8);
	assert.equal(map.get(tableKey('potion', 'missing')), undefined);
	const index = readTableIndex(rows, { key: 'effect' });
	assert.deepEqual(
		index.get(tableKey('heal'))?.map((row) => row.item),
		['potion', 'scroll'],
	);
	assert.deepEqual(
		index.get(tableKey('speed'))?.map((row) => row.item),
		['potion'],
	);
});

test('table maps reject duplicate keys unless last-write wins is explicit', () => {
	const rows = [
		{ id: 'same', value: 1 },
		{ id: 'same', value: 2 },
	];
	assert.throws(() => readTableMap(rows, { key: 'id' }), /duplicate table key/);
	const last = readTableMap(rows, { key: 'id', value: (row) => row.value, duplicate: 'last' });
	assert.equal(last.get(tableKey('same')), 2);
});

test('MWL conditions evaluate bounded comparisons and explicit helpers', () => {
	assert.equal(
		evaluateCondition('level < other.level and not petrified', { level: 2, 'other.level': 3, petrified: false }),
		true,
	);
	assert.equal(evaluateCondition('adjacent == true or hp <= 0', { adjacent: false, hp: 0 }), true);
	assert.equal(evaluateCondition('distance(a, b) < 3', { a: 1, b: 2 }, { helpers: { distance: () => 2 } }), true);
	assert.equal(evaluateCondition('bonus > 3 where bonus = level + 2', { level: 2 }), true);
	assert.throws(() => evaluateCondition('unknown == 1', {}), /missing/i);
});
