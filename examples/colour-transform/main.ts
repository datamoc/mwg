import { Rectangle, Texture, Text, Container } from 'pixi.js';
import { Game, Scene, Random } from '../../src/core/index.ts';
import { TintedSprite, registerColorTransform } from '../../src/render/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * What the colour transform is for.
 *
 * The same sprite sheet is drawn four times over: untouched, darkened with an ordinary
 * multiply tint, and then twice using the additive term that Pixi's tint cannot express.
 * Every sprite here goes through the one colour-transform batcher, with no per-object
 * render pass anywhere.
 */

const { tileSize, columns, tiles } = tileset;

const TILES_PNG = 'tiles.png';
const GEM_SVG = 'icon_gem.svg';

class ColourTransformScene extends Scene {
	private sheet!: Texture;
	private pulsing: TintedSprite[] = [];
	private elapsed = 0;

	override create(): void {
		this.sheet = Resources.texture(TILES_PNG);

		const rows: Array<[string, (sprite: TintedSprite, index: number) => void]> = [
			['texture as it is', () => {}],
			['tint 0x5060a0: multiply only, what Pixi gives you', (s) => (s.tint = 0x5060a0)],
			['lerpTint(0x30ff40, 0.6): needs the additive term', (s) => s.lerpTint(0x30ff40, 0.6)],
			['silhouette(0xff4040): shape only', (s) => s.silhouette(0xff4040)],
		];

		const shown = [tiles.FLOOR, tiles.WALL, tiles.WATER, tiles.GRASS, tiles.DOOR, tiles.COIN, tiles.HERO, tiles.RAT, tiles.BLOB];
		const scale = 3;

		rows.forEach(([label, style], row) => {
			const y = 40 + row * (tileSize * scale + 34);

			this.stage.addChild(
				new Text({
					text: label,
					style: { fill: 0xd0d0d8, fontFamily: 'monospace', fontSize: 13 },
					x: 20,
					y: y - 20,
				})
			);

			shown.forEach((tile, index) => {
				const sprite = new TintedSprite(this.tile(tile));
				sprite.x = 20 + index * (tileSize * scale + 8);
				sprite.y = y;
				sprite.scale.set(scale);
				style(sprite, index);
				this.stage.addChild(sprite);
			});
		});

		this.addPulsingRow(40 + rows.length * (tileSize * scale + 34), scale);
		this.addSvgRow(40 + (rows.length + 1) * (tileSize * scale + 34), scale);
		this.addStressTest();
	}

	/**
	 * SVG textures, tinted the same way a PNG one is - roadmap item 15: verifying that an
	 * SVG loads through the compiled file:// path (a data:image/svg+xml URI reached by an
	 * aliased path with no .svg on the URL itself), not only that the path resolves.
	 */
	private addSvgRow(y: number, scale: number): void {
		this.stage.addChild(
			new Text({
				text: 'icon_gem.svg: an SVG texture, loaded and tinted the same as a PNG one',
				style: { fill: 0xd0d0d8, fontFamily: 'monospace', fontSize: 13 },
				x: 20,
				y: y - 20,
			})
		);

		const styles: Array<(sprite: TintedSprite) => void> = [
			() => {},
			(s) => (s.tint = 0x5060a0),
			(s) => s.lerpTint(0x30ff40, 0.6),
		];
		styles.forEach((style, index) => {
			const sprite = new TintedSprite(Resources.texture(GEM_SVG));
			sprite.x = 20 + index * (32 * scale + 8);
			sprite.y = y;
			sprite.scale.set(scale / 2);
			style(sprite);
			this.stage.addChild(sprite);
		});
	}

	/** the same lerp, animated, which is what a "poisoned" or "burning" state looks like */
	private addPulsingRow(y: number, scale: number): void {
		this.stage.addChild(
			new Text({
				text: 'animated: the additive term driven per frame',
				style: { fill: 0xd0d0d8, fontFamily: 'monospace', fontSize: 13 },
				x: 20,
				y: y - 20,
			})
		);

		const creatures = [tiles.HERO, tiles.RAT, tiles.BLOB, tiles.HERO, tiles.RAT, tiles.BLOB];
		creatures.forEach((tile, index) => {
			const sprite = new TintedSprite(this.tile(tile));
			sprite.x = 20 + index * (tileSize * scale + 8);
			sprite.y = y;
			sprite.scale.set(scale);
			this.stage.addChild(sprite);
			this.pulsing.push(sprite);
		});
	}

	/**
	 * A few thousand individually tinted sprites.
	 *
	 * The point is that the additive term rides in the vertex data, so these cost the same
	 * as untinted sprites. The equivalent with per-object filters would be a few thousand
	 * render-texture passes.
	 */
	private addStressTest(): void {
		const layer = new Container();
		layer.x = 480;
		layer.y = 40;
		this.stage.addChild(layer);

		this.stage.addChild(
			new Text({
				text: '4000 sprites, each with its own colour transform',
				style: { fill: 0x808088, fontFamily: 'monospace', fontSize: 12 },
				x: 480,
				y: 20,
			})
		);

		const options = [tiles.FLOOR, tiles.FLOOR_WORN, tiles.WALL, tiles.GRASS, tiles.WATER];
		for (let i = 0; i < 4000; i++) {
			const sprite = new TintedSprite(this.tile(Random.element(options)!));
			sprite.x = (i % 80) * 8;
			sprite.y = Math.floor(i / 80) * 8;
			sprite.scale.set(0.5);
			//every one gets its own transform, so nothing can be shared or cached away
			sprite.lerpTint(Random.int(0xffffff), Random.float(0.6));
			layer.addChild(sprite);
		}
	}

	private tile(index: number): Texture {
		const x = (index % columns) * tileSize;
		const y = Math.floor(index / columns) * tileSize;
		return new Texture({
			source: this.sheet.source,
			frame: new Rectangle(x, y, tileSize, tileSize),
		});
	}

	override update(dt: number): void {
		this.elapsed += dt;

		this.pulsing.forEach((sprite, index) => {
			const phase = this.elapsed * 2 + index * 0.5;
			const strength = (Math.sin(phase) + 1) / 2;
			sprite.lerpTint(index % 2 === 0 ? 0x40ff60 : 0xff8020, strength * 0.85);
		});
	}
}

async function main(): Promise<void> {
	//the Game is constructed first: pixelArt defaults to true, and that has to be set
	//before any texture is created for it to take effect
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x14141a,
		extensions: [registerColorTransform],
	});

	//no base is needed: the dev server publishes examples/assets at its root, and a built
	//page resolves the same path to a compiled data: URI
	await Resources.load([TILES_PNG, GEM_SVG]);
	await game.start(ColourTransformScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});
