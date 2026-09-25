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

test('the Lua host hides the string metatable and keeps the removed libraries removed', () => {
	const host = createFengariScriptHost();
	assert.equal(host.evaluate('getmetatable("")'), false);
	assert.equal(host.evaluate('os == nil and io == nil and load == nil and require == nil'), true);
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
