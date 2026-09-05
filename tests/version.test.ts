import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { version } from '../src/version.ts';

test('the exported version stays in sync with package.json - bump both together', () => {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
	assert.equal(version, pkg.version);
});
