import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { compile } from '../src/mwl/compiler.ts';

/**
 * Golden test for the EXAMPLES.md skirmish (MWL-101): the compiled output is
 * checked in, so any change to grammar, schema, or compiler shows up as a
 * reviewable diff. Run `MWL_UPDATE_GOLDEN=1 node --test tests/mwl-golden.test.ts`
 * to regenerate it after an intended change.
 */
const fixture = new URL('./fixtures/mwl/skirmish.mwl', import.meta.url);
const golden = new URL('./fixtures/mwl/skirmish.golden.json', import.meta.url);

test('the example skirmish compiles to its checked-in golden output', () => {
	const game = compile(readFileSync(fixture, 'utf8'), { file: 'skirmish.mwl' });
	const actual = `${JSON.stringify(game, null, '\t')}\n`;
	if (process.env.MWL_UPDATE_GOLDEN === '1') {
		writeFileSync(golden, actual);
		return;
	}
	assert.deepEqual(JSON.parse(readFileSync(golden, 'utf8')), game);
});
