/**
 * The blessed renderer-free entry: every `mwg` module that loads in bare Node, in one
 * import, with no DOM or WebGL globals.
 *
 * A game rule that never touches a renderer should never have to discover, by accident,
 * which subpaths load without one. Importing this entry is the declaration: if it loads,
 * the game logic is headless; if a rule needs anything outside it, that dependency is
 * renderer-bound and belongs in presentation, not in the rule.
 *
 * Membership is the set `REFERENCE.md` documents as renderer-free, minus `three-d`
 * (renderer-free of Pixi but needing Babylon at import, an optional peer a plain
 * `npm test` run has no reason to have installed), plus the two renderer-free asset
 * halves (`assetPaths`, `assetBinary` - path resolution and byte caching with no
 * renderer, beside the Pixi-backed `assets` loader). Deliberately excluded: the Lua
 * runtimes (`mwl/fengari`, `ai/lua`), which carry their own load contracts, and every
 * `two-d/*` module (Pixi by documentation, enforced by test).
 *
 * `threads` rides along (simulation's async rollouts and `ai` training spawn through
 * it, and it loads with no renderer - its worker host is a call-time concern, not an
 * import-time one, handled inside `threads.spawn` itself).
 *
 * `tests/headless-smoke.test.ts` is the proof: it imports this entry in plain Node
 * with no DOM/WebGL globals, walks the reachable import graph for a renderer leak,
 * and runs a seeded scenario through it twice for the same result.
 *
 * @example
 * ```ts
 * import {
 * 	actors,
 * 	ai,
 * 	assetBinary,
 * 	assetPaths,
 * 	audio,
 * 	battle,
 * 	board,
 * 	core,
 * 	i18n,
 * 	mwl,
 * 	roguelike,
 * 	rpg,
 * 	simulation,
 * 	testing,
 * 	world,
 * } from '@datamoc/mw_games/headless';
 *
 * // deterministic rules with no renderer: a seeded stream plus one headless scenario
 * const random = new core.Generator(7);
 * const result = simulation.runScenario({
 * 	state: { value: 0 },
 * 	commands: [1, 2, 3],
 * 	random,
 * 	step: (state, command, rng) => ({
 * 		state: { value: state.value + command + rng.int(2) },
 * 		events: [],
 * 		status: 'ready' as const,
 * 	}),
 * });
 *
 * // every other member rides the same entry: content, rules, saves, and the two
 * // renderer-free asset halves (path resolution and byte caching with no loader)
 * const tables = mwl.MWL_SCHEMA_10;
 * const present = assetPaths.has('tiles/grass.png');
 * const cached = assetBinary.isBinaryLoaded('sfx/hit.mp3');
 * const check = { actors, ai, audio, battle, board, i18n, roguelike, rpg, testing, world };
 * void result;
 * void tables;
 * void present;
 * void cached;
 * void check;
 * ```
 */
export * as core from '../core/index.ts';
export * as simulation from '../simulation/index.ts';
export * as mwl from '../mwl/index.ts';
export * as i18n from '../i18n/index.ts';
export * as actors from '../actors/index.ts';
export * as world from '../world/index.ts';
export * as battle from '../battle/index.ts';
export * as roguelike from '../roguelike/index.ts';
export * as board from '../board/index.ts';
export * as audio from '../audio/index.ts';
export * as rpg from '../rpg/index.ts';
export * as ai from '../ai/index.ts';
export * as testing from '../testing/index.ts';
export * as assetPaths from '../assets/paths.ts';
export * as assetBinary from '../assets/binary.ts';
