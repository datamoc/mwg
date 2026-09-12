import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';
import { MwlRuntime, parseTerrain, type MwlMessage } from '../src/mwl/runtime.ts';

const ARENA_MAP = ['1 Kh,Gg,Gg', 'Gg,Gg,Gg', 'Gg,Gg,2 Kh'].join('\n');

const ARENA = `[game]
schema=0.1
[unit_type]
id=Swordsman
hitpoints=10
movement=3
[/unit_type]
[unit_type]
id=Archer
hitpoints=6
movement=3
[/unit_type]
[side]
id=1
controller=human
gold=20
leader=Swordsman
[/side]
[side]
id=2
controller=ai
gold=20
leader=Archer
[/side]
[map]
id=arena
file=arena.map
[/map]
[schedule]
id=default
[time]
id=dawn
lawful_bonus=0
[/time]
[time]
id=night
lawful_bonus=-25
[/time]
[/schedule]
[event]
id=start
on=start
[message]
text=_ "Begin"
[/message]
[/event]
[event]
id=advance
on=advance
[move]
unit=Swordsman 1 (0,0)
x=1
y=0
[/move]
[/event]
[event]
id=strike
on=strike
[attack]
defender=Archer 2 (2,2)
amount=6
[/attack]
[/event]
[event]
id=doomed
on=doomed
[attack]
defender=Swordsman 1 (0,0)
amount=10
[/attack]
[/event]
[event]
id=wait
on=wait
[end_turn]
[/end_turn]
[/event]
[objectives]
[victory]
side=1
condition=units_dead
side_filter=2
[/victory]
[defeat]
side=1
condition=units_dead
side_filter=1
[/defeat]
[/objectives]
[/game]
`;

const arena = () => new MwlRuntime(compile(ARENA), { resolveMap: () => ARENA_MAP });

test('parseTerrain reads rows, keep markers, and pads short rows', () => {
	const parsed = parseTerrain('Gg,Gg,1 Kh\nGg,Gg,Gg');
	assert.equal(parsed.width, 3);
	assert.equal(parsed.height, 2);
	assert.deepEqual(parsed.codes, ['Gg', 'Gg', 'Kh', 'Gg', 'Gg', 'Gg']);
	assert.deepEqual(parsed.starts, { '1': [{ x: 2, y: 0 }] });
});

test('MWL runtime loads the map, sides, and leaders', () => {
	const runtime = arena();
	assert.equal(runtime.world.map?.width, 3);
	assert.equal(runtime.world.map?.height, 3);
	assert.deepEqual(runtime.world.map?.starts, { '1': [{ x: 0, y: 0 }], '2': [{ x: 2, y: 2 }] });
	assert.equal(runtime.world.sides['1'].leader, 'Swordsman');
	assert.equal(runtime.world.sides['1'].gold, 20);
	assert.equal(runtime.world.timeOfDay, 'dawn');

	const units = Object.values(runtime.world.units);
	assert.equal(units.length, 2);
	const swordsman = units.find((unit) => unit.type === 'Swordsman');
	assert.deepEqual(swordsman, {
		hp: 10,
		x: 0,
		y: 0,
		alive: true,
		type: 'Swordsman',
		side: '1',
		moves: 3,
		can_recruit: true,
		leader: true,
	});
	const archer = units.find((unit) => unit.type === 'Archer');
	assert.deepEqual(archer, {
		hp: 6,
		x: 2,
		y: 2,
		alive: true,
		type: 'Archer',
		side: '2',
		moves: 3,
		can_recruit: true,
		leader: true,
	});
});

test('MWL runtime runs events, moves a unit, and spends its moves', () => {
	const messages: string[] = [];
	const runtime = new MwlRuntime(compile(ARENA), {
		resolveMap: () => ARENA_MAP,
		onMessage: (message) => messages.push(message.text),
	});
	runtime.run('start');
	assert.deepEqual(messages, ['Begin']);

	runtime.run('advance');
	const swordsman = Object.values(runtime.world.units).find((unit) => unit.type === 'Swordsman');
	assert.deepEqual({ x: swordsman?.x, y: swordsman?.y, moves: swordsman?.moves }, { x: 1, y: 0, moves: 2 });

	runtime.run('advance');
	runtime.run('advance');
	assert.equal(Object.values(runtime.world.units).find((unit) => unit.type === 'Swordsman')?.moves, 0);
	assert.throws(() => runtime.run('advance'), /no moves left/);
});

test('MWL runtime resolves win and lose objectives', () => {
	const won = arena();
	won.run('strike');
	assert.equal(won.world.status, 'won');

	const lost = arena();
	lost.run('doomed');
	assert.equal(lost.world.status, 'lost');

	// A game that resolves its own actions writes the result and asks for a check.
	const checked = arena();
	for (const unit of Object.values(checked.world.units)) if (unit.side === '2') unit.alive = false;
	assert.equal(checked.evaluate(), 'won');
});

test('MWL runtime ends the turn, advances the schedule, and resets moves', () => {
	const runtime = arena();
	runtime.run('wait');
	assert.equal(runtime.world.turn, 2);
	assert.equal(runtime.world.timeOfDay, 'night');
	const swordsman = Object.values(runtime.world.units).find((unit) => unit.type === 'Swordsman');
	assert.equal(swordsman?.moves, 3);
});

test('MWL runtime saves and restores the world', () => {
	const runtime = arena();
	const saved = runtime.save();
	runtime.run('advance');
	assert.equal(Object.values(runtime.world.units).find((unit) => unit.type === 'Swordsman')?.x, 1);
	runtime.restore(saved);
	assert.equal(Object.values(runtime.world.units).find((unit) => unit.type === 'Swordsman')?.x, 0);
	assert.equal(runtime.world.timeOfDay, 'dawn');
});

test('MWL runtime loads the EXAMPLES skirmish and spawns its leader on the keep', () => {
	const source = readFileSync(new URL('./fixtures/mwl/skirmish.mwl', import.meta.url), 'utf8');
	const runtime = new MwlRuntime(compile(source, { file: 'skirmish.mwl' }), {
		resolveMap: () =>
			[
				'Gg,Gg,Gg,Gg,Gg,Gg,Gg',
				'Gg,Gg,1 Kh,Gg,Gg,Gg,Gg',
				'Gg,Ch,Ch,Ch,Ch,Gg,Gg',
				'Gg,Gg,Gg,Gg,Gg,Gg,Gg',
				'Gg,Gg,2 Kh,Gg,Gg,Gg,Gg',
			].join('\n'),
	});
	assert.equal(runtime.world.map?.width, 7);
	assert.equal(runtime.world.map?.height, 5);
	assert.deepEqual(runtime.world.map?.starts, { '1': [{ x: 2, y: 1 }], '2': [{ x: 2, y: 4 }] });
	assert.deepEqual(Object.keys(runtime.world.sides).sort(), ['1', '2']);
	assert.equal(runtime.world.timeOfDay, 'dawn');

	const units = Object.values(runtime.world.units);
	assert.equal(units.length, 1, 'only side 1 declares a leader');
	assert.deepEqual(units[0], {
		hp: 36,
		x: 2,
		y: 1,
		alive: true,
		type: 'Spearman',
		side: '1',
		moves: 5,
		can_recruit: true,
		leader: true,
	});
	assert.equal(runtime.world.status, 'playing');
});

test('MWL runtime passes objective attributes to predicate hooks', () => {
	const game = compile(
		'[game]\nschema=0.1\n[unit]\nid=hero\nhp=1\nside=1\n[/unit]\n[objectives]\n[victory]\nside=1\ncondition=hook\nhook=predicate:holds\nvalue=3\n[/victory]\n[/objectives]\n[/game]',
	);
	const seen: Record<string, string>[] = [];
	const runtime = new MwlRuntime(game, {
		hooks: {
			predicate: {
				'predicate:holds': (_world, context) => {
					seen.push({ ...context });
					return Number(context.value) === 3;
				},
			},
		},
	});
	assert.equal(runtime.evaluate(), 'won');
	assert.equal(seen.length, 1);
	assert.deepEqual(seen[0], { side: '1', value: '3' });
});

const MOVETO_MAP = ['1 Kh,Gg,2 Kh'].join('\n');

const MOVETO = `[game]
schema=0.1
[unit_type]
id=Scout
hitpoints=10
movement=3
[/unit_type]
[unit_type]
id=Grunt
hitpoints=8
movement=3
[/unit_type]
[side]
id=1
controller=human
leader=Scout
[/side]
[side]
id=2
controller=ai
leader=Grunt
[/side]
[map]
id=moveto
file=moveto.map
[/map]
[event]
id=ford
on=moveto
unit=Scout 1 (0,0)
x=1
y=0
[message]
speaker=_ "Elvish Scout"
portrait=portraits/elves/scout.webp
text=_ "The ford is guarded."
[/message]
[/event]
[event]
id=advance
on=advance
[move]
unit=Scout 1 (0,0)
x=1
y=0
[/move]
[/event]
[event]
id=back
on=back
[move]
unit=Scout 1 (0,0)
x=0
y=0
[/move]
[/event]
[event]
id=arriving
on=moveto
side=2
[message]
side=2
text=_ "A grunt arrives."
[/message]
[/event]
[/game]
`;

function moving(): { runtime: MwlRuntime; messages: MwlMessage[] } {
	const messages: MwlMessage[] = [];
	const runtime = new MwlRuntime(compile(MOVETO), {
		resolveMap: () => MOVETO_MAP,
		onMessage: (message) => messages.push({ ...message }),
	});
	return { runtime, messages };
}

test('moveto fires when the runtime moves a unit onto the watched hex', () => {
	const { runtime, messages } = moving();
	assert.equal(Object.keys(runtime.world.units).length, 2);

	runtime.run('advance');
	assert.deepEqual(messages, [
		{ text: 'The ford is guarded.', speaker: 'Elvish Scout', portrait: 'portraits/elves/scout.webp' },
	]);
	assert.deepEqual(runtime.world.firedEvents, ['ford']);
});

test('a moveto event fires once, and not for the other side', () => {
	const { runtime, messages } = moving();
	runtime.run('advance');
	runtime.run('back');
	runtime.run('advance');
	assert.equal(messages.length, 1, 'the story beat does not repeat');
});

test('a game engine can report a move it resolved itself', () => {
	const { runtime, messages } = moving();
	const unit = Object.values(runtime.world.units).find((candidate) => candidate.side === '1');
	assert.ok(unit);
	unit.x = 1;
	unit.y = 0;
	runtime.fireMoveto('Scout 1 (0,0)');
	assert.equal(messages.length, 1);
	assert.equal(messages[0].text, 'The ford is guarded.');

	// The side filter matches the other side's unit, and fires its own event.
	const grunt = Object.values(runtime.world.units).find((candidate) => candidate.side === '2');
	assert.ok(grunt);
	runtime.fireMoveto(Object.keys(runtime.world.units).find((id) => runtime.world.units[id] === grunt) ?? '');
	assert.deepEqual(
		messages.map((message) => message.text),
		['The ford is guarded.', 'A grunt arrives.'],
	);
	assert.equal(messages[1].side, '2');
});

test('a spent moveto event stays spent across a save and restore', () => {
	const { runtime, messages } = moving();
	runtime.run('advance');
	const saved = runtime.save();

	runtime.run('back');
	runtime.restore(saved);
	runtime.run('advance');
	assert.equal(messages.length, 1, 'restoring keeps one-shot events spent');
});

test('runtime applies command defaults and skips a false conditional', () => {
	const messages: MwlMessage[] = [];
	const runtime = new MwlRuntime(
		compile(`[game]
[event]
on=defaults
[message]
value=_ "Fallback"
[/message]
[spawn]
x=2
y=3
[/spawn]
[if]
[condition]
variable=missing
equals=yes
[/condition]
[message]
text=_ "Skipped"
[/message]
[/if]
[/event]
[/game]`),
		{ onMessage: (message) => messages.push(message) },
	);
	runtime.run('defaults');
	assert.deepEqual(messages, [{ text: 'Fallback' }]);
	assert.deepEqual(runtime.world.units['unit#@2,3'], { hp: 1, x: 2, y: 3, alive: true });
});

test('moveto supports repeatable events and ignores invalid arrivals', () => {
	const messages: MwlMessage[] = [];
	const runtime = new MwlRuntime(
		compile(`[game]
[map]
id=plain
terrain=Gg
[start]
side=1
x=0
y=0
[/start]
[start]
[/start]
[/map]
[unit]
id=runner
x=0
y=0
side=1
[/unit]
[event]
on=moveto
once=false
x=0
y=0
[message]
text=_ "Again"
[/message]
[/event]
[event]
on=moveto
once=true
x=0
y=0
[message]
text=_ "Once"
[/message]
[/event]
[/game]`),
		{ onMessage: (message) => messages.push(message) },
	);
	runtime.fireMoveto('missing');
	runtime.world.units.runner.alive = false;
	runtime.fireMoveto('runner');
	runtime.world.units.runner.alive = true;
	runtime.fireMoveto('runner');
	runtime.fireMoveto('runner');
	assert.deepEqual(messages, [{ text: 'Again' }, { text: 'Once' }, { text: 'Again' }]);
});

test('a hook reads and writes nested variables by the path content uses', () => {
	const messages: MwlMessage[] = [];
	let read: unknown;
	const source = `[game]
[event]
on=hooked
[set_variable]
name=stored_naga.hitpoints
value=7
[/set_variable]
[hook]
name=command:store
[/hook]
[message]
text=_ "hp=$stored_naga.hitpoints"
[/message]
[/event]
[/game]`;
	const runtime = new MwlRuntime(compile(source), {
		onMessage: (message) => messages.push(message),
		hooks: {
			command: {
				'command:store': (world, emit) => {
					read = world.variableAt('stored_naga.hitpoints');
					emit.setVariable('stored_naga.hitpoints', 12);
					emit.setVariable('party[0].name', 'Brena');
				},
			},
		},
	});
	runtime.run('hooked');
	assert.equal(read, 7, 'a hook reads the nested value content wrote, not a flat dotted key');
	assert.deepEqual(runtime.world.variables.stored_naga, { hitpoints: 12 });
	assert.deepEqual(runtime.world.variables.party, [{ name: 'Brena' }]);
	assert.deepEqual(messages, [{ text: 'hp=12' }]);
});

test('runtime executes the remaining event command forms', () => {
	const messages: MwlMessage[] = [];
	let mark = '';
	const source = `[game]
[unit]
id=victim
hp=2
[/unit]
[event]
on=commands
[kill]
target=victim
[/kill]
[else]
[message]
text=_ "Else"
[/message]
[/else]
[hook]
name=command:mark
value=ok
[/hook]
[/event]
[/game]`;
	const runtime = new MwlRuntime(compile(source), {
		onMessage: (message) => messages.push(message),
		hooks: { command: { 'command:mark': (_world, _emit, context) => (mark = context.value ?? '') } },
	});
	runtime.run('commands');
	assert.equal(runtime.world.units.victim.alive, false);
	assert.deepEqual(messages, [{ text: 'Else' }]);
	assert.equal(mark, 'ok');

	const outcome = (tag: 'win' | 'lose'): MwlRuntime => {
		const runtime = new MwlRuntime(compile(`[game]\n[event]\non=outcome\n[${tag}]\n[/${tag}]\n[/event]\n[/game]`));
		runtime.run('outcome');
		return runtime;
	};
	assert.equal(outcome('win').evaluate(), 'won');
	assert.equal(outcome('lose').evaluate(), 'lost');
});
