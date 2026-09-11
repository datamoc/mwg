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
import { validate } from '../src/mwl/schema.ts';
import { contentCatalog } from '../src/mwl/content.ts';
import { composeEffects, effectToModifier, inventoryItem, itemDefinition } from '../src/mwl/actors.ts';
import { evaluateExpression } from '../src/mwl/expression.ts';
import { validateCatalog } from '../src/mwl/catalog.ts';
import { decodeSave, encodeSave } from '../src/mwl/persistence.ts';
import { createFengariScriptHost } from '../src/mwl/fengari.ts';
import { createExpressionScriptHost } from '../src/mwl/scripts.ts';
import { contentReport, loadContent } from '../src/mwl/report.ts';
import { readAttributes, readChildren } from '../src/mwl/readers.ts';
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
		'#define UNIT ID\n[unit_type]\nid={ID}\nname=_ "Hero"\n[/unit_type]\n#enddef\n#ifdef HERO\n{UNIT hero}\n#endif';
	const expanded = preprocess(source, { defines: ['HERO'] });
	assert.match(expanded, /id=hero/);
	assert.match(expanded, /name=_ "Hero"/);
});

test('MWL parses nested tags with source locations and validates types', () => {
	const nodes = parse('[game]\nschema="0.1"\n[unit_type]\nid=hero\nhitpoints=32\n[/unit_type]\n[/game]', 'game.mwl');
	assert.equal(nodes[0].children[0].location.line, 3);
	assert.deepEqual(validate(nodes), []);
});

test('MWL accepts campaign metadata and preserves game-owned campaign children', () => {
	const game = compile(`[game]
[campaign]
id=prologue
title="The Beginning"
description="A first journey"
start_scene=opening
[scenario]
id=opening
[/scenario]
[/campaign]
[/game]`);
	assert.deepEqual(contentCatalog(game).campaigns, [
		{
			id: 'prologue',
			name: undefined,
			title: 'The Beginning',
			description: 'A first journey',
			startScene: 'opening',
		},
	]);
	assert.equal(game.roots[0].children[0].children[0].tag, 'scenario');
});

test('MWL validation reports unknown tags and attributes', () => {
	const nodes = parse('[game]\nwat=1\n[nope]\n[/nope]\n[/game]');
	const diagnostics = validate(nodes);
	assert.equal(diagnostics[0].code, 'MWL_UNKNOWN_ATTRIBUTE');
	assert.equal(diagnostics[1].code, 'MWL_CHILD');
});

test('MWL validates typed tables and exposes typed rows through the content catalog', () => {
	const game = compile(`[game]
[table]
id=room_counts
columns=kind:string|specialBase:number|flags:list|modifiers:map
list_delimiter=;
map_delimiter==
[row]
kind=standard
specialBase=7
flags=small;secret
modifiers=str=2;dex=-1
[/row]
[/table]
[/game]`);
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
				'[table]\nid=rooms\ncolumns=base:number|special:number\n[row]\nbase=6\nextra=true\n[/row]\n[/table]',
			),
		/unknown table column extra/,
	);
	assert.throws(
		() =>
			compile(
				'[table]\nid=rooms\ncolumns=base:number|special:number\n[row]\nbase=bad\nspecial=7\n[/row]\n[/table]',
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
	assert.equal(validate(parse('[node]\nid=a\n[/node]\n[node]\nid=b\nparent=a\n[/node]'), schemas).length, 0);
	assert.equal(validate(parse('[node]\nid=b\nparent=missing\n[/node]'), schemas)[0].code, 'MWL_REF_MISSING');
	assert.equal(
		validate(parse('[node]\nid=a\n[/node]\n[node]\nid=a\n[/node]\n[node]\nid=b\nparent=a\n[/node]'), schemas)[0]
			.code,
		'MWL_REF_DUPLICATE',
	);
	assert.equal(
		validate(parse('[node]\nid=a\nparent=b\n[/node]\n[node]\nid=b\nparent=a\n[/node]'), schemas)[0].code,
		'MWL_REF_CYCLE',
	);
});

test('MWL compiles JSON-shaped data, messages, and asset manifest', () => {
	const result = compile(
		'[game]\nschema=0.1\ntitle=_ "Demo"\n[unit_type]\nid=hero\nname=_ "Hero"\nimage=units/hero.png\n[/unit_type]\n[/game]',
	);
	assert.deepEqual(result.assets, ['units/hero.png']);
	assert.deepEqual(result.messages, ['Demo', 'Hero']);
});

test('MWL compiles a directory-shaped source set in stable file order', () => {
	const game = compileSources([
		{ file: 'content/z.mwl', source: '[item]\nid=z\nname=_ "Z"\n[/item]' },
		{ file: 'content/a.mwl', source: '[item]\nid=a\nname=_ "A"\n[/item]' },
	]);
	assert.deepEqual(
		game.roots.map((node) => node.attributes.id),
		['a', 'z'],
	);
	assert.deepEqual(game.messages, ['A', 'Z']);
});

test('MWL artifact emission is stable and accepts game-owned generated files', () => {
	const files = [{ file: 'game.mwl', source: '[item]\nid=a\nname=A\n[/item]' }];
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
		'[unit_type]\nid=hero\nimage=units/hero.png~FL(horiz)\nprofile=portraits/hero.png\n[/unit_type]\n[attack]\nid=hit\nsound=audio/hit.wav,audio/hit.ogg\n[/attack]',
	);
	assert.deepEqual(game.assets, ['audio/hit.ogg', 'audio/hit.wav', 'portraits/hero.png', 'units/hero.png']);
});

test('MWL asset extraction preserves sound range notation', () => {
	const game = compile('[attack]\nid=hit\nsound=human-hit-[1~5].ogg\n[/attack]');
	assert.deepEqual(game.assets, ['human-hit-[1~5].ogg']);
});

test('MWL asset extraction does not split transform arguments into assets', () => {
	const game = compile('[attack]\nid=hit\nicon=attacks/blank.png~CS(-20,-20,50)~BLIT(attacks/border.png)\n[/attack]');
	assert.deepEqual(game.assets, ['attacks/blank.png']);
});

test('MWL asset extraction does not split bracketed asset lists', () => {
	const game = compile('[attack]\nid=hit\nicon=attacks/hit-[1,2].png\n[/attack]');
	assert.deepEqual(game.assets, ['attacks/hit-[1,2].png']);
});

test('MWL asset extraction ignores numeric sound parameters', () => {
	const game = compile(
		'[unit_type]\nid=hero\nimage=units/hero.png\n[/unit_type]\n[attack]\nid=hit\nsound=-20\n[/attack]',
	);
	assert.deepEqual(game.assets, ['units/hero.png']);
});

test('MWL content catalog exposes reusable item, monster, status, loot, and clock data', () => {
	const game = compile(
		'[game]\nschema=0.1\n[item]\nid=ring_haste\nname="Haste"\nslot=ring\nstackable=false\nweight=0.1\n[effect]\napply_to=speed\nincrease=10%\n[/effect]\n[/item]\n[monster]\nid=rat\nname="Rat"\nhp=8\ndamage_min=1\ndamage_max=4\n[/monster]\n[status]\nid=poisoned\nduration=3\ntick=damage\n[/status]\n[loot]\nitem=ring_haste\nchance=0.25\n[/loot]\n[turn_clock]\nid=default\ntick=1\nhunger=0.1\n[/turn_clock]\n[/game]',
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
		'[game]\nschema=0.1\ntitle=_ "Demo"\n[movetype]\nname=smallfoot\n[/movetype]\n[unit_type]\nid=hero\nname=Hero\n[/unit_type]\n[/game]',
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
	const nodes = parse('[unit_type]\nid=hero\nname=_ "Hero"\n[/unit_type]');
	assert.deepEqual(nodes[0].gettext, ['name']);
	assert.equal(nodes[0].attributes.name, 'Hero');
});

test('MWL keeps leading-underscore values such as aliasof=_bas intact', () => {
	const nodes = parse('[terrain_type]\nid=village\nstring=^Ve\naliasof=_bas, Vt\n[/terrain_type]');
	assert.equal(nodes[0].attributes.aliasof, '_bas, Vt');
	assert.deepEqual(nodes[0].gettext, []);
});

test('MWL collects, validates, and declares hook references', () => {
	const game = compile(
		'[game]\nschema=0.1\n[event]\nid=e\non=start\n[hook]\nname=command:haunted_ruin\nintensity=3\n[/hook]\n[/event]\n[objectives]\n[victory]\nside=1\ncondition=hook\nhook=predicate:relic_recovered\n[/victory]\n[/objectives]\n[/game]',
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

test('MWL runtime executes deterministic world commands', () => {
	const world = createWorld();
	execute(world, { name: 'spawn', target: 'hero', x: 1, y: 2, hp: 10 });
	execute(world, { name: 'move', target: 'hero', x: 2, y: 2 });
	execute(world, { name: 'modify_gold', target: 'side1', amount: 5 });
	execute(world, { name: 'end_turn' });
	assert.deepEqual(world.units.hero, { hp: 10, x: 2, y: 2, alive: true });
	assert.equal(world.gold.side1, 5);
	assert.equal(world.turn, 2);
});

test('MWL runtime loads units and runs compiled event commands', () => {
	const game = compile(
		'[game]\nschema=0.1\n[unit]\nid=hero\nhp=20\nx=0\ny=1\n[/unit]\n[event]\nid=start\ntrigger=start\n[command]\nname=move\ntarget=hero\nx=2\ny=3\n[/command]\n[command]\nname=set_variable\ntarget=started\nvalue=true\n[/command]\n[/event]\n[/game]',
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
		'[game]\n[unit]\nid=hero\nx=2\ny=3\n[/unit]\n' +
		'[event]\nid=start\non=start\n[set_variable]\nname=count\nvalue=1\n[/set_variable]\n[/event]\n' +
		'[event]\nid=counter\non=turn\n[condition]\nvariable=count\nequals=1\n[/condition]\n[set_variable]\nname=count\nvalue=count + 2\n[/set_variable]\n[/event]\n' +
		'[event]\nid=move-id\non=moveto\nx=1,2,4-5\ny=3\nonce=false\n[filter]\nunit=hero\n[/filter]\n[set_variable]\nname=arrived\nvalue=yes\n[/set_variable]\n[/event]\n' +
		'[event]\nid=manual\non=never\n[set_variable]\nname=manual\nvalue=done\n[/set_variable]\n[/event]\n[/game]';
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

test('MWL unit filters and unit_at objectives can constrain by unit id and side', () => {
	const source =
		'[game]\n[unit]\nid=hero\nside=2\nx=1\ny=1\n[/unit]\n' +
		'[event]\nid=hit\non=turn\n[filter]\nunit=hero\n[/filter]\n[set_variable]\nname=found\nvalue=yes\n[/set_variable]\n[/event]\n' +
		'[objectives]\n[victory]\ncondition=unit_at\nx=1\ny=1\nside_filter=2\n[/victory]\n[/objectives]\n[/game]';
	const runtime = new MwlRuntime(compile(source));
	runtime.run('turn');
	assert.equal(runtime.world.variables.found, 'yes');
	assert.equal(runtime.evaluate(), 'won');
});

test('MWL runtime respects event conditions and resolves attack damage', () => {
	const game = compile(
		'[game]\nschema=0.1\n[unit]\nid=hero\nhp=5\n[/unit]\n[event]\nid=hit\ntrigger=turn\n[condition]\nvariable=armed\nequals=true\n[/condition]\n[command]\nname=attack\ntarget=hero\namount=5\n[/command]\n[/event]\n[/game]',
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
		'[game]\nschema=0.1\n[unit]\nid=hero\ntype=Spearman\nside=1\nhp=5\n[/unit]\n[event]\nid=start\non=start\n[filter]\nside=1\ntype=Spearman\n[/filter]\n[attack]\ndefender=hero\namount=2\n[/attack]\n[gold]\nside=1\ndelta=10\n[/gold]\n[/event]\n[/game]',
	);
	const runtime = new MwlRuntime(game);
	runtime.run('start');
	assert.equal(runtime.world.units.hero.hp, 3);
	assert.equal(runtime.world.sides['1'], undefined);
	assert.equal(runtime.world.gold['1'], 10);
});

test('MWL open attribute maps accept game-defined keys and check their values', () => {
	const nodes = parse(
		'[movetype]\nname=smallfoot\n[movement_costs]\nflat=1\nforest=2\n[/movement_costs]\n[defense]\nflat=60\nforest=50\n[/defense]\n[resistance]\narcane=90\npierce=100\n[/resistance]\n[/movetype]',
	);
	assert.deepEqual(validate(nodes), []);
	const bad = parse('[movetype]\nname=smallfoot\n[movement_costs]\nflat=fast\n[/movement_costs]\n[/movetype]');
	const diagnostics = validate(bad);
	assert.equal(diagnostics[0].code, 'MWL_VALUE');
	assert.match(diagnostics[0].message, /must be number/);
});

test('MWL open child schemas accept opaque nested game-owned tags', () => {
	const nodes = parse(
		'[container]\n[damage]\ntype=fire\namount=2\n[filter]\nrole=leader\n[/filter]\n[/damage]\n[/container]',
	);
	assert.deepEqual(
		validate(nodes, {
			container: { children: [], openChildren: true },
		}),
		[],
	);
});

test('MWL closed schemas still reject unknown child tags', () => {
	const diagnostics = validate(parse('[container]\n[damage]\ntype=fire\n[/damage]\n[/container]'), {
		container: { children: [] },
	});
	assert.equal(diagnostics[0].code, 'MWL_CHILD');
	assert.equal(diagnostics[1].code, 'MWL_UNKNOWN_TAG');
});

test('MWL terrain_type accepts the generic terrain attributes', () => {
	const nodes = parse(
		'[terrain_type]\nid=grassland\nstring=Gg\naliasof=Gt\nmvt_alias=-,_bas,St\ndefault_base=Gg\nheals=8\ngives_income=true\n[/terrain_type]',
	);
	assert.deepEqual(validate(nodes), []);
});

test('MWL still rejects unknown attributes on closed tags', () => {
	const diagnostics = validate(parse('[terrain_type]\nid=meadow\nwat=1\n[/terrain_type]'));
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

test('MWL catalog validation catches duplicate ids, slots, effects, and hooks', () => {
	const game = compile(
		'[item]\nid=ring\nname=Ring\nslot=finger\n[effect]\nadd=1\n[/effect]\n[/item]\n[item]\nid=ring\nname=Other\n[/item]\n[hook]\nname=bad-hook\n[/hook]',
	);
	const codes = validateCatalog(game, { slots: ['weapon'], hooks: ['command:known'] }).map(
		(diagnostic) => diagnostic.code,
	);
	assert.deepEqual(codes, ['MWL_UNKNOWN_SLOT', 'MWL_INCOMPLETE_EFFECT', 'MWL_DUPLICATE_ID', 'MWL_INVALID_HOOK']);
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

test('MWL unit_type accepts a spaced display id from a converted source', () => {
	const nodes = parse('[unit_type]\nid=Drake Arbiter\nhitpoints=40\n[/unit_type]');
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
		'[ai]\nid=basic\nstrategy=balanced\n[behavior]\nid=advance\nwhen=enemy_visible\naction=move_toward_enemy\nhook=ai:advance\n[/behavior]\n[/ai]',
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
		'[ai]\nid=hero-brain\nscope=actor\nprovider=javascript\nalgorithm=alpha_beta\ndepth=2\nmax_nodes=500\nmoves=ai:legal\napply=ai:apply\nterminal=ai:terminal\nevaluate=ai:score\n[/ai]\n' +
			'[ai]\nid=chess-master\nscope=controller\nprovider=lua\nalgorithm=alpha_beta\ndepth=4\nplayer=current_player\n[/ai]',
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
			'[game]\n[unit_type]\nid=hero\n[ability]\nid=heal\nname=Heal\n[/ability]\n[/unit_type]\n[loot]\nitem=missing\n[/loot]\n[/game]',
		),
	);
	assert.deepEqual(report.tags, { ability: 1, game: 1, loot: 1, unit_type: 1 });
	assert.deepEqual(report.danglingReferences, ['missing']);
});

test('MWL content loading returns resources, dependencies and diagnostics', () => {
	const loaded = loadContent([
		{ file: 'content.mwl', source: '[game]\n[map]\nid=arena\nfile=hero.png\n[/map]\n[/game]' },
	]);
	assert.deepEqual(loaded.resources, ['hero.png']);
	assert.deepEqual(loaded.diagnostics, []);
	assert.ok(loaded.game);
	const failed = loadContent([{ file: 'broken.mwl', source: '[unknown]\nvalue=x\n[/unknown]' }]);
	assert.equal(failed.game, undefined);
	assert.equal(failed.diagnostics[0]?.severity, 'error');
});

test('MWL readers coerce fields, collect children, and preserve diagnostics', () => {
	const node = compile('[unit]\nid=hero\nside=2\nx=4\ny=5\n[/unit]').roots[0];
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
