import { Container } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';
import type { Texture2D } from './Types2D.ts';

interface Layer {
	sprite: TintedSprite;
	order: number;
}

/**
 * A character assembled from independently swappable, independently tintable layers -
 * skin, eyes, hair, garments, worn equipment - rather than one flat sprite per combination.
 * A second palette is a colour change on one layer; worn equipment shows because it is
 * another layer added on top, not a redrawn sprite for every gear combination a game might
 * have. `tools/make-example-assets.mjs` already draws its characters this way; this is the
 * runtime counterpart that keeps the layers together as one sprite that moves as a unit.
 *
 * @example
 * ```ts
 * import { LayeredSprite } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const skinTexture: Texture2D;
 * declare const hairTexture: Texture2D;
 * declare const swordTexture: Texture2D;
 *
 * const hero = new LayeredSprite();
 * hero.addLayer('skin', skinTexture, 0);
 * hero.addLayer('hair', hairTexture, 1);
 * hero.addLayer('weapon', swordTexture, 2);
 *
 * hero.layer('hair')?.lerpTint(0x8b4513, 1); // dye it brown
 * hero.setTexture('weapon', swordTexture); // equip a different sword later
 * console.log(hero.hasLayer('weapon')); // true
 *
 * hero.alpha = 0.5; // the whole assembled character turns translucent, every layer at once
 * ```
 *
 * `LayeredSprite` is a plain Pixi `Container`, not itself a `TintedSprite`: its own `alpha`
 * still fades every layer together, since Pixi composes a container's alpha into each
 * child's when rendering, the same way it would for any other container of sprites. A
 * single layer can still be faded on its own through `layer(name)`, which returns the
 * `TintedSprite` directly.
 */
export class LayeredSprite extends Container {
	private layers = new Map<string, Layer>();

	/**
	 * Adds or replaces a named layer.
	 *
	 * @param order stacking order, higher drawn on top; equal order keeps insertion order
	 */
	addLayer(name: string, texture: Texture2D, order = 0): TintedSprite {
		this.removeLayer(name);

		const sprite = new TintedSprite(texture);
		this.layers.set(name, { sprite, order });
		this.addChild(sprite);
		this.resort();
		return sprite;
	}

	removeLayer(name: string): void {
		const existing = this.layers.get(name);
		if (!existing) return;

		this.layers.delete(name);
		existing.sprite.destroy();
	}

	layer(name: string): TintedSprite | undefined {
		return this.layers.get(name)?.sprite;
	}

	hasLayer(name: string): boolean {
		return this.layers.has(name);
	}

	/** swaps a layer's texture without touching its tint, order, or identity - gear changing */
	setTexture(name: string, texture: Texture2D): void {
		const layer = this.layers.get(name);
		if (layer) layer.sprite.texture = texture;
	}

	private resort(): void {
		const sorted = [...this.layers.values()].sort((a, b) => a.order - b.order);
		sorted.forEach((layer, index) => this.setChildIndex(layer.sprite, index));
	}
}
