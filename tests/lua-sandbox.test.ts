import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPyroeisScriptHost, luaToJs } from '../src/mwl/pyroeis.ts';

test('Lua budgets interrupt native operations and survive protected calls and coroutines', () => {
	const host = createPyroeisScriptHost({ instructionLimit: 1000 });
	try {
		for (const source of [
			'table.move({}, 1, 200000, 1)',
			'local s = string.rep("a", 2000); string.find(s, string.rep("a", 1000) .. "b", 1, true)',
			'local s = string.rep("a", 100); string.find(s, ".-.-.-.-b")',
			'for i = 1, 10000 do pcall(function() local n = 0; for j = 1, 100 do n = n + j end end) end',
			'xpcall(function() for i = 1, 10000 do end end, function() for i = 1, 10000 do end end)',
			'local co = coroutine.create(function() for i = 1, 10000 do end end); coroutine.resume(co)',
		]) {
			assert.throws(() => host.execute(source), /instruction limit exceeded/, source);
			assert.equal(host.evaluate('1 + 1'), 2, 'a fresh call gets a fresh budget');
		}
		host.execute('function move() table.move({}, 1, 200000, 1) end');
		assert.throws(() => host.call('move'), /instruction limit exceeded/);
		assert.deepEqual(host.evaluate('{10, 20}'), { 1: 10, 2: 20 }, 'the existing table contract is preserved');
	} finally {
		host.dispose();
	}
});

test('the Lua host bounds string allocation, not only instruction count', () => {
	const host = createPyroeisScriptHost({ instructionLimit: 1000, memoryLimit: 1024 * 1024 });
	assert.throws(() => host.evaluate('#string.rep("x", 2^28)'), /memory limit exceeded/);
	assert.throws(
		() => host.evaluate('(function() local s = "x" for i = 1, 40 do s = s .. s end return #s end)()'),
		/memory limit exceeded/,
		'a doubling concatenation is one instruction per step',
	);
	assert.throws(
		() => host.execute('for i = 1, 100 do pcall(function() local s = string.rep("y", 2^21) end) end'),
		/memory limit exceeded/,
		'a script-level pcall cannot swallow the limit',
	);
	assert.equal(globalThis.Uint8Array.name, 'Uint8Array', 'the real constructor is back');
	assert.equal(host.evaluate('#string.rep("z", 1000)'), 1000, 'the host stays usable afterwards');
	assert.equal(host.evaluate('("abc"):upper()'), 'ABC');
	host.dispose();
});

test('the Lua host hides the string metatable and never constructs the unsafe libraries', () => {
	const host = createPyroeisScriptHost();
	assert.equal(host.evaluate('getmetatable("")'), false);
	assert.equal(
		host.evaluate(
			'os == nil and io == nil and debug == nil and package == nil and require == nil and load == nil and loadfile == nil and dofile == nil',
		),
		true,
	);
	assert.equal(
		host.evaluate('coroutine ~= nil and string ~= nil and table ~= nil and math ~= nil and utf8 ~= nil'),
		true,
	);
	host.dispose();
});

test('the Lua host compiles text chunks only and rejects binary bytecode', () => {
	const host = createPyroeisScriptHost();
	assert.throws(() => host.execute('\x1bLua\x00\x00\x00'), /binary chunk/);
	assert.equal(host.evaluate('1 + 1'), 2, 'the host stays usable afterwards');
	host.dispose();
});

test('an emit callback runs with the real Uint8Array and outside the Lua budget', () => {
	const host = createPyroeisScriptHost({ memoryLimit: 64 * 1024 });
	let seen = 0;
	host.execute('mwg_emit("big")', {}, () => {
		seen = new Uint8Array(1024 * 1024).byteLength;
		assert.equal(Object.getPrototypeOf(new Uint8Array(1)), Uint8Array.prototype);
	});
	assert.equal(seen, 1024 * 1024);
	assert.throws(() => createPyroeisScriptHost({ memoryLimit: 0 }), /memoryLimit must be a positive integer/);
	host.dispose();
});

test('a refused allocation surfaces as not enough memory to scripts, and the host still rejects the call', () => {
	const host = createPyroeisScriptHost({ memoryLimit: 1024 });
	let seen: unknown = null;
	assert.throws(
		() =>
			host.execute(
				'local ok, err = pcall(function() return ("x"):rep(100000) end); mwg_emit("seen", err)',
				{},
				(_name, payload) => {
					seen = payload;
				},
			),
		/memory limit exceeded/,
	);
	assert.equal(seen, 'not enough memory');
	host.dispose();
});

test('the Lua host runs <const> and <close> variables, and the limits unwind through them', () => {
	const host = createPyroeisScriptHost({ instructionLimit: 5000 });
	const seen: unknown[] = [];
	const collect = (name: string, payload: unknown): void => void seen.push([name, payload]);
	const closer = 'setmetatable({}, { __close = function(_, err) mwg_emit("closed", tostring(err)) end })';
	host.execute('local x <const> = 5; mwg_emit("const", x)', {}, collect);
	assert.throws(() => host.execute('local x <const> = 5; x = 6'), /attempt to assign to const variable 'x'/);
	host.execute(`local g <close> = ${closer}; mwg_emit("body")`, {}, collect);
	assert.throws(() => host.execute(`local g <close> = ${closer}; error("boom")`, {}, collect), /boom/);
	assert.throws(() => host.execute('local g <close> = 42'), /non-closable value/);
	host.execute(
		`local co = coroutine.create(function() local g <close> = ${closer}; coroutine.yield() end)
		coroutine.resume(co); mwg_emit("coroutine.close", coroutine.close(co))`,
		{},
		collect,
	);
	assert.match(String((seen[3] as unknown[])[1]), /boom/, 'a failing block closes with its error');
	assert.deepEqual(
		seen.filter((_, i) => i !== 3),
		[
			['const', 5],
			['body', undefined],
			['closed', 'nil'],
			['closed', 'nil'],
			['coroutine.close', true],
		],
	);
	assert.throws(
		() => host.execute(`local g <close> = ${closer}; while true do end`),
		/instruction limit exceeded/,
		'a closer cannot buy extra instructions after the limit fired',
	);
	assert.equal(host.evaluate('1 + 1'), 2, 'the host stays usable afterwards');
	host.dispose();
});

test('luaToJs translates Lua to JavaScript that computes the same result, and flags what it cannot', () => {
	const { code, exports } = luaToJs('function double(n) return n * 2 end', { format: 'cjs', header: false });
	assert.deepEqual(exports, ['double']);
	const module = { exports: {} as { double(n: number): number } };
	new Function('module', code)(module);
	assert.equal(module.exports.double(21), 42);
	const flagged = luaToJs('local t = setmetatable({}, {})');
	assert.ok(flagged.warnings.length > 0 && flagged.code.includes('TODO(lua2js)'));
	assert.throws(() => luaToJs('local ='), /line 1/);
});

test('the Lua host exposes no loader, no bytecode dumper and no VM internals', () => {
	const host = createPyroeisScriptHost();
	try {
		for (const name of ['load', 'loadfile', 'dofile', 'require', '__random', 'string.dump'])
			assert.equal(host.evaluate(`type(${name})`), 'nil', name);
	} finally {
		host.dispose();
	}
});
