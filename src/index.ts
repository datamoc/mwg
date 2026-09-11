/**
 * mwg - a framework for 2D top-down games that run from a local file.
 *
 * This is the whole surface in one place, which is also what the standalone
 * `mw_games.global.js` build exposes as `window.mw_games`. Consumers using a bundler can
 * import the narrower entry points instead: `mw_games/core`, `mw_games/two-d`,
 * `mw_games/roguelike`. `mw_games/3d` is deliberately absent from here: it pulls in Babylon,
 * which a 2D game should never pay for by importing the root.
 */
export { version } from './version.ts';
export * from './core/index.ts';
export * from './two-d/index.ts';
export * as Resources from './assets/index.ts';
export * as Roguelike from './roguelike/index.ts';
export * as I18n from './i18n/index.ts';
export * as Actors from './actors/index.ts';
export * as World from './world/index.ts';
export * as Rpg from './rpg/index.ts';
export * as Battle from './battle/index.ts';
export * as Board from './board/index.ts';
export * as Audio from './audio/index.ts';
export * as Simulation from './simulation/index.ts';
export * as Mwl from './mwl/index.ts';
export * as AI from './ai/index.ts';
