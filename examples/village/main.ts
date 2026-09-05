import { Game, Scene, Input } from '../../src/core/index.ts';
import { Camera, TileMap, SpriteSheet, TintedSprite, AnimatedSprite, registerColorTransform } from '../../src/render/index.ts';
import { Label, WindowStack, theme } from '../../src/ui/index.ts';
import {
	GameState,
	activePage,
	EventRunner,
	GridMover,
	type MapEvent,
	type Direction4,
	type EventCommand,
} from '../../src/rpg/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * A village: an NPC with two conversation pages selected by a switch, and a short
 * autorun cutscene the first time the map loads - the two things `mwg/rpg` and
 * `mwg/stage`'s sibling, the event runner, exist for that the dungeon example does not
 * touch at all.
 *
 * There is no walk-cycle asset for the player or the shopkeeper yet (that is
 * `tools/make-example-assets.mjs`'s own roadmap, not this example's job to fake), so
 * `GridMover` here glides a static sprite between tiles rather than animating one - its
 * animation hooks are simply unused, which is exactly what they degrade to when a sprite
 * has no matching animation registered.
 */

const TILES = 'tiles.png';
const STRANGER = 'char_stranger.png';
const SHOPKEEPER = 'char_shopkeeper.png';
const { tiles, tileSize, character } = tileset;

const MAP_WIDTH = 16;
const MAP_HEIGHT = 12;
const SHOPKEEPER_POS = { x: 8, y: 5 };

const MOVES: Record<string, { x: number; y: number }> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

class VillageScene extends Scene {
	private camera!: Camera;
	private map!: TileMap;
	private windows = new WindowStack();
	private game = new GameState();

	private player!: GridMover;
	private playerSprite!: AnimatedSprite;

	private shopkeeperEvent!: MapEvent;
	private status!: Label;
	private runner: EventRunner | null = null;

	override create(): void {
		const sheet = SpriteSheet.grid(TILES, tileSize);

		this.camera = new Camera({ zoom: 3, deadzone: 0.2 });
		this.stage.addChild(this.camera.world);

		this.buildGround(sheet);

		const strangerSheet = SpriteSheet.grid(STRANGER, character.frameWidth, character.frameHeight);
		this.playerSprite = new AnimatedSprite(strangerSheet.get(character.expressions.neutral));
		this.scaleToTile(this.playerSprite);
		this.camera.world.addChild(this.playerSprite);
		this.player = new GridMover(this.playerSprite, 3, 8, { tileWidth: tileSize, tileHeight: tileSize, speed: 5 });

		const shopkeeperSheet = SpriteSheet.grid(SHOPKEEPER, character.frameWidth, character.frameHeight);
		const shopkeeperSprite = new TintedSprite(shopkeeperSheet.get(character.expressions.neutral));
		this.scaleToTile(shopkeeperSprite);
		shopkeeperSprite.x = SHOPKEEPER_POS.x * tileSize;
		shopkeeperSprite.y = SHOPKEEPER_POS.y * tileSize;
		this.camera.world.addChild(shopkeeperSprite);

		this.shopkeeperEvent = {
			id: 'shopkeeper',
			x: SHOPKEEPER_POS.x,
			y: SHOPKEEPER_POS.y,
			pages: [
				{
					trigger: 'action',
					commands: [
						{ setSwitch: 'metShopkeeper', value: true },
						{ say: 'Welcome, stranger! First time in town?', speaker: 'Shopkeeper' },
						{
							ask: 'Take a potion for the road?',
							speaker: 'Shopkeeper',
							choices: [{ text: 'Gladly', value: true }, { text: 'No thanks', value: false }],
							store: 'tookPotion',
						},
						//EventRunner's built-in `if` only reads GameState (switches/variables), not an
						//`ask`'s own stored answer - `call` is the escape hatch for exactly this
						{ call: (state) => { if (state.answers.tookPotion) state.game.setVariable('potions', state.game.variable('potions') + 1); } },
					],
				},
				{
					trigger: 'action',
					conditions: [{ switch: 'metShopkeeper', equals: true }],
					commands: [{ say: "Back again? Mind the wolves outside town.", speaker: 'Shopkeeper' }],
				},
			],
		};

		this.camera.setBounds({
			minX: 0,
			minY: 0,
			maxX: this.map.worldWidth,
			maxY: this.map.worldHeight,
		});
		this.camera.follow(this.playerSprite);

		this.status = new Label({ color: theme().color.textDim, size: 12 });
		this.status.x = 12;
		this.status.y = 10;
		this.stage.addChild(this.status);
		this.updateStatus();

		this.stage.addChild(this.windows);
		Input.onAction.add((action) => this.onAction(action));

		//an autorun cutscene: plays once, unprompted, as soon as the map loads
		void this.runCutscene([
			{ say: 'The gates creak shut behind you. Somewhere, a dog barks.' },
			{ say: "Elsewhere, a wolf howls, closer than you'd like." },
		]);
	}

	private buildGround(sheet: SpriteSheet): void {
		this.map = new TileMap({ width: MAP_WIDTH, height: MAP_HEIGHT, sheet });

		const frames: number[] = [];
		for (let y = 0; y < MAP_HEIGHT; y++) {
			for (let x = 0; x < MAP_WIDTH; x++) {
				const border = x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1;
				frames.push(border ? tiles.WALL : tiles.GRASS);
			}
		}
		this.map.addLayer('ground', frames);
		this.camera.world.addChild(this.map);
	}

	private scaleToTile(sprite: TintedSprite): void {
		//the character sheet draws a figure taller than one tile, the same way an RPG's
		//characters usually stand a head or two above the floor tile they occupy. Kept at
		//the default top-left anchor, matching GridMover and the dungeon example's own
		//placement, rather than an anchor GridMover's plain tile*tileWidth math does not expect.
		sprite.scale.set((tileSize * 1.5) / character.frameHeight);
	}

	private onAction(action: string): boolean {
		if (this.windows.blocksWorld || this.runner) return false;

		if (action === 'confirm') {
			const front = this.tileInFront();
			if (front.x === this.shopkeeperEvent.x && front.y === this.shopkeeperEvent.y) {
				void this.talkTo(this.shopkeeperEvent);
				return true;
			}
			return false;
		}

		const move = MOVES[action];
		if (!move) return false;

		const target = { x: this.player.x + move.x, y: this.player.y + move.y };
		const blocked =
			this.map.getTile('ground', target.x, target.y) === tiles.WALL ||
			(target.x === this.shopkeeperEvent.x && target.y === this.shopkeeperEvent.y);
		if (blocked) {
			//still turns to face what was bumped into - a wall, or the shopkeeper - so
			//approaching from the "wrong" side does not leave the player unable to face them
			this.player.turnTo(move.x, move.y);
			return true;
		}
		return this.player.moveBy(move.x, move.y);
	}

	private tileInFront(): { x: number; y: number } {
		const facing: Record<Direction4, { x: number; y: number }> = {
			up: { x: 0, y: -1 },
			down: { x: 0, y: 1 },
			left: { x: -1, y: 0 },
			right: { x: 1, y: 0 },
		};
		const delta = facing[this.player.facing];
		return { x: this.player.x + delta.x, y: this.player.y + delta.y };
	}

	private async talkTo(event: MapEvent): Promise<void> {
		const page = activePage(event, this.game);
		if (!page) return;
		await this.runCutscene(page.commands);
	}

	private async runCutscene(commands: readonly EventCommand[]): Promise<void> {
		this.runner = new EventRunner({ windows: this.windows, game: this.game });
		await this.runner.run(commands);
		this.runner = null;
		this.updateStatus();
	}

	private updateStatus(): void {
		this.status.setText(
			`potions: ${this.game.variable('potions')}    arrow keys to move, Enter to talk to the shopkeeper`
		);
	}

	override resize(width: number, height: number): void {
		this.camera.setViewport(width, height);
		this.windows.setViewport(width, height);
	}

	override update(dt: number): void {
		this.player.update(dt);
		this.camera.update(dt);
		this.map.cull(this.camera);
		this.windows.update(dt);
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x1c2a1c,
		extensions: [registerColorTransform],
	});

	await Resources.load([TILES, STRANGER, SHOPKEEPER]);
	await game.start(VillageScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});
