/**
 * Explicit, exceptional backend access.
 *
 * A normal 2D game should never need this: `two-d`'s own facade (`Container2D`, `Texture2D`,
 * `Sprite`/`AnimatedSprite`/`TintedSprite`, `NinePatch`, `SpriteSheet`) covers ordinary needs
 * without naming a `pixi.js` type. This module exists for the rare case where a game needs a
 * Pixi-specific effect the facade does not cover yet - importing from here rather than from
 * `pixi.js` directly keeps that dependency visible and confined to one file, instead of
 * spreading `pixi.js` imports through the game's own source.
 */
export { Container, Sprite, Texture, Graphics, Rectangle, Text } from 'pixi.js';
export type { SpriteOptions } from 'pixi.js';
