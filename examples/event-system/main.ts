import { Game, Scene } from '../../src/core/index.ts';
import { GameState, activePage, EventRunner, type MapEvent } from '../../src/rpg/index.ts';
import { StatBlock, Inventory, EquipmentSlots, type InventoryItem, type EquippableItem } from '../../src/actors/index.ts';
import { Button, Label, WindowStack, theme } from '../../src/ui/index.ts';

/**
 * `mwg/rpg`'s data-driven event model - `GameState` (switches/variables), `activePage` (the
 * last page whose conditions all hold wins, the same convention `village` uses for its
 * shopkeeper), and `EventRunner` interpreting a page's commands - paired with `mwg/actors`'
 * `Inventory`/`EquipmentSlots`: talking to the stranger enough times runs a `call` command
 * that hands over a real item, which goes straight into an `Inventory` and gets equipped,
 * changing `attack` on screen. `call` is exactly the escape hatch for this: `EventRunner`'s
 * built-in commands (`setSwitch`/`addVariable`/`if`) only ever read `GameState`, with no way
 * to reach a system as unrelated to dialogue as an inventory - the same gap examples/village's
 * own potion choice ran into before `call` fixed it there too.
 *
 * No map, no `GridMover`, no NPC sprite - a button click stands in for "the player triggered
 * this event" so the event model itself is what is on screen.
 */

type Slot = 'weapon';
interface Item extends InventoryItem, EquippableItem {
	name: string;
}

const GIFT: Item = { id: 'dagger', name: 'a small dagger', quantity: 1, modifiers: [{ stat: 'attack', op: 'add', value: 2 }] };

const EVENT: MapEvent = {
	id: 'stranger',
	x: 0,
	y: 0,
	pages: [
		{
			trigger: 'action',
			commands: [
				{ setSwitch: 'metStranger', value: true },
				{ addVariable: 'timesMet', amount: 1 },
				{ say: 'A stranger nods at you. "Never seen you before."' },
			],
		},
		{
			trigger: 'action',
			conditions: [{ switch: 'metStranger', equals: true }],
			commands: [
				{ addVariable: 'timesMet', amount: 1 },
				{ say: '"Back again? I don\'t have much to say."' },
			],
		},
		{
			trigger: 'action',
			//the last page whose conditions all hold wins - this overrides the plain
			//"back again" page once timesMet crosses the threshold
			conditions: [{ switch: 'metStranger', equals: true }, { variable: 'timesMet', atLeast: 3 }],
			commands: [
				{ addVariable: 'timesMet', amount: 1 },
				{ setSwitch: 'friendly', value: true },
				{ say: `"You keep coming back. Friend, take this: ${GIFT.name}."` },
				//call reaches outside GameState entirely - the inventory and equipment slots
				//below know nothing about switches or variables, and never need to
				{ call: () => grantGift() },
			],
		},
	],
};

const state = new GameState();
const stats = new StatBlock({ base: { strength: 5 }, derived: [{ name: 'attack', from: (s) => s.strength }] });
const inventory = new Inventory();
const equipment = new EquipmentSlots<Slot, Item>(['weapon'], stats);

function grantGift(): void {
	inventory.add(GIFT);
	equipment.equip('weapon', GIFT);
}

class EventSystemScene extends Scene {
	private windows = new WindowStack();
	private runner: EventRunner | null = null;
	private status!: Label;

	override create(): void {
		this.stage.addChild(this.windows);

		const game = Game.current;
		const talk = new Button({
			width: 160,
			height: 32,
			text: 'Talk to stranger',
			onClick: () => this.talk(),
		});
		talk.position.set(game.width / 2 - 80, game.height / 2 - 16);
		this.stage.addChild(talk);

		this.status = new Label({ color: theme().color.textDim, size: 13, align: 'center', wrapWidth: 360 });
		this.status.anchor.set(0.5, 0);
		this.status.position.set(game.width / 2, game.height / 2 + 40);
		this.stage.addChild(this.status);
		this.refreshStatus();
	}

	private async talk(): Promise<void> {
		if (this.runner) return;
		const page = activePage(EVENT, state);
		if (!page) return;

		this.runner = new EventRunner({ windows: this.windows, game: state });
		await this.runner.run(page.commands);
		this.runner = null;
		this.refreshStatus();
	}

	private refreshStatus(): void {
		const weapon = equipment.get('weapon')?.name ?? '(none)';
		this.status.setText(
			`metStranger: ${state.switch('metStranger')}    friendly: ${state.switch('friendly')}    timesMet: ${state.variable('timesMet')}\n` +
				`attack: ${stats.get('attack')}    weapon: ${weapon}    inventory: ${inventory.items.length} item(s)\n` +
				'keep talking to unlock the friendly page at timesMet >= 3'
		);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(EventSystemScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
