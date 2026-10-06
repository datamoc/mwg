import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as headless from '../src/headless/index.ts';

/**
 * P29: `mwg/headless` is the blessed renderer-free entry. This test is the proof its
 * contract promises: it imports the entry in plain Node with no DOM/WebGL globals,
 * walks the reachable import graph for a renderer leak, and runs a seeded scenario
 * through it twice for the same result.
 */

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** every `.ts` file reachable by relative import from `entry`, including itself */
function reachableFrom(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [resolvePath(SRC, entry)];

	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(/(?:from|import)\s*['"](\.[^'"]+)['"]/g)) {
			queue.push(resolvePath(dirname(file), match[1]));
		}
	}
	return [...seen];
}

function importsRenderer(file: string): boolean {
	const source = readFileSync(file, 'utf8');
	return (
		/^\s*(?:import|export)\s+(?!type\s)[^;]*from\s*['"](?:pixi\.js|@pixi\/[^'"]*|@babylonjs\/[^'"]*)['"]/m.test(
			source,
		) || /^\s*import\s*['"](?:pixi\.js|@pixi\/[^'"]*|@babylonjs\/[^'"]*)['"]/m.test(source)
	);
}

test('the headless entry loads with no DOM or WebGL globals present', () => {
	assert.equal(typeof (globalThis as Record<string, unknown>).window, 'undefined');
	assert.equal(typeof (globalThis as Record<string, unknown>).document, 'undefined');
	assert.ok(headless.core, 'the core namespace rides the entry');
	assert.ok(headless.simulation, 'the simulation namespace rides the entry');
	assert.ok(headless.mwl, 'the mwl namespace rides the entry');
});

test('nothing reachable from the headless entry imports a renderer', () => {
	const offenders = reachableFrom('headless/index.ts').filter(importsRenderer);
	assert.deepEqual(
		offenders.map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/')),
		[],
		'a rule imported through mwg/headless must not pull in Pixi or Babylon',
	);
});

test('the headless entry excludes the modules with their own load contracts', () => {
	const files = reachableFrom('headless/index.ts').map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'));
	for (const banned of ['three-d/', 'two-d/', 'mwl/fengari', 'ai/lua']) {
		assert.ok(!files.some((file) => file.includes(banned)), `${banned} stays out of the headless graph`);
	}
});

test('a seeded scenario through the headless entry replays identically', () => {
	interface Counter {
		value: number;
	}

	const run = (seed: number): number => {
		const random = new headless.core.Generator(seed);
		return headless.simulation.runScenario({
			state: { value: 0 },
			commands: [1, 2, 3],
			random,
			step: (state: Counter, command: number, rng: headless.core.Generator) => ({
				state: { value: state.value + command + rng.int(4) },
				events: [],
				status: 'ready' as const,
			}),
		}).state.value;
	};

	assert.equal(run(11), run(11), 'the same seed through the same entry is the same game');
});
