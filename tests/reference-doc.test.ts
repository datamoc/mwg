import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as core from '../src/core/index.ts';
import * as twoD from '../src/two-d/index.ts';
import * as render from '../src/two-d/render/index.ts';
import * as assets from '../src/assets/index.ts';
import * as audio from '../src/audio/index.ts';
import * as battle from '../src/battle/index.ts';
import * as board from '../src/board/index.ts';
import * as actors from '../src/actors/index.ts';
import * as roguelike from '../src/roguelike/index.ts';
import * as rpg from '../src/rpg/index.ts';
import * as simulation from '../src/simulation/index.ts';
import * as stage from '../src/two-d/stage/index.ts';
import * as ui from '../src/two-d/ui/index.ts';
import * as world from '../src/world/index.ts';
import * as i18n from '../src/i18n/index.ts';
import * as mwl from '../src/mwl/index.ts';

/**
 * REFERENCE.md is hand-written and nothing generates it, so it drifts silently the moment an
 * export lands without a line describing it. That has already happened once at the level
 * above this file: README.md's capability spec claimed particle effects, screen transitions,
 * tooltips and composable room builders for a long time before any of the four existed
 * (roadmap items 152-155), which is the same failure item 87 hit before that. A document read
 * as the definition of what exists has to be checked by something other than good intentions.
 *
 * `three-d` is deliberately excluded: it imports Babylon, which is an optional peer dependency
 * a plain `npm test` run has no reason to have installed.
 */
const MODULES: Record<string, Record<string, unknown>> = {
	core,
	'two-d': twoD,
	render,
	assets,
	audio,
	battle,
	board,
	actors,
	roguelike,
	rpg,
	simulation,
	stage,
	ui,
	world,
	i18n,
	mwl,
};

/** every identifier appearing inside a backticked span anywhere in the document */
function documentedNames(): Set<string> {
	const text = readFileSync(new URL('../REFERENCE.md', import.meta.url), 'utf8');
	const names = new Set<string>();

	for (const span of text.match(/`[^`\n]+`/g) ?? []) {
		for (const token of span.slice(1, -1).split(/[^A-Za-z0-9_$]+/)) {
			if (token) names.add(token);
		}
	}
	return names;
}

test('every runtime export is named somewhere in REFERENCE.md', () => {
	const documented = documentedNames();
	const undocumented: string[] = [];

	for (const [moduleName, namespace] of Object.entries(MODULES)) {
		for (const exported of Object.keys(namespace)) {
			if (!documented.has(exported)) undocumented.push(`${moduleName}.${exported}`);
		}
	}

	assert.deepEqual(
		undocumented,
		[],
		`REFERENCE.md does not mention these exports - add a line for each, or stop exporting it:\n${undocumented.join('\n')}`,
	);
});

test('every module REFERENCE.md lists a section for is one that actually exists', () => {
	const text = readFileSync(new URL('../REFERENCE.md', import.meta.url), 'utf8');

	//the Contents line links each module section; three-d is real but not imported here
	const linked = [...text.matchAll(/\[([a-z-]+)\]\(#([a-z-]+)\)/g)].map((match) => match[1]);
	assert.ok(linked.length > 0, 'the Contents list should link every module');

	const known = new Set([...Object.keys(MODULES), 'three-d']);
	for (const name of linked) {
		assert.ok(known.has(name), `REFERENCE.md links a "${name}" module that does not exist`);
	}
});
