import { Game, Scene, Input } from '../../src/core/index.ts';
import { Camera, TileMap, SpriteSheet, AnimatedSprite, EMPTY, registerColorTransform } from '../../src/render/index.ts';
import { GridMover } from '../../src/rpg/index.ts';
import { Label, theme } from '../../src/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * Map basics, isolated from `village`'s dialogue and `dungeon`'s combat/inventory: grid
 * movement (`Input.onAction` names a direction, `GridMover` tweens the sprite one tile at a
 * time, a plain lookup against the map's own wall tile is the entire collision rule) over a
 * map built from two `TileMap` layers - a full `ground` the collision rule reads, and a
 * sparse, purely cosmetic `decoration` layer that does not block anything - with a camera
 * that both follows the player and can be zoomed, and `TileMap.cull(camera)` called out on
 * its own. This is the smallest version of the "walk around a map" loop every RPG/roguelike
 * example here builds on.
 */

const TILES = 'tiles.png';
const { tiles, tileSize } = tileset;
const MAP_WIDTH = 24;
const MAP_HEIGHT = 16;
const PILLAR = { x: 10, y: 8 };

const MOVES: Record<string, { x: number; y: number }> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

class MovementScene extends Scene {
	private camera!: Camera;
	private map!: TileMap;
	private player!: GridMover;
	private sprite!: AnimatedSprite;
	private status!: Label;
	private lastBlocked = false;

	override create(): void {
		const sheet = SpriteSheet.grid(TILES, tileSize);
		this.camera = new Camera({ zoom: 3 });
		this.stage.addChild(this.camera.world);

		this.map = new TileMap({ width: MAP_WIDTH, height: MAP_HEIGHT, sheet });

		const ground: number[] = [];
		for (let y = 0; y < MAP_HEIGHT; y++) {
			for (let x = 0; x < MAP_WIDTH; x++) {
				//a wall border, plus one free-standing pillar to walk into on purpose
				const border = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1;
				const pillar = x === PILLAR.x && y === PILLAR.y;
				ground.push(border || pillar ? tiles.WALL : tiles.GRASS);
			}
		}
		this.map.addLayer('ground', ground);

		//a second, mostly-empty layer: only a handful of cells carry a decoration frame, the
		//rest are EMPTY and draw nothing at all. Purely cosmetic - the collision rule below
		//only ever reads 'ground', so walking "through" a decoration is expected, not a bug
		const decoration: number[] = new Array(MAP_WIDTH * MAP_HEIGHT).fill(EMPTY);
		for (let i = 0; i < 18; i++) {
			const x = 2 + Math.floor(Math.random() * (MAP_WIDTH - 4));
			const y = 2 + Math.floor(Math.random() * (MAP_HEIGHT - 4));
			decoration[y * MAP_WIDTH + x] = tiles.WALL;
		}
		this.map.addLayer('decoration', decoration);
		this.camera.world.addChild(this.map);

		//GridMover needs an AnimatedSprite specifically, though not necessarily an animated
		//one - with no animation ever registered, its walk/idle hooks simply degrade to a
		//static sprite, the same way GridMover's own doc comment describes
		this.sprite = new AnimatedSprite(sheet.get(tiles.HERO));
		this.camera.world.addChild(this.sprite);
		this.player = new GridMover(this.sprite, 2, 2, { tileWidth: tileSize, tileHeight: tileSize, speed: 6 });

		this.camera.setBounds({ minX: 0, minY: 0, maxX: this.map.worldWidth, maxY: this.map.worldHeight });
		this.camera.follow(this.sprite);

		this.status = new Label({ color: theme().color.textDim, size: 12 });
		this.status.position.set(12, 10);
		this.stage.addChild(this.status);
		this.updateStatus();

		Input.onAction.add((action) => this.onAction(action));
		Input.onWheel.add(({ action, delta }) => {
			if (action !== 'zoom') return false;
			this.camera.zoom = Math.max(1, Math.min(6, this.camera.zoom - delta * 0.002));
			return true;
		});
	}

	private onAction(action: string): boolean {
		const move = MOVES[action];
		if (!move) return false;

		const targetX = this.player.x + move.x;
		const targetY = this.player.y + move.y;
		this.lastBlocked = this.map.getTile('ground', targetX, targetY) === tiles.WALL;
		this.updateStatus();
		if (this.lastBlocked) return true; //consumed the key even though nothing moved

		return this.player.moveBy(move.x, move.y);
	}

	override resize(width: number, height: number): void {
		this.camera.setViewport(width, height);
	}

	override update(dt: number): void {
		this.player.update(dt);
		this.camera.update(dt);
		this.map.cull(this.camera);
	}

	private updateStatus(): void {
		this.status.setText(
			(this.lastBlocked ? 'blocked - that tile is a wall\n' : '') +
				`at (${this.player.x}, ${this.player.y})    arrow keys to move    Ctrl+wheel to zoom`
		);
	}
}

async function main(): Promise<void> {
	//TileMap and AnimatedSprite both build on TintedSprite's per-sprite colour transform,
	//which mwg/core does not pull in on its own - a game using it registers the extension
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x101018,
		extensions: [registerColorTransform],
	});
	await Resources.load([TILES]);
	await game.start(MovementScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
