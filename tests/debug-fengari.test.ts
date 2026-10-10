import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFengariScriptHost } from '../src/mwl/fengari.ts';

// Vérifie que @datamoc/fengari est bien utilisé et que le sandboxing fonctionne.
test('Fengari sandboxing works with @datamoc/fengari', () => {
	const host = createFengariScriptHost();
	assert.equal(host.evaluate('os == nil and io == nil and load == nil and require == nil'), true);
	assert.equal(host.evaluate('getmetatable("")'), false);
	host.dispose();
});
