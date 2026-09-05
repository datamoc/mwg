import { Game, Scene } from '../../src/core/index.ts';
import { SaveSystem } from '../../src/core/Save.ts';
import { Button, Label, theme } from '../../src/ui/index.ts';

/**
 * `core.SaveSystem` on its own: one `state` shape (a score), `save`/`load`/`delete`, and
 * `list()` reading back every slot's own preview and version - none of `dungeon`'s
 * permadeath wiring or its autosave-on-descend policy, just the primitive underneath both.
 */

interface GameState {
	score: number;
}

class SaveLoadScene extends Scene {
	private saves = new SaveSystem<GameState>({ namespace: 'save-load-example', version: 1 });
	private state: GameState = { score: 0 };
	private status!: Label;

	override create(): void {
		const game = Game.current;
		const centerX = game.width / 2;

		const scoreLabel = new Label({ text: '', color: theme().color.text, size: 22, align: 'center' });
		scoreLabel.anchor.set(0.5);
		scoreLabel.position.set(centerX, 60);
		this.stage.addChild(scoreLabel);
		this.refreshScoreLabel(scoreLabel);

		const row = (index: number): number => 120 + index * 40;

		const addPoint = new Button({
			width: 200,
			height: 30,
			text: '+1 point',
			onClick: () => {
				this.state.score += 1;
				this.refreshScoreLabel(scoreLabel);
			},
		});
		addPoint.position.set(centerX - 100, row(0));
		this.stage.addChild(addPoint);

		const save = new Button({
			width: 200,
			height: 30,
			text: 'Save to "slot1"',
			onClick: () => {
				this.saves.save('slot1', this.state, `score ${this.state.score}`);
				this.refreshStatus();
			},
		});
		save.position.set(centerX - 100, row(1));
		this.stage.addChild(save);

		const load = new Button({
			width: 200,
			height: 30,
			text: 'Load "slot1"',
			onClick: () => {
				const loaded = this.saves.load('slot1');
				if (loaded) {
					this.state = loaded.state;
					this.refreshScoreLabel(scoreLabel);
				}
				this.refreshStatus();
			},
		});
		load.position.set(centerX - 100, row(2));
		this.stage.addChild(load);

		const remove = new Button({
			width: 200,
			height: 30,
			text: 'Delete "slot1"',
			onClick: () => {
				this.saves.delete('slot1');
				this.refreshStatus();
			},
		});
		remove.position.set(centerX - 100, row(3));
		this.stage.addChild(remove);

		this.status = new Label({ text: '', color: theme().color.textDim, size: 13, align: 'center', wrapWidth: 360 });
		this.status.anchor.set(0.5, 0);
		this.status.position.set(centerX, row(4) + 20);
		this.stage.addChild(this.status);
		this.refreshStatus();
	}

	private refreshScoreLabel(label: Label): void {
		label.setText(`score: ${this.state.score}`);
	}

	private refreshStatus(): void {
		const slots = this.saves.list();
		this.status.setText(
			slots.length === 0
				? 'no slots saved yet'
				: slots.map((entry) => `${entry.slot}: v${entry.meta.version}, "${entry.meta.preview}"`).join('\n')
		);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(SaveLoadScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
