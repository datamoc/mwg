import { Game, Scene } from '../../src/core/index.ts';
import { runScenario, advanceToInput, type TurnRules } from '../../src/simulation/index.ts';
import { Button, Label, theme } from '../../src/ui/index.ts';

/**
 * `mwg/simulation` on its own: no sprites, no map, because neither runner touches rendering
 * at all - `runScenario` replays a finite command sequence against a game-owned rule, and
 * `advanceToInput` drives automatic turns until an actor needs a player's own decision. This
 * page exists only to print what each one did; the actual "headless" point is that both work
 * identically with no page at all, in a test or a server, which the other examples cannot
 * show because they are built around a canvas.
 */

interface Position {
	x: number;
}

class HeadlessScene extends Scene {
	private log!: Label;
	private lines: string[] = [];

	override create(): void {
		const game = Game.current;

		const runScenarioButton = new Button({
			width: 220,
			height: 30,
			text: 'Run a command scenario',
			onClick: () => this.demoScenario(),
		});
		runScenarioButton.position.set(20, 20);
		this.stage.addChild(runScenarioButton);

		const advanceButton = new Button({
			width: 220,
			height: 30,
			text: 'Advance turns to next input',
			onClick: () => this.demoTurns(),
		});
		advanceButton.position.set(20, 60);
		this.stage.addChild(advanceButton);

		this.log = new Label({ text: '', color: theme().color.textDim, size: 13, wrapWidth: game.width - 40 });
		this.log.position.set(20, 110);
		this.stage.addChild(this.log);
		this.print('Click a button to run one of the two headless runners.');
	}

	private demoScenario(): void {
		const result = runScenario<Position, number, string, null>({
			state: { x: 0 },
			commands: [3, -1, 5, -2],
			random: null,
			step: (state, distance) => ({
				state: { x: state.x + distance },
				events: [`moved ${distance >= 0 ? '+' : ''}${distance} -> x=${state.x + distance}`],
				status: 'ready',
			}),
		});
		this.print(`runScenario: processed ${result.processedCommands} commands, ended at x=${result.state.x}`);
		for (const event of result.events) this.print(`  ${event}`);
	}

	private demoTurns(): void {
		//three actors, round-robin; actor 0 is the "player" and always needs input, 1 and 2
		//act automatically - advanceToInput stops the instant it reaches actor 0's turn
		const order = [0, 1, 2];
		let cursor = 0;
		const rules: TurnRules<number> = {
			scheduler: {
				peek: () => order[cursor],
				spend: () => {
					cursor = (cursor + 1) % order.length;
				},
			},
			finished: () => false,
			needsInput: (actor) => actor === 0,
			act: (actor) => {
				this.print(`  actor ${actor} acts automatically`);
				return 1;
			},
		};

		const result = advanceToInput(rules, 10);
		if (result.status === 'input') this.print(`advanceToInput: stopped for actor ${result.actor}'s own input after ${result.steps} automatic step(s)`);
		else this.print(`advanceToInput: ${result.status} after ${result.steps} step(s)`);
	}

	private print(line: string): void {
		this.lines.push(line);
		if (this.lines.length > 12) this.lines.shift();
		this.log.setText(this.lines.join('\n'));
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(HeadlessScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
