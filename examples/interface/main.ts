import { Container } from 'pixi.js';
import { Game, Scene, Input } from '../../src/core/index.ts';
import { TintedSprite, SpriteSheet, registerColorTransform } from '../../src/render/index.ts';
import { Window, WindowStack, ListView, MessageBox, Label, RebindScreen, theme } from '../../src/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * The interface layer, exercised.
 *
 * Windows stack, only the top one takes the keyboard, and the world underneath dims. The
 * inventory is a ListView with icons and disabled rows; the conversation is a MessageBox
 * that reveals text and ends on a choice.
 */

const TILES = 'tiles.png';
const { tiles, tileSize } = tileset;

class InterfaceScene extends Scene {
	private windows = new WindowStack();
	private sheet!: SpriteSheet;
	private status!: Label;

	override create(): void {
		this.sheet = SpriteSheet.grid(TILES, tileSize);

		this.drawBackdrop();

		this.status = new Label({ color: theme().color.textDim });
		this.status.x = 12;
		this.status.y = 12;
		this.stage.addChild(this.status);

		this.stage.addChild(this.windows);
		this.updateStatus();

		//the map layer listens too, but the stack is in stack mode, so an open window is
		//always offered the action first and can swallow it
		Input.onAction.add((action) => {
			if (this.windows.blocksWorld) return false;

			if (action === 'menu') {
				this.openInventory();
				return true;
			}
			if (action === 'confirm') {
				this.openConversation();
				return true;
			}
			if (action === 'wait') {
				this.openRebind();
				return true;
			}
			return false;
		});
	}

	/** something behind the windows, so the dimming layer has an effect to see */
	private drawBackdrop(): void {
		const layer = new Container();
		const options = [tiles.FLOOR, tiles.FLOOR_WORN, tiles.WALL, tiles.GRASS, tiles.WATER];

		for (let y = 0; y < 24; y++) {
			for (let x = 0; x < 40; x++) {
				const sprite = new TintedSprite(this.sheet.get(options[(x * 7 + y * 3) % options.length]));
				sprite.x = x * tileSize * 2;
				sprite.y = y * tileSize * 2;
				sprite.scale.set(2);
				layer.addChild(sprite);
			}
		}

		this.stage.addChild(layer);
	}

	private updateStatus(): void {
		this.status.setText(
			this.windows.isEmpty
				? 'Enter to talk to someone      Tab to open the bag      . to rebind keys'
				: `Escape to close   (${this.windows.depth} window${this.windows.depth > 1 ? 's' : ''} open)`
		);
	}

	private openRebind(): void {
		const window = new Window({ width: 260, height: 200, title: 'Controls' });
		const rebind = new RebindScreen({
			width: window.contentWidth,
			height: window.contentHeight,
			actions: ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu'],
		});

		window.content.addChild(rebind);
		window.delegate = rebind;

		this.windows.push(window);
		window.onClose.add(() => {
			this.updateStatus();
			return false;
		});
		this.updateStatus();
	}

	private openInventory(): void {
		const window = new Window({ width: 260, height: 200, title: 'Bag' });

		const icon = (frame: number): Container => {
			const sprite = new TintedSprite(this.sheet.get(frame));
			//icons are sized to the row, whatever the theme's line height is
			sprite.scale.set(0.9);
			return sprite;
		};

		const list = new ListView({
			width: window.contentWidth,
			height: window.contentHeight,
			items: [
				{ text: 'a handful of coins', icon: icon(tiles.COIN), value: 'coins' },
				{ text: 'a rusted key', icon: icon(tiles.DOOR), value: 'key' },
				{ text: 'a flask of green sludge', icon: icon(tiles.BLOB), value: 'sludge' },
				{ text: 'a rat, deceased', icon: icon(tiles.RAT), value: 'rat' },
				{ text: 'something too heavy to lift', disabled: true },
				{ text: 'a river, somehow', icon: icon(tiles.WATER), value: 'river' },
				{ text: 'a tuft of grass', icon: icon(tiles.GRASS), value: 'grass' },
				{ text: 'a loose brick', icon: icon(tiles.WALL), value: 'brick' },
			],
			//choosing a row opens another window on top, which is the point of the stack
			onSelect: (item) => this.confirmDrop(item.text),
		});

		window.content.addChild(list);
		//the list is offered actions first, and only while its window is on top of the stack
		window.delegate = list;

		this.windows.push(window);
		window.onClose.add(() => {
			this.updateStatus();
			return false;
		});
		this.updateStatus();
	}

	private confirmDrop(what: string): void {
		this.windows.push(
			new MessageBox({
				width: 340,
				height: 120,
				pages: [{ speaker: 'You', text: `Drop ${what}? It might be worth keeping.` }],
				choices: [
					{ text: 'Drop it' },
					{ text: 'Keep it' },
					{ text: 'Think about it later', disabled: true },
				],
				onDone: () => this.updateStatus(),
			})
		);
		this.updateStatus();
	}

	private openConversation(): void {
		this.windows.push(
			new MessageBox({
				width: 420,
				height: 140,
				speed: 45,
				pages: [
					{ speaker: 'Shopkeeper', text: 'You again. Back so soon from the lower floors?' },
					{ speaker: 'Shopkeeper', text: 'I heard something moved down there. Something that was not moving before.' },
					{ speaker: 'Shopkeeper', text: 'So. Buying, selling, or just dripping on my floor?' },
				],
				choices: [{ text: 'Buying' }, { text: 'Selling' }, { text: 'Dripping' }],
				onDone: (chosen) => {
					if (chosen !== undefined) this.reply(String(chosen));
					this.updateStatus();
				},
			})
		);
		this.updateStatus();
	}

	private reply(chosen: string): void {
		const lines: Record<string, string> = {
			Buying: 'Then look, and mind the prices. They went up.',
			Selling: 'Let me see it. No, the other one. Yes, that.',
			Dripping: 'As I thought. Out.',
		};

		this.windows.push(
			new MessageBox({
				width: 420,
				height: 110,
				pages: [{ speaker: 'Shopkeeper', text: lines[chosen] ?? '...' }],
				onDone: () => this.updateStatus(),
			})
		);
	}

	override resize(width: number, height: number): void {
		this.windows.setViewport(width, height);
	}

	override update(dt: number): void {
		this.windows.update(dt);
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x14141a,
		extensions: [registerColorTransform],
	});

	await Resources.load([TILES]);

	await game.start(InterfaceScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});
