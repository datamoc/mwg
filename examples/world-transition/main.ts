import { Game, Scene, Input } from '../../src/core/index.ts';
import { Camera, TileMap, SpriteSheet, TintedSprite, AnimatedSprite, registerColorTransform } from '../../src/render/index.ts';
import { World } from '../../src/world/World.ts';
import { GridMover } from '../../src/rpg/index.ts';
import { Label, theme } from '../../src/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * `mwg/world`'s `World<M>` moving the player between two maps, isolated from `village`'s
 * dialogue and `dungeon`'s combat. Walking off the right edge of Town enters Forest at its
 * left edge, and back. Town is `persistent` (`World`'s own default): its coin, once
 * collected, stays collected on every return. Forest is defined `persistent: false`
 * instead, on purpose, to show the other case side by side: it rebuilds from scratch on
 * every entry, so its own coin is back the next time you walk in.
 */

const TILES = 'tiles.png';
const { tiles, tileSize } = tileset;
const MAP_SIZE = 10;
const COIN_POS = { x: 5, y: 5 };

interface MapData {
	name: string;
	map: TileMap;
	coinTaken: boolean;
}

function buildMap(name: string, floorTile: number, sheet: SpriteSheet): MapData {
	const map = new TileMap({ width: MAP_SIZE, height: MAP_SIZE, sheet });
	const frames: number[] = [];
	for (let y = 0; y < MAP_SIZE; y++) {
		for (let x = 0; x < MAP_SIZE; x++) {
			const border = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
			//the left and right edges stay open at the middle row - the doorway to the other map
			const doorway = y === Math.floor(MAP_SIZE / 2) && (x === 0 || x === MAP_SIZE - 1);
			frames.push(border && !doorway ? tiles.WALL : floorTile);
		}
	}
	map.addLayer('ground', frames);
	return { name, map, coinTaken: false };
}

class WorldTransitionScene extends Scene {
	private camera!: Camera;
	private world = new World<MapData>();
	private sheet!: SpriteSheet;
	private sprite!: AnimatedSprite;
	private player!: GridMover;
	private coinSprite: TintedSprite | null = null;
	private mapLayer!: TileMap;
	private status!: Label;

	override create(): void {
		this.sheet = SpriteSheet.grid(TILES, tileSize);
		this.camera = new Camera({ zoom: 3 });
		this.stage.addChild(this.camera.world);

		this.world.define('town', () => buildMap('Town', tiles.FLOOR, this.sheet));
		this.world.define('forest', () => buildMap('Forest', tiles.GRASS, this.sheet), { persistent: false });

		//GridMover needs an AnimatedSprite specifically, though not necessarily an animated
		//one - with no animation ever registered, its walk/idle hooks simply degrade to a
		//static sprite
		this.sprite = new AnimatedSprite(this.sheet.get(tiles.HERO));

		this.status = new Label({ color: theme().color.textDim, size: 12 });
		this.status.position.set(12, 10);
		this.stage.addChild(this.status);

		this.enter('town', undefined, { x: 1, y: 5 });
		Input.onAction.add((action) => this.onAction(action));
	}

	private onAction(action: string): boolean {
		const moves: Record<string, { x: number; y: number }> = {
			up: { x: 0, y: -1 },
			down: { x: 0, y: 1 },
			left: { x: -1, y: 0 },
			right: { x: 1, y: 0 },
		};
		const move = moves[action];
		if (!move) return false;

		const targetX = this.player.x + move.x;
		const targetY = this.player.y + move.y;

		if (targetX < 0 || targetX >= MAP_SIZE) return this.crossOver(targetX);

		const data = this.world.current!;
		if (data.map.getTile('ground', targetX, targetY) === tiles.WALL) return true;

		if (targetX === COIN_POS.x && targetY === COIN_POS.y && !data.coinTaken) {
			data.coinTaken = true;
			this.coinSprite?.destroy();
			this.coinSprite = null;
		}
		return this.player.moveBy(move.x, move.y);
	}

	private crossOver(targetX: number): boolean {
		const goingRight = targetX >= MAP_SIZE;
		const nextId = this.world.currentMapId === 'town' ? 'forest' : 'town';
		const spawnX = goingRight ? 1 : MAP_SIZE - 2;
		this.enter(nextId, this.world.currentMapId ?? undefined, { x: spawnX, y: this.player.y });
		return true;
	}

	private enter(id: string, spawn: string | undefined, at: { x: number; y: number }): void {
		if (this.mapLayer) this.camera.world.removeChild(this.mapLayer);
		this.coinSprite?.destroy();
		this.coinSprite = null;

		const data = this.world.enter(id, spawn);
		this.mapLayer = data.map;
		this.camera.world.addChildAt(this.mapLayer, 0);

		if (!data.coinTaken) {
			this.coinSprite = new TintedSprite(this.sheet.get(tiles.COIN));
			this.coinSprite.position.set(COIN_POS.x * tileSize, COIN_POS.y * tileSize);
			this.camera.world.addChild(this.coinSprite);
		}

		this.camera.world.addChild(this.sprite);
		//a fresh GridMover per entry: it owns only position/facing, cheap to recreate, and
		//there is no other way to place one at an arbitrary tile after construction
		this.player = new GridMover(this.sprite, at.x, at.y, { tileWidth: tileSize, tileHeight: tileSize, speed: 6 });
		this.camera.setBounds({ minX: 0, minY: 0, maxX: this.mapLayer.worldWidth, maxY: this.mapLayer.worldHeight });
		this.camera.follow(this.sprite);
		this.camera.snapTo(at.x * tileSize, at.y * tileSize);
		this.updateStatus(data);
	}

	override resize(width: number, height: number): void {
		this.camera.setViewport(width, height);
	}

	override update(dt: number): void {
		this.player.update(dt);
		this.camera.update(dt);
		this.mapLayer.cull(this.camera);
	}

	private updateStatus(data: MapData): void {
		this.status.setText(
			`${data.name} - ${this.world.isPersistent(this.world.currentMapId!) ? 'persistent' : 'rebuilt every visit'}\n` +
				'arrow keys to move, walk off the left/right edge to cross over'
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
	await game.start(WorldTransitionScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
