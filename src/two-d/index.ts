/**
 * Everything that draws in 2D, through PixiJS.
 *
 * The counterpart to `mwg/3d`, and the reason `mwg/core` needs no renderer: `Game` owns the
 * Pixi `Application` and the frame loop, `Scene2D` adds a display container to `core.Scene`'s
 * renderer-free lifecycle, and `render`, `ui` and `stage` live underneath here because every
 * one of them is Pixi from top to bottom.
 *
 * This barrel is the one-stop 2D import. The granular subpaths still exist and are what a
 * game concerned with bundle size should reach for: `mwg/two-d/render`, `mwg/two-d/ui`,
 * `mwg/two-d/stage`.
 */

export { Game } from './Game.ts';
export type { GameOptions } from './Game.ts';

export { Scene2D } from './Scene2D.ts';
export type { Scene2DClass } from './Scene2D.ts';

export * from './render/index.ts';
export * from './ui/index.ts';
export * from './stage/index.ts';
