import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPyroeisScriptHost } from '../src/mwl/pyroeis.ts';

// Vérifie que @datamoc/pyroeis est bien utilisé et que le sandboxing fonctionne.
test('The Lua host keeps sandbox globals restricted with @datamoc/pyroeis', () => {
	const host = createPyroeisScriptHost();
	assert.equal(host.evaluate('os == nil and io == nil and load == nil and require == nil'), true);
	assert.equal(host.evaluate('getmetatable("")'), false);
	host.dispose();
});
