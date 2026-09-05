/**
 * mwg - a framework for 2D top-down games that run from a local file.
 *
 * This is the whole surface in one place, which is also what the standalone
 * `mw_games.global.js` build exposes as `window.mw_games`. Consumers using a bundler can
 * import the narrower entry points instead: `mw_games/core`, `mw_games/render`,
 * `mw_games/roguelike`.
 */
export { version } from './version.ts';
export * from './core/index.ts';
export * from './render/index.ts';
export * as Resources from './assets/index.ts';
export * from './ui/index.ts';
export * from './stage/index.ts';
export * as Roguelike from './roguelike/index.ts';
export * as I18n from './i18n/index.ts';
export * as Actors from './actors/index.ts';
export * as World from './world/index.ts';
export * as Rpg from './rpg/index.ts';
export * as Battle from './battle/index.ts';
export * as Board from './board/index.ts';
export * as Audio from './audio/index.ts';
