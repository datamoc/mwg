import { Container } from 'pixi.js';
import type { Texture } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';

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
 */
export class LayeredSprite extends Container {
	private layers = new Map<string, Layer>();

	/**
	 * Adds or replaces a named layer.
	 *
	 * @param order stacking order, higher drawn on top; equal order keeps insertion order
	 */
	addLayer(name: string, texture: Texture, order = 0): TintedSprite {
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
	setTexture(name: string, texture: Texture): void {
		const layer = this.layers.get(name);
		if (layer) layer.sprite.texture = texture;
	}

	private resort(): void {
		const sorted = [...this.layers.values()].sort((a, b) => a.order - b.order);
		sorted.forEach((layer, index) => this.setChildIndex(layer.sprite, index));
	}
}
