import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFengariScriptHost } from '../src/mwl/fengari.ts';

test('the Lua host bounds string allocation, not only instruction count', () => {
	const host = createFengariScriptHost({ instructionLimit: 1000, memoryLimit: 1024 * 1024 });
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
	const host = createFengariScriptHost();
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
	const host = createFengariScriptHost();
	assert.throws(() => host.execute('\x1bLua\x00\x00\x00'), /binary chunk/);
	assert.equal(host.evaluate('1 + 1'), 2, 'the host stays usable afterwards');
	host.dispose();
});

test('an emit callback runs with the real Uint8Array and outside the Lua budget', () => {
	const host = createFengariScriptHost({ memoryLimit: 64 * 1024 });
	let seen = 0;
	host.execute('mwg_emit("big")', {}, () => {
		seen = new Uint8Array(1024 * 1024).byteLength;
		assert.equal(Object.getPrototypeOf(new Uint8Array(1)), Uint8Array.prototype);
	});
	assert.equal(seen, 1024 * 1024);
	assert.throws(() => createFengariScriptHost({ memoryLimit: 0 }), /memoryLimit must be a positive integer/);
	host.dispose();
});

test('a refused allocation surfaces as not enough memory to scripts, and the host still rejects the call', () => {
	const host = createFengariScriptHost({ memoryLimit: 1024 });
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
	const host = createFengariScriptHost({ instructionLimit: 5000 });
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
