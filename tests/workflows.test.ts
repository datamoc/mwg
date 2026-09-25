import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Item 379's two rules, held by a test rather than by review: every action is pinned to a full
 * commit SHA (a tag can be repointed to other code; Dependabot keeps the pins current), and every
 * workflow declares its token permissions instead of inheriting the repository default.
 */
const dir = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(dir)
	.filter((name) => name.endsWith('.yml'))
	.map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

test('every action a workflow uses is pinned to a commit SHA', () => {
	for (const { name, text } of workflows)
		for (const [, ref] of text.matchAll(/uses:\s*([^\s#]+)/g))
			assert.match(ref, /@[0-9a-f]{40}$/, `${name}: ${ref} is not pinned to a commit`);
});

test('every workflow declares its token permissions', () => {
	for (const { name, text } of workflows)
		assert.match(text, /^\s*permissions:/m, `${name} inherits the default token`);
});
