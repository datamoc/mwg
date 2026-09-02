/**
 * mwg - a framework for 2D roguelikes that run from a local file.
 *
 * This is the whole surface in one place, which is also what the standalone
 * `mwg.global.js` build exposes as `window.mwg`. Consumers using a bundler can import the
 * narrower entry points instead: `mwg/core`, `mwg/render`, `mwg/roguelike`.
 */
export * from './core/index.ts';
export * from './render/index.ts';
export * as Resources from './assets/index.ts';
export * from './ui/index.ts';
export * from './stage/index.ts';
export * as Roguelike from './roguelike/index.ts';
export * as I18n from './i18n/index.ts';
