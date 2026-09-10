import { Game, Scene2D } from '../../src/two-d/index.ts';
import {
	runScenario,
	advanceToInput,
	SimulationRuntime,
	Scheduler,
	type TurnRules,
	type SimulationRuntimeRule,
	type Actor,
} from '../../src/simulation/index.ts';
import { EntityRegistry, PresentationQueue, Generator, type EntityId } from '../../src/core/index.ts';
import { Button, Label, theme } from '../../src/two-d/ui/index.ts';

/**
 * `mwg/simulation` on its own: no sprites, no map, because neither runner touches rendering
 * at all - `runScenario` replays a finite command sequence against a game-owned rule, and
 * `advanceToInput` drives automatic turns until an actor needs a player's own decision. This
 * page exists only to print what each one did; the actual "headless" point is that both work
 * identically with no page at all, in a test or a server, which the other examples cannot
 * show because they are built around a canvas.
 *
 * The third button is the newer, interactive-dispatch half of the same module:
 * `SimulationRuntime` composes a `Scheduler` and a `Generator` behind `dispatch()`, entities
 * are named by `EntityRegistry`-issued ids rather than held by reference, and the resulting
 * events are handed to a `PresentationQueue` - which, on this page with no sprites to
 * animate, just prints each event as its own line the instant it plays.
 */

interface Position {
	x: number;
}

class HeadlessScene extends Scene2D {
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

		const runtimeButton = new Button({
			width: 220,
			height: 30,
			text: 'Dispatch through SimulationRuntime',
			onClick: () => this.demoRuntime(),
		});
		runtimeButton.position.set(20, 100);
		this.stage.addChild(runtimeButton);

		this.log = new Label({ text: '', color: theme().color.textDim, size: 13, wrapWidth: game.width - 40 });
		this.log.position.set(20, 150);
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
		if (result.status === 'input')
			this.print(
				`advanceToInput: stopped for actor ${result.actor}'s own input after ${result.steps} automatic step(s)`,
			);
		else this.print(`advanceToInput: ${result.status} after ${result.steps} step(s)`);
	}

	private demoRuntime(): void {
		interface Fighter extends Actor {
			id: EntityId;
			hp: number;
		}
		type State = { hero: Fighter; rat: Fighter };
		type Event = { type: 'hit'; targetId: EntityId; amount: number };

		const rule: SimulationRuntimeRule<State, 'attack', Event, Fighter> = (state, _command, { random }) => {
			const amount = random.int(3) + 1;
			const rat = { ...state.rat, hp: state.rat.hp - amount };
			return {
				state: { ...state, rat },
				events: [{ type: 'hit', targetId: rat.id, amount }],
				status: rat.hp <= 0 ? 'finished' : 'ready',
				cost: 1,
			};
		};

		//entities are named by registry-issued ids, not held by reference - the id is what
		//an event/save/AI target would carry, never the Fighter object itself
		const registry = new EntityRegistry<Fighter>();
		const hero: Fighter = { id: '', hp: 10 };
		const rat: Fighter = { id: '', hp: 5 };
		hero.id = registry.add(hero);
		rat.id = registry.add(rat);

		const scheduler = new Scheduler<Fighter>();
		scheduler.add(hero);
		scheduler.add(rat);

		const runtime = new SimulationRuntime<State, 'attack', Event, Fighter>({
			state: { hero, rat },
			scheduler,
			random: new Generator(),
			rule,
			actorId: (fighter) => registry.idOf(fighter) ?? fighter.id,
		});

		//no sprites here, so play() just prints - a real scene would start a tween/sound and
		//return its duration instead, which is the only thing that would differ
		const presentation = new PresentationQueue<Event>({
			play: (event) => {
				this.print(`  ${event.targetId} takes ${event.amount} damage`);
			},
		});

		this.print('SimulationRuntime: hero attacks until the rat falls');
		while (runtime.state.rat.hp > 0) {
			const outcome = runtime.dispatch('attack');
			presentation.enqueue(outcome.events);
		}
		this.print(`  rat defeated, hero still at ${runtime.state.hero.hp} hp`);
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
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
