import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPyroeisRuntime, type PyroeisReference, type PyroeisValue } from '../src/mwl/pyroeis.ts';

test('Lua queries return results and indexed bindings read and write live game state', () => {
	const runtime = createPyroeisRuntime();
	const variables = new Map<string | number, PyroeisValue>([['turn', 1]]);
	let gold = 20;
	try {
		const side = runtime.createTable({
			get: (key) => (key === 'gold' ? gold : null),
			set: (key, value) => {
				assert.equal(key, 'gold');
				assert.equal(typeof value, 'number');
				gold = value as number;
			},
			keys: () => ['gold'],
		});
		runtime.set('game.sides', runtime.createTable({ get: (key) => (key === 1 ? side : null), length: () => 1 }));
		runtime.set(
			'data.variables',
			runtime.createTable({
				get: (key) => variables.get(key) ?? null,
				set: (key, value) => {
					variables.set(key, value);
				},
				keys: () => [...variables.keys()],
			}),
		);
		runtime.defineFunction('game.units.find_on_map', (id) => [{ id, x: 2, y: 3 }]);
		runtime.defineFunction('game.map.find', (x, y) => ({ x, y, terrain: 'grass' }));
		assert.equal(runtime.run('return game.units.find_on_map("scout")[1].id'), 'scout');
		assert.equal(runtime.run('return game.map.find(2, 3).terrain'), 'grass');
		assert.equal(runtime.run('return #game.sides'), 1);
		runtime.run('game.sides[1].gold = game.sides[1].gold - 4; data.variables["turn"] = 2');
		assert.equal(gold, 16);
		assert.equal(variables.get('turn'), 2);
		gold = 40;
		assert.equal(runtime.run('return game.sides[1].gold'), 40, 'reads consult current game state');
		assert.equal(runtime.run('local n = 0; for _, v in pairs(game.sides[1]) do n = n + v end; return n'), 40);
		assert.equal(runtime.run('local n = 0; for _, v in pairs(data.variables) do n = n + v end; return n'), 2);
		runtime.set('game.readonly', runtime.createTable({ get: () => 1 }));
		assert.throws(() => runtime.run('game.readonly.x = 2'), /read-only/);
		assert.equal(runtime.run('return getmetatable(game.readonly)'), false);
		assert.equal(runtime.run('return game.sides[1]'), side, 'bound tables retain their identity');
		runtime.defineFunction('game.echo', (value) => value);
		assert.deepEqual(
			runtime.run('return game.echo({ game.sides[1] })'),
			[side],
			'nested proxies survive host calls',
		);
	} finally {
		runtime.dispose();
	}
});

test('embedded require caches Lua identity, dofile reruns, and aliases use the same loader', () => {
	const modules = {
		'rules/core.lua': 'runs = (runs or 0) + 1; return { cost = 4, callback = function(n) return n * 2 end }',
		entry: 'return require("rules/core.lua")',
		empty: 'empty_runs = (empty_runs or 0) + 1',
		cycle: 'return require("cycle")',
		bad: 'local =',
	};
	const runtime = createPyroeisRuntime({ modules });
	try {
		modules['rules/core.lua'] = 'error("mutated source")';
		runtime.run('game = { require = require }; local a = game.require("entry"); a.cost = 9');
		assert.equal(runtime.run('return require("entry") == require("rules/core.lua")'), true);
		assert.equal(runtime.run('return require("entry").callback(require("entry").cost)'), 18);
		assert.equal(runtime.get('runs'), 1);
		runtime.run('dofile("rules/core.lua"); dofile("rules/core.lua")');
		assert.equal(runtime.get('runs'), 3);
		assert.equal(runtime.run('return require("empty")'), true);
		runtime.run('require("empty")');
		assert.equal(runtime.get('empty_runs'), 1);
		for (const name of ['../rules/core.lua', 'file:///secret', 'unknown'])
			assert.throws(() => runtime.call('require', [name]), /Unknown embedded Lua module/);
		assert.throws(() => runtime.call('require', ['cycle']), /Cyclic embedded Lua module/);
		assert.throws(
			() => runtime.call('require', ['cycle']),
			/Cyclic embedded Lua module/,
			'a failed load clears its loading flag',
		);
		assert.throws(() => runtime.call('require', ['bad']), /syntax|expected|near/);
		assert.equal(
			runtime.run(
				'return load == nil and loadfile == nil and io == nil and os == nil and debug == nil and package == nil and __fs_read == nil and __fs_list == nil and __mwg_source == nil',
			),
			true,
		);
		assert.throws(() => runtime.run('\x1bLua'), /binary bytecode/);
		assert.equal(runtime.run('return 3'), 3);
	} finally {
		runtime.dispose();
	}
	assert.throws(() => createPyroeisRuntime({ modules: { binary: '\x1bLua' } }), /binary bytecode/);
});

test('a game can retain a Lua callback, call it, and reject foreign or released references', () => {
	const runtime = createPyroeisRuntime();
	const other = createPyroeisRuntime();
	let handler: PyroeisReference | undefined;
	try {
		runtime.defineFunction('game.register', (value) => {
			handler = value as PyroeisReference;
		});
		runtime.run('game.register(function(n) return n + 4 end)');
		assert.equal(handler?.type, 'function');
		assert.equal(runtime.call(handler!, [6]), 10);
		assert.throws(() => other.call(handler!), /another runtime/);
		const table = runtime.run('return { a = 2, 4, 5 }');
		assert.deepEqual(table, { a: 2, 1: 4, 2: 5 });
		runtime.run('shared = { n = 1 }');
		const shared = runtime.reference('shared');
		runtime.set('alias', shared);
		assert.equal(runtime.run('return shared == alias'), true);
		handler!.dispose();
		handler!.dispose();
		assert.throws(() => runtime.call(handler!), /released/);
	} finally {
		runtime.dispose();
		other.dispose();
	}
});

test('host-driven coroutines yield a request and resume with scene answers through modules', () => {
	const runtime = createPyroeisRuntime({
		modules: { dialogue: 'local answer, amount = game.ask("Choose", 7); return answer, amount' },
	});
	try {
		runtime.defineYieldingFunction('game.ask', (...args) => args);
		runtime.run('function dialogue() return dofile("dialogue") end');
		const co = runtime.coroutine(runtime.reference('dialogue'));
		assert.equal(co.status, 'suspended');
		assert.deepEqual(co.resume(), { done: false, values: ['Choose', 7] });
		assert.equal(co.status, 'suspended');
		assert.deepEqual(co.resume(['yes', 3]), { done: true, values: ['yes', 3] });
		assert.equal(co.status, 'dead');
		assert.throws(() => co.resume(), /dead/);
		runtime.run('function empty() coroutine.yield(); return 8 end');
		const empty = runtime.coroutine('empty');
		assert.deepEqual(empty.resume(), { done: false, values: [] });
		assert.deepEqual(empty.resume(), { done: true, values: [8] });
	} finally {
		runtime.dispose();
	}
});

test('closing and disposing suspended handlers runs their close handlers and rejects reuse', () => {
	const runtime = createPyroeisRuntime();
	const seen: PyroeisValue[] = [];
	const close =
		'local g <close> = setmetatable({}, { __close = function() game.closed("closed") end }); coroutine.yield()';
	runtime.defineFunction('game.closed', (value) => {
		seen.push(value);
	});
	runtime.run(`function wait() ${close} end`);
	const first = runtime.coroutine('wait');
	first.resume();
	first.close();
	first.close();
	assert.deepEqual(seen, ['closed']);
	assert.throws(() => first.resume(), /closed/);
	const second = runtime.coroutine('wait');
	second.resume();
	runtime.dispose();
	runtime.dispose();
	assert.deepEqual(seen, ['closed', 'closed']);
	assert.equal(second.status, 'dead');
	assert.throws(() => second.resume(), /closed/);
	assert.throws(() => runtime.run('return 1'), /disposed/);
});

test('integration budgets cover parsing, native work, modules and each coroutine resume', () => {
	const runtime = createPyroeisRuntime({
		instructionLimit: 2000,
		memoryLimit: 64 * 1024,
		modules: {
			large: `return "${'x'.repeat(100000)}"`,
			busy: 'table.move({}, 1, 200000, 1)',
		},
	});
	try {
		assert.throws(() => runtime.call('require', ['large']), /memory limit exceeded/);
		assert.throws(() => runtime.call('require', ['busy']), /instructions limit exceeded/);
		assert.throws(
			() => runtime.run('pcall(function() table.move({}, 1, 200000, 1) end)'),
			/instructions limit exceeded/,
		);
		runtime.run('function busy() table.move({}, 1, 200000, 1) end');
		assert.throws(() => runtime.coroutine('busy').resume(), /instructions limit exceeded/);
		runtime.run('function steps() for i = 1, 150 do end; coroutine.yield(1); for i = 1, 150 do end; return 2 end');
		const steps = runtime.coroutine('steps');
		assert.deepEqual(steps.resume(), { done: false, values: [1] });
		assert.deepEqual(steps.resume(), { done: true, values: [2] });
		assert.equal(runtime.run('return 1 + 1'), 2);
	} finally {
		runtime.dispose();
	}
});

test('callbacks fail as Lua errors and seeded random supports bounded game intervals', () => {
	const a = createPyroeisRuntime({ seed: 7 });
	const b = createPyroeisRuntime({ seed: 7 });
	try {
		a.defineFunction('game.fail', () => {
			throw new Error('game failure');
		});
		assert.equal(a.run('local ok, err = pcall(game.fail); return not ok and err == "game failure"'), true);
		assert.throws(() => a.call('game.fail'), /game failure/);
		for (let i = 0; i < 10; i++) {
			const source = 'return { math.random(), math.random(6), math.random(-2, 2) }';
			const result = a.run(source) as number[];
			assert.deepEqual(result, b.run(source));
			assert.ok(result[0] >= 0 && result[0] < 1);
			assert.ok(Number.isInteger(result[1]) && result[1] >= 1 && result[1] <= 6);
			assert.ok(Number.isInteger(result[2]) && result[2] >= -2 && result[2] <= 2);
		}
		assert.throws(() => a.run('return math.random(0)'), /safe integers/);
		a.set('game.value', 4);
		assert.throws(() => a.set('game.value.child', 2), /not a table/);
		assert.throws(() => a.set('game;error("oops")', 2), /Invalid Lua global path/);
		assert.equal(a.get('game.value'), 4);
	} finally {
		a.dispose();
		b.dispose();
	}
	assert.throws(() => createPyroeisRuntime({ instructionLimit: 0 }), /instructionLimit/);
	assert.throws(() => createPyroeisRuntime({ timeLimit: Infinity }), /timeLimit/);
});

test('host-side binding errors are protected and callbacks cannot dispose an active state', () => {
	const runtime = createPyroeisRuntime();
	try {
		runtime.set(
			'game.side',
			runtime.createTable({
				get: () => {
					throw new Error('getter failed');
				},
			}),
		);
		assert.throws(() => runtime.get('game.side.gold'), /getter failed/);
		assert.throws(() => runtime.set('game.side.gold', 3), /read-only/);
		runtime.defineFunction('game.dispose', () => runtime.dispose());
		assert.throws(() => runtime.call('game.dispose'), /active Lua runtime/);
		assert.equal(runtime.run('return 2'), 2, 'errors leave the state usable');
		runtime.set('game.data', { type: 'item', dispose: 'later' });
		assert.deepEqual(runtime.get('game.data'), { type: 'item', dispose: 'later' });
		assert.throws(
			() =>
				runtime.run(
					'local t = {}; local next = t; for i = 1, 160 do next[1] = {}; next = next[1] end; return t',
				),
			/too deeply nested/,
		);
		assert.equal(runtime.run('return 3'), 3);
	} finally {
		runtime.dispose();
	}
});

test('closing a module coroutine clears pending require state and permits another load', () => {
	const runtime = createPyroeisRuntime({ modules: { prompt: 'coroutine.yield("question"); return { answer = 1 }' } });
	try {
		runtime.run('function load_prompt() return require("prompt") end');
		const first = runtime.coroutine('load_prompt');
		assert.deepEqual(first.resume(), { done: false, values: ['question'] });
		first.close();
		const second = runtime.coroutine('load_prompt');
		assert.deepEqual(second.resume(), { done: false, values: ['question'] });
		assert.deepEqual(second.resume(), { done: true, values: [{ answer: 1 }] });
		assert.deepEqual(runtime.call('require', ['prompt']), { answer: 1 });
	} finally {
		runtime.dispose();
	}
});

test('coroutine errors reach close handlers and disposal closes other handlers even after a close error', () => {
	const runtime = createPyroeisRuntime();
	const seen: PyroeisValue[] = [];
	runtime.defineFunction('game.closed', (error) => {
		seen.push(error);
	});
	runtime.run(`
function failed()
  local g <close> = setmetatable({}, { __close = function(_, err) game.closed(err) end })
  error('original failure')
end
function bad_close()
  local g <close> = setmetatable({}, { __close = function() error('close failure') end })
  coroutine.yield()
end
function good_close()
  local g <close> = setmetatable({}, { __close = function() game.closed('good') end })
  coroutine.yield()
end`);
	const failed = runtime.coroutine('failed');
	assert.throws(() => failed.resume(), /original failure/);
	failed.close();
	assert.match(String(seen[0]), /original failure/);
	runtime.coroutine('bad_close').resume();
	runtime.coroutine('good_close').resume();
	assert.throws(() => runtime.dispose(), /close failure/);
	assert.equal(seen[1], 'good');
	runtime.dispose();
	assert.throws(() => runtime.run('return 1'), /disposed/);
});

test('each coroutine resume gets a fresh budget while nested host calls share the current budget', () => {
	const runtime = createPyroeisRuntime({ instructionLimit: 2000 });
	try {
		const work = 'for i = 1, 600 do sum = sum + i end';
		runtime.run(`function work() local sum = 0; ${work}; return sum end
function twice() local sum = 0; ${work}; ${work}; return sum end
function steps() local sum = 0; ${work}; coroutine.yield(sum); ${work}; return sum end`);
		assert.throws(() => runtime.call('twice'), /instructions limit exceeded/);
		const steps = runtime.coroutine('steps');
		assert.deepEqual(steps.resume(), { done: false, values: [180300] });
		assert.deepEqual(steps.resume(), { done: true, values: [360600] });
		runtime.defineFunction('game.work', () => runtime.call('work'));
		assert.throws(() => runtime.run('game.work(); game.work()'), /instructions limit exceeded/);
		assert.equal(runtime.run('return 2'), 2);
	} finally {
		runtime.dispose();
	}
});

test('the host can adopt Lua-created threads before or after their first script-side yield', () => {
	const runtime = createPyroeisRuntime();
	try {
		runtime.run(
			'stored = coroutine.create(function(n) assert(game.status() == "running"); local answer = coroutine.yield(n); return answer end)',
		);
		const ref = runtime.reference('stored');
		assert.equal(ref.type, 'thread');
		const driver = runtime.coroutine(ref);
		assert.throws(() => runtime.coroutine('stored'), /already has a host controller/);
		runtime.defineFunction('game.status', () => driver.status);
		assert.deepEqual(driver.resume([4]), { done: false, values: [4] });
		assert.deepEqual(driver.resume(['answer']), { done: true, values: ['answer'] });
		runtime.run(
			'stored = coroutine.create(function() coroutine.yield("scene"); return "done" end); coroutine.resume(stored)',
		);
		const adopted = runtime.coroutine('stored');
		assert.equal(adopted.status, 'suspended');
		assert.deepEqual(adopted.resume(), { done: true, values: ['done'] });
		assert.throws(() => runtime.coroutine(runtime.reference('game')), /function or thread/);
	} finally {
		runtime.dispose();
	}
});
