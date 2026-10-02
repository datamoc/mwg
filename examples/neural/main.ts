import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Shape2D, Node2D } from '../../src/two-d/render/index.ts';
import { Button, Label } from '../../src/two-d/ui/index.ts';
import { Input } from '../../src/core/index.ts';
import { NeuralPolicy } from '../../src/ai/index.ts';
import type { NeuralModel } from '../../src/ai/index.ts';
import { TrainingEnvironment, runRolloutsAsync } from '../../src/simulation/index.ts';
import { courierEnvironment } from './environment.ts';
import model from './generated/model.json' with { type: 'json' };

const config = { agents: 8, size: 8, horizon: 256 };
const COLORS = [0xffc857, 0x73d6c8, 0xff938c, 0xa7b8ff, 0xf2a9df, 0x9bdf96, 0xe9ded0, 0x78c5fa];

class CourierScene extends Scene2D {
	private environment = courierEnvironment({ TrainingEnvironment }, config);
	private policy = new NeuralPolicy(model as NeuralModel);
	private frame = this.environment.reset(1001);
	private field = new Node2D();
	private markers: Shape2D[] = [];
	private targets: Shape2D[] = [];
	private info!: Label;
	private controls = new Node2D();
	private work!: Button;
	private elapsed = 0;
	private seed = 1001;
	private abort: AbortController | null = null;
	private generation = 0;
	private report = 'Weights learned by the UI-free training example.';
	private cell = 48;
	private paused = false;
	private manualAction: number | null = null;

	override create(): void {
		this.stage.addChild(this.field, this.controls);
		for (let i = 0; i < config.agents; i++) {
			const target = new Shape2D();
			const marker = new Shape2D();
			this.targets.push(target);
			this.markers.push(marker);
		}
		const title = new Label({ text: 'Trained couriers', size: 30, color: 0xf7eee3 });
		const help = new Label({
			text: 'Eight couriers share one learned policy.\nColored rings are delivery destinations.\nArrows steer the gold courier for one tick.\nClick the board to redirect its destination.',
			size: 16,
			color: 0xb6cbd8,
			wrapWidth: 390,
		});
		help.y = 50;
		this.work = new Button({
			width: 320,
			height: 38,
			text: 'Run 256 episodes on workers',
			onClick: () => void this.backgroundRollouts(),
		});
		this.work.y = 160;
		const pause = new Button({
			width: 150,
			height: 36,
			text: 'Pause / resume',
			onClick: () => {
				this.paused = !this.paused;
			},
		});
		pause.y = 210;
		const reset = new Button({ width: 150, height: 36, text: 'New routes', onClick: () => this.reset() });
		reset.position.set(170, 210);
		this.info = new Label({ text: '', size: 16, color: 0xf7eee3, wrapWidth: 390 });
		this.info.y = 276;
		this.controls.addChild(title, help, this.work, pause, reset, this.info);
		this.resize(Game.current.width, Game.current.height);
		this.draw();
	}

	override resize(width: number, height: number): void {
		if (!this.info) return;
		const wide = width >= 960;
		const available = wide ? Math.min(width - 460, height - 80) : Math.min(width - 40, height - 480);
		this.cell = Math.max(16, Math.min(62, available / config.size));
		this.field.position.set(28, 32);
		this.controls.position.set(wide ? this.cell * config.size + 64 : 28, wide ? 42 : this.cell * config.size + 60);
		this.field.removeChildren().forEach((child) => {
			if (!this.markers.includes(child as Shape2D) && !this.targets.includes(child as Shape2D)) child.destroy();
		});
		const grid = new Shape2D();
		for (let y = 0; y < config.size; y++)
			for (let x = 0; x < config.size; x++)
				grid.rect(x * this.cell, y * this.cell, this.cell - 2, this.cell - 2).fill(
					(x + y) % 2 ? 0x253b4b : 0x2b4353,
				);
		grid.eventMode = 'static';
		grid.on('pointertap', (event) => {
			const local = this.field.toLocal(event.global);
			const x = Math.floor(local.x / this.cell),
				y = Math.floor(local.y / this.cell);
			if (x < 0 || y < 0 || x >= config.size || y >= config.size) return;
			const snapshot = this.environment.snapshot();
			snapshot.state.agents[0].targetX = x;
			snapshot.state.agents[0].targetY = y;
			this.frame = this.environment.restore(snapshot);
			this.draw();
		});
		this.field.addChild(grid, ...this.targets, ...this.markers);
		for (let i = 0; i < config.agents; i++) {
			this.targets[i]
				.clear()
				.circle(0, 0, this.cell * 0.3)
				.stroke({ color: COLORS[i], width: 2 });
			this.markers[i]
				.clear()
				.rect(-this.cell * 0.17, -this.cell * 0.17, this.cell * 0.34, this.cell * 0.34)
				.fill(COLORS[i]);
			this.targets[i].eventMode = 'none';
			this.markers[i].eventMode = 'none';
		}
		this.draw();
	}

	override update(dt: number): void {
		for (const [i, action] of ['left', 'right', 'up', 'down'].entries())
			if (Input.justPressed(action)) this.manualAction = i;
		if (this.paused) return;
		this.elapsed += dt;
		if (this.elapsed < 0.14) return;
		this.elapsed = 0;
		if (this.frame.terminated || this.frame.truncated) this.frame = this.environment.reset(++this.seed);
		const actions = this.frame.observations.map((observation) => this.policy.selectAction(observation));
		if (this.manualAction !== null && this.frame.observations[0].mask?.[this.manualAction])
			actions[0] = this.manualAction;
		this.manualAction = null;
		this.frame = this.environment.step(actions);
		this.draw();
	}

	private draw(): void {
		const state = this.environment.snapshot().state;
		for (let i = 0; i < state.agents.length; i++) {
			const agent = state.agents[i];
			this.markers[i].position.set((agent.x + 0.5) * this.cell, (agent.y + 0.5) * this.cell);
			this.targets[i].position.set((agent.targetX + 0.5) * this.cell, (agent.targetY + 0.5) * this.cell);
		}
		this.info.setText(
			`Route seed ${this.seed}\nTick ${state.tick}/${config.horizon}\nDeliveries ${state.agents.reduce((sum, agent) => sum + agent.deliveries, 0)}\n\n${this.report}`,
		);
	}

	private reset(): void {
		this.generation++;
		this.abort?.abort();
		this.abort = null;
		this.work.setText('Run 256 episodes on workers');
		this.frame = this.environment.reset(++this.seed);
		this.report = 'New routes. Background work cancelled.';
		this.draw();
	}

	async backgroundRollouts(): Promise<void> {
		if (this.abort) {
			this.abort.abort();
			return;
		}
		const id = ++this.generation;
		const abort = new AbortController();
		this.abort = abort;
		this.work.setText('Cancel background episodes');
		this.report = '256 episodes running on four workers.\nKeep steering or changing routes.';
		this.draw();
		const start = performance.now();
		try {
			const episodes = await runRolloutsAsync(courierEnvironment, config, this.policy.exportModel(), {
				seeds: Array.from({ length: 256 }, (_, i) => i + 1),
				jobs: 4,
				signal: abort.signal,
			});
			if (id !== this.generation) return;
			const seconds = (performance.now() - start) / 1000;
			this.report = `${episodes.length} episodes in ${seconds.toFixed(2)}s\n${Math.round(episodes.reduce((sum, episode) => sum + episode.steps, 0) / seconds).toLocaleString()} simulation steps/s`;
		} catch (error) {
			if (id !== this.generation) return;
			this.report = abort.signal.aborted ? 'Background episodes cancelled.' : `Worker error: ${String(error)}`;
		} finally {
			if (id === this.generation) {
				this.abort = null;
				this.work.setText('Run 256 episodes on workers');
				this.draw();
			}
		}
	}

	override destroy(): void {
		this.generation++;
		this.abort?.abort();
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x14212c });
	await game.start(CourierScene);
}
main().catch((error) => {
	console.error(error);
});
