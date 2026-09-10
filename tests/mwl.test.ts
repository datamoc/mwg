import assert from 'node:assert/strict';
import test from 'node:test';
import { compile, compileNodes, extractCatalog } from '../src/mwl/compiler.ts';
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
import { effectToModifier } from '../src/mwl/actors.ts';
import { evaluateExpression } from '../src/mwl/expression.ts';
import { validateCatalog } from '../src/mwl/catalog.ts';
import { decodeSave, encodeSave } from '../src/mwl/persistence.ts';

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

test('MWL validation reports unknown tags and attributes', () => {
	const nodes = parse('[game]\nwat=1\n[nope]\n[/nope]\n[/game]');
	const diagnostics = validate(nodes);
	assert.equal(diagnostics[0].code, 'MWL_UNKNOWN_ATTRIBUTE');
	assert.equal(diagnostics[1].code, 'MWL_CHILD');
});

test('MWL compiles JSON-shaped data, messages, and asset manifest', () => {
	const result = compile(
		'[game]\nschema=0.1\ntitle=_ "Demo"\n[unit_type]\nid=hero\nname=_ "Hero"\nimage=units/hero.png\n[/unit_type]\n[/game]',
	);
	assert.deepEqual(result.assets, ['units/hero.png']);
	assert.deepEqual(result.messages, ['Demo', 'Hero']);
});

test('MWL asset extraction accepts native CFG image and sound attributes', () => {
	const game = compile('[unit_type]\nid=hero\nimage=units/hero.png~FL(horiz)\nprofile=portraits/hero.png\n[/unit_type]\n[attack]\nid=hit\nsound=audio/hit.wav,audio/hit.ogg\n[/attack]');
	assert.deepEqual(game.assets, ['audio/hit.ogg', 'audio/hit.wav', 'portraits/hero.png', 'units/hero.png']);
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
	assert.deepEqual(effectToModifier({ applyTo: 'attack', operation: 'add', value: 'missing_hp_fraction' }, { missing_hp_fraction: 4 }), {
		stat: 'attack', op: 'add', value: 4,
	});
});

test('MWL catalog validation catches duplicate ids, slots, effects, and hooks', () => {
	const game = compile('[item]\nid=ring\nname=Ring\nslot=finger\n[effect]\nadd=1\n[/effect]\n[/item]\n[item]\nid=ring\nname=Other\n[/item]\n[hook]\nname=bad-hook\n[/hook]');
	const codes = validateCatalog(game, { slots: ['weapon'], hooks: ['command:known'] }).map((diagnostic) => diagnostic.code);
	assert.deepEqual(codes, ['MWL_UNKNOWN_SLOT', 'MWL_INCOMPLETE_EFFECT', 'MWL_DUPLICATE_ID', 'MWL_INVALID_HOOK']);
});

test('MWL saves are versioned and migrated, while legacy snapshots remain readable', () => {
	const world = { turn: 1, variables: {}, units: {}, sides: {}, maps: {}, gold: {}, status: 'playing' as const, map: null, timeOfDay: '', scheduleIndex: 0 };
	const snapshot = encodeSave(world, { version: 1 });
	const restored = decodeSave(snapshot, { version: 2, migrations: { 2: (value) => ({ ...value, turn: value.turn + 1 }) } });
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
