import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Node2D, Shape2D, Text2D } from '../../src/two-d/render/index.ts';
import { Button, Label, RadioGroup } from '../../src/two-d/ui/index.ts';
import { Input, Generator } from '../../src/core/index.ts';
import type { NeuralModel } from '../../src/ai/index.ts';
import { MazeControllers } from './controllers.ts';
import type { GhostMode, PlayerMode } from './controllers.ts';
import { createMazeGame } from './game.ts';
import model from './generated/model.json' with { type: 'json' };

const BG = 0x0d1529;
const GOLD = 0xffdb62;
const GHOSTS = [0xff7b8d, 0x75dec6, 0xbea2ff, 0xffb26d];
const PLAYER_MODES: PlayerMode[] = ['human', 'random', 'heuristic', 'neural'];
const GHOST_MODES: GhostMode[] = ['random', 'chase', 'heuristic', 'neural'];
const DESCRIPTIONS: Record<GhostMode | PlayerMode, string> = {
	human: 'Arrows or WASD steer the player.\nTurns are buffered until a corridor opens.',
	random: 'Seeded random legal turns.\nGhosts avoid reversing in corridors.',
	chase: 'JavaScriptAI chase rules use direct\ndistance, with no path around walls.',
	heuristic: 'HeuristicAI scores maze paths, nearby\nthreats, food and continuing forward.',
	neural: 'A small NeuralPolicy trained offline\nto imitate the path-and-risk heuristic.',
};

class MazeScene extends Scene2D {
	private game = createMazeGame();
	private state = this.game.initial();
	private controllers = new MazeControllers(this.game, model as NeuralModel);
	private playerMode: PlayerMode = 'human';
	private ghostMode: GhostMode = 'chase';
	private playerChoices!: RadioGroup;
	private ghostChoices!: RadioGroup;
	private field = new Node2D();
	private maze = new Shape2D();
	private dots = new Map<number, Shape2D>();
	private actors = [new Shape2D(), ...GHOSTS.map(() => new Shape2D())];
	private panel = new Node2D();
	private hud!: Label;
	private explanation!: Label;
	private message!: Label;
	private pauseButton!: Button;
	private cell = 28;
	private elapsed = 0;
	private readonly tickTime = 0.12;
	private previous = [this.state.player, ...this.state.ghosts.map((ghost) => ghost.square)];
	private queued: number | null = null;
	private paused = false;
	private seed = 395;
	private lastDecisionMs = 0;
	private highScore = 0;
	private simulationRandom = new Generator(0);

	override create(): void {
		Input.bind('mazePause', ['Space']);
		Input.bind('mazeReset', ['KeyR']);
		Input.bind('mazePlayer', ['KeyP']);
		Input.bind('mazeGhost', ['KeyG']);
		this.field.addChild(this.maze);
		for (const square of this.game.floors) {
			const dot = new Shape2D();
			const power = this.state.powers.includes(square);
			dot.circle(0, 0, power ? 0.17 : 0.055).fill(power ? 0xffffff : 0xd4dbe7);
			dot.position.set((square % this.game.width) + 0.5, Math.floor(square / this.game.width) + 0.5);
			this.dots.set(square, dot);
			this.field.addChild(dot);
		}
		this.field.addChild(...this.actors);
		this.stage.addChild(this.field, this.panel);
		const title = new Text2D({
			text: 'Maze chase',
			style: { fontFamily: 'Trebuchet MS, sans-serif', fontSize: 34, fontWeight: 'bold', fill: GOLD },
		});
		const subtitle = new Label({ text: 'A Pac-Man-style AI lab', size: 15, color: 0xa6b9d7 });
		subtitle.y = 44;
		this.hud = new Label({ text: '', size: 16, color: 0xffffff });
		this.hud.y = 78;
		const playerLabel = new Label({ text: 'Player controller (P)', size: 16, color: GOLD });
		playerLabel.y = 145;
		this.playerChoices = new RadioGroup({
			size: 18,
			gap: 7,
			options: [{ text: 'Human' }, { text: 'Random' }, { text: 'Path heuristic' }, { text: 'Neural, trained' }],
			selected: 0,
		});
		this.playerChoices.y = 174;
		this.playerChoices.onChange.add((index) => {
			this.playerMode = PLAYER_MODES[index];
			this.queued = null;
			this.explain();
		});
		const ghostLabel = new Label({ text: 'Ghost controller (G)', size: 16, color: 0xb4deed });
		ghostLabel.y = 145;
		this.ghostChoices = new RadioGroup({
			size: 18,
			gap: 7,
			options: [
				{ text: 'Random' },
				{ text: 'Chase rules' },
				{ text: 'Path heuristic' },
				{ text: 'Neural, trained' },
			],
			selected: 1,
		});
		this.ghostChoices.y = 174;
		this.ghostChoices.onChange.add((index) => {
			this.ghostMode = GHOST_MODES[index];
			this.explain();
		});
		ghostLabel.x = 195;
		this.ghostChoices.x = 195;
		this.explanation = new Label({ text: '', size: 13, color: 0xa6b9d7, wrapWidth: 390 });
		this.explanation.y = 286;
		this.pauseButton = new Button({
			width: 182,
			height: 36,
			text: 'Pause (Space)',
			onClick: () => this.togglePause(),
		});
		this.pauseButton.y = 377;
		const restart = new Button({ width: 182, height: 36, text: 'New game (R)', onClick: () => this.reset() });
		restart.position.set(195, 377);
		this.message = new Label({ text: '', size: 14, color: GOLD, wrapWidth: 380 });
		this.message.y = 429;
		const directions = ['↑', '→', '↓', '←'];
		for (let i = 0; i < 4; i++) {
			const direction = i;
			const button = new Button({
				width: 46,
				height: 40,
				text: directions[i],
				onPress: () => {
					this.queued = direction;
				},
				onClick: () => {
					this.queued = direction;
				},
			});
			button.position.set(i * 55, 500);
			this.panel.addChild(button);
		}
		const hint = new Label({
			text: 'Arrows / WASD move. Eat all dots to win.\nLarge dots let you eat ghosts for 7 seconds.\nSwitch AI at any time, without restarting.',
			size: 13,
			color: 0xa6b9d7,
			wrapWidth: 390,
		});
		hint.y = 552;
		this.panel.addChild(
			title,
			subtitle,
			this.hud,
			playerLabel,
			this.playerChoices,
			ghostLabel,
			this.ghostChoices,
			this.explanation,
			this.pauseButton,
			restart,
			this.message,
			hint,
		);
		this.drawGhosts();
		this.explain();
		this.resize(Game.current.width, Game.current.height);
		this.updateHud();
	}

	override resize(width: number, height: number): void {
		if (!this.hud) return;
		const wide = width >= 740;
		const scale = wide ? Math.min(1, width / 1000) : Math.min(0.8, (width - 48) / 390);
		this.cell = Math.max(
			5,
			Math.min(
				34,
				wide ? (width - 80 - 390 * scale) / this.game.width : (width - 40) / this.game.width,
				wide ? (height - 50) / this.game.height : (height - 70 - 610 * scale) / this.game.height,
			),
		);
		this.field.scale.set(this.cell);
		this.field.position.set(20, 20);
		this.panel.scale.set(scale);
		if (wide) this.panel.position.set(this.game.width * this.cell + 52, 30);
		else this.panel.position.set(24, this.game.height * this.cell + 40);
		this.maze.clear();
		for (let y = 0; y < this.game.height; y++)
			for (let x = 0; x < this.game.width; x++) {
				if (!this.game.floors.has(y * this.game.width + x))
					this.maze
						.roundRect(x + 0.05, y + 0.05, 0.9, 0.9, 0.13)
						.fill(0x172b50)
						.stroke({ color: 0x407bb5, width: 0.035 });
			}
		this.renderActors(1);
	}

	override update(dt: number): void {
		if (Input.justPressed('mazePause')) this.togglePause();
		if (Input.justPressed('mazeReset')) this.reset();
		if (Input.justPressed('mazePlayer')) this.playerChoices.move(1);
		if (Input.justPressed('mazeGhost')) this.ghostChoices.move(1);
		if (this.playerMode === 'human')
			for (const [direction, action] of ['up', 'right', 'down', 'left'].entries())
				if (Input.justPressed(action) || Input.isDown(action)) this.queued = direction;
		if (!this.paused && this.state.status === 'playing') {
			this.elapsed += dt;
			//A delayed frame advances bounded work; the game never catches up in an unbounded loop.
			if (this.elapsed >= this.tickTime) {
				this.elapsed %= this.tickTime;
				this.advance();
			}
		}
		this.renderActors(this.state.status === 'playing' ? Math.min(1, this.elapsed / this.tickTime) : 1);
	}

	private advance(): void {
		this.previous = [this.state.player, ...this.state.ghosts.map((ghost) => ghost.square)];
		const start = performance.now();
		const player = this.playerMode === 'human' ? this.queued : this.controllers.choose(this.state, this.playerMode);
		const ghosts = this.state.ghosts.map((_ghost, index) =>
			this.controllers.choose(this.state, this.ghostMode, index),
		);
		this.lastDecisionMs = performance.now() - start;
		const outcome = this.game.rule(this.state, { player, ghosts }, this.simulationRandom);
		if (this.playerMode === 'human' && player === this.state.direction) this.queued = null;
		if (outcome.events.includes('death'))
			this.previous = [this.state.player, ...this.state.ghosts.map((ghost) => ghost.square)];
		const dots = new Set(this.state.dots);
		for (const [square, dot] of this.dots) dot.visible = dots.has(square);
		this.highScore = Math.max(this.highScore, this.state.score);
		this.drawGhosts();
		this.updateHud();
	}

	private drawGhosts(): void {
		for (let i = 0; i < this.state.ghosts.length; i++) {
			const ghost = this.state.ghosts[i];
			const shape = this.actors[i + 1];
			const color = ghost.sleep ? 0x75839b : this.state.powered ? 0x6885ee : GHOSTS[i];
			shape.clear().roundRect(-0.31, -0.35, 0.62, 0.64, 0.24).fill(color);
			shape
				.poly([-0.31, 0.16, -0.31, 0.35, -0.16, 0.24, 0, 0.35, 0.16, 0.24, 0.31, 0.35, 0.31, 0.16])
				.fill(color);
			shape.ellipse(-0.12, -0.08, 0.09, 0.12).fill(0xffffff).ellipse(0.12, -0.08, 0.09, 0.12).fill(0xffffff);
			const [dx, dy] = [
				[0, -0.035],
				[0.035, 0],
				[0, 0.035],
				[-0.035, 0],
			][ghost.direction];
			shape
				.circle(-0.12 + dx, -0.08 + dy, 0.045)
				.fill(BG)
				.circle(0.12 + dx, -0.08 + dy, 0.045)
				.fill(BG);
		}
	}

	private renderActors(fraction: number): void {
		const squares = [this.state.player, ...this.state.ghosts.map((ghost) => ghost.square)];
		for (let i = 0; i < squares.length; i++) {
			const previous = this.previous[i],
				next = squares[i];
			const teleport =
				Math.abs((previous % this.game.width) - (next % this.game.width)) +
					Math.abs(Math.floor(previous / this.game.width) - Math.floor(next / this.game.width)) >
				1;
			const t = teleport ? 1 : fraction;
			this.actors[i].position.set(
				(previous % this.game.width) * (1 - t) + (next % this.game.width) * t + 0.5,
				Math.floor(previous / this.game.width) * (1 - t) + Math.floor(next / this.game.width) * t + 0.5,
			);
		}
		const player = this.actors[0];
		const mouth = 0.15 + 0.3 * Math.abs(Math.sin(this.state.tick + fraction * Math.PI));
		player
			.clear()
			.circle(0, 0, 0.37)
			.fill(GOLD)
			.poly([
				0,
				0,
				0.42 * Math.cos(mouth),
				-0.42 * Math.sin(mouth),
				0.42 * Math.cos(mouth),
				0.42 * Math.sin(mouth),
			])
			.fill(BG);
		player.rotation = ((this.state.direction - 1) * Math.PI) / 2;
		player.alpha = this.state.grace && this.state.tick % 2 ? 0.4 : 1;
	}

	private explain(): void {
		this.explanation.setText(`Player: ${DESCRIPTIONS[this.playerMode]}\n\nGhosts: ${DESCRIPTIONS[this.ghostMode]}`);
	}

	private togglePause(): void {
		this.paused = !this.paused;
		this.pauseButton.setText(this.paused ? 'Resume (Space)' : 'Pause (Space)');
		this.updateHud();
	}

	private reset(): void {
		this.state = this.game.initial(new Generator(++this.seed));
		this.controllers = new MazeControllers(this.game, model as NeuralModel, this.seed);
		this.previous = [this.state.player, ...this.state.ghosts.map((ghost) => ghost.square)];
		this.elapsed = 0;
		this.queued = null;
		this.paused = false;
		this.pauseButton.setText('Pause (Space)');
		for (const [square, dot] of this.dots) dot.visible = this.state.dots.includes(square);
		this.drawGhosts();
		this.updateHud();
		this.renderActors(1);
	}

	private updateHud(): void {
		this.hud.setText(
			`Score ${this.state.score}    Best ${this.highScore}\nLives ${'●'.repeat(this.state.lives)}    Dots ${this.state.dots.length}\nAI decision ${this.lastDecisionMs.toFixed(2)} ms/tick`,
		);
		this.message.setText(
			this.state.status === 'won'
				? 'Maze cleared! Press R for another game.'
				: this.state.status === 'lost'
					? 'Game over. Press R to try another AI.'
					: this.paused
						? 'Paused. AI selectors remain active.'
						: this.state.powered
							? `Ghosts are edible for ${(this.state.powered * this.tickTime).toFixed(1)}s.`
							: 'Collect dots. Avoid ghosts. Large dots turn the tables.',
		);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: BG });
	await game.start(MazeScene);
}
main().catch((error) => console.error(error));
