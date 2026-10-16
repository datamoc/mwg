import { Container } from '../../src/two-d/pixi-interop.ts';
import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Shape2D } from '../../src/two-d/render/index.ts';
import { Button, Label, highContrastTheme, setTheme, theme, themeChanged } from '../../src/two-d/ui/index.ts';
import {
	Input,
	Player,
	Recorder,
	SaveSystem,
	Signal,
	deserializeReplay,
	motionDuration,
	serializeReplay,
} from '../../src/core/index.ts';
import {
	Crossing,
	LEVELS,
	applyAction,
	beamProblem,
	describe,
	isBetter,
	ratioColour,
	totalCost,
	warrenBeams,
	type Beam,
	type CrossingResult,
} from './sim.ts';

/**
 * The bridge game: drag from joint to joint to place beams, press Run, and a vehicle drives over.
 * Each beam is coloured by its link's `ratio` (green idle, red about to break). What the player
 * does is a list of action strings, so a `Recorder` captures it and a `Player` replays it into
 * an identical result: the simulation has no randomness.
 */

const WIDTH = 800;
const HEIGHT = 450;
const GROUND = 0x3d3a33;
const saves = new SaveSystem<{ cost: number; sag: number }>({ namespace: 'bridge', version: 1 });

class BridgeScene extends Scene2D {
	private levelIndex = 0;
	private level = LEVELS[0];
	private beams: readonly Beam[] = [];
	private crossing = new Crossing(this.level, []);
	private running = false;
	private failed = false;
	private cables = false;
	private from: number | null = null;
	private cursor = { x: 0, y: 0 };
	private breaks: { x: number; y: number }[] = [];
	private owed = 0;

	//what the player does, and the clock a replay is stamped with: one tick per action
	private readonly actions = new Signal<string>();
	private readonly ticks = new Signal<number>();
	private recorder = new Recorder(this.actions, this.ticks);
	private runs: CrossingResult[] = [];
	private player: Player | null = null;
	private readonly replayClock = new Signal<number>();
	private replayAt = 0;
	private replayRun = 0;

	private readonly world = new Container();
	private readonly gfx = new Shape2D();
	//the sky is the design rectangle, not an oversized one: the stage's bounds are what a screenshot or a
	//smoke test extracts, and a software renderer cannot extract a texture thousands of pixels wide
	private readonly sky = new Shape2D();
	private labels = {} as Record<'title' | 'budget' | 'message' | 'best', Label>;
	private message = { text: '', age: 0 };
	private cableButton!: Button;

	override create(): void {
		this.sky.rect(0, 0, WIDTH, HEIGHT).fill(0x101820);
		this.stage.addChild(this.sky);
		this.stage.addChild(this.world);
		this.world.addChild(this.gfx);
		Object.entries({ title: 10, budget: 36, message: 62, best: 88 }).forEach(([key, y]) => {
			const label = new Label({ text: ' ', size: key === 'title' ? 18 : 14 });
			label.position.set(16, y);
			this.labels[key as keyof typeof this.labels] = label;
			this.stage.addChild(label);
		});
		themeChanged.add(() => this.paintLabels());

		const buttons: [string, () => void][] = [
			['Run', () => this.dispatch('run')],
			['Clear', () => this.dispatch('clear')],
			['Truss', () => warrenBeams(this.level).forEach(([a, b]) => this.dispatch(`beam:${a}:${b}`))],
			['Replay', () => this.replay()],
			['Level', () => this.load((this.levelIndex + 1) % LEVELS.length)],
			['Beams', () => this.toggleCables()],
			['Contrast', () => setTheme(theme() === highContrastTheme ? {} : highContrastTheme)],
		];
		buttons.forEach(([text, onClick], i) => {
			const button = new Button({ width: 100, height: 30, text, onClick });
			button.position.set(16 + i * 108, 404);
			this.stage.addChild(button);
			if (text === 'Beams') this.cableButton = button;
		});

		//pointer positions arrive in CSS pixels; the stage is scaled and centred, the bridge offset inside it
		const toWorld = (x: number, y: number): { x: number; y: number } => ({
			x: (x - this.stage.x) / this.stage.scale.x - this.world.x,
			y: (y - this.stage.y) / this.stage.scale.y - this.world.y,
		});
		const pointer = Input.attachPointer(Game.current.app.canvas, { toWorld });
		pointer.down.add((p) => {
			this.from = this.jointAt(p.worldX, p.worldY);
		});
		pointer.move.add((p) => {
			this.cursor = { x: p.worldX, y: p.worldY };
		});
		pointer.up.add((p) => this.drop(this.jointAt(p.worldX, p.worldY)));

		this.actions.add((action) => this.perform(action));
		this.load(0);
		this.resize(Game.current.width, Game.current.height);
	}

	override resize(width: number, height: number): void {
		const scale = Math.min(width / WIDTH, height / HEIGHT);
		this.stage.scale.set(scale);
		this.stage.position.set((width - WIDTH * scale) / 2, (height - HEIGHT * scale) / 2);
	}

	/** every change to the build goes through here, so it is recorded and can be replayed */
	private dispatch(action: string): void {
		if (this.running || this.player) return;
		this.actions.dispatch(action);
		this.ticks.dispatch(this.recorder.frame);
	}

	private perform(action: string): void {
		if (action !== 'run') this.beams = applyAction(this.level, this.beams, action);
		this.crossing = new Crossing(this.level, this.beams);
		this.crossing.bridge.world.onBreak.add((spot) => {
			this.breaks.push(spot);
		});
		this.running = action === 'run';
		this.failed = false;
		if (!this.running) this.breaks = [];
		this.say('');
	}

	load(index: number): void {
		this.levelIndex = index;
		this.level = LEVELS[index];
		this.world.position.set((WIDTH - (this.level.deck.length - 1) * 50) / 2, 200);
		this.recorder.stop();
		this.recorder = new Recorder(this.actions, this.ticks);
		this.runs = [];
		this.player?.stop();
		this.player = null;
		this.beams = [];
		this.perform('clear');
	}

	private jointAt(x: number, y: number): number | null {
		const near = this.level.joints.findIndex((joint) => Math.hypot(joint.x - x, joint.y - y) < 16);
		return near < 0 ? null : near;
	}

	private drop(to: number | null): void {
		const from = this.from;
		this.from = null;
		if (from === null || to === null || from === to) return;
		const problem = beamProblem(this.level, this.beams, [from, to]);
		if (problem) this.say(`Cannot place that beam: ${problem}`);
		else this.dispatch(`${this.cables ? 'cable' : 'beam'}:${from}:${to}`);
	}

	/** the pen: rigid beams, or cables, which are cheaper and only ever pull */
	private toggleCables(): void {
		this.cables = !this.cables;
		this.cableButton.setText(this.cables ? 'Cables' : 'Beams');
	}

	private say(text: string): void {
		this.message = { text, age: 0 };
	}

	/** replays the recorded session from an empty bridge, comparing every run with the live one */
	private replay(): void {
		if (this.running || this.runs.length === 0) return;
		const saved = serializeReplay(this.recorder.toJSON());
		this.beams = [];
		this.perform('clear');
		this.replayRun = 0;
		this.player = new Player(deserializeReplay(saved), (action) => this.perform(action), this.replayClock);
	}

	private finish(): void {
		const result = this.crossing.result();
		this.running = false;
		this.failed = !result.crossed;
		if (this.player) {
			const same = JSON.stringify(result) === JSON.stringify(this.runs[this.replayRun++]);
			this.say(
				same ? 'Replay: the result is identical, down to the last decimal.' : 'Replay: the result differs!',
			);
			return;
		}
		this.runs.push(result);
		const best = saves.load(`best-${this.levelIndex}`)?.state;
		if (isBetter(result, best)) saves.save(`best-${this.levelIndex}`, result);
		this.say(describe(this.level, result));
	}

	private paintLabels(): void {
		const { color } = theme();
		const best = saves.load(`best-${this.levelIndex}`)?.state;
		const spent = totalCost(this.level, this.beams);
		this.labels.title.setText(`Level ${this.levelIndex + 1}: ${this.level.name}`);
		this.labels.title.setColor(color.textHighlight);
		this.labels.budget.setText(`Budget ${spent} / ${this.level.budget}  (${this.beams.length} beams)`);
		this.labels.budget.setColor(color.text);
		this.labels.best.setText(best ? `Best: cost ${best.cost}, sag ${best.sag}` : 'Best: none yet');
		this.labels.best.setColor(color.textDim);
		this.labels.message.setText(this.message.text || ' ');
		this.labels.message.setColor(this.failed ? 0xff6a5a : color.textHighlight);
	}

	override update(dt: number): void {
		//the crossing advances in fixed 1/60 s steps, so what is on screen is what `cross` computes
		for (this.owed += dt; this.owed >= 1 / 60; this.owed -= 1 / 60) {
			if (this.running) this.crossing.step();
			if (this.running && this.crossing.done) this.finish();
		}
		//a replay performs one recorded action per tick, and waits while a crossing is running
		if (this.player && !this.running && (this.replayAt += dt) >= 0.3) {
			this.replayAt = 0;
			this.replayClock.dispatch(0);
			if (this.player.done && !this.running) this.player = null;
		}
		//decorative: the message fades in; with reduced motion it simply appears
		this.message.age += dt;
		const fade = motionDuration(0.4);
		this.labels.message.alpha = fade === 0 ? 1 : Math.min(1, this.message.age / fade);
		this.paintLabels();
		this.draw();
	}

	private draw(): void {
		const { level, gfx } = this;
		const { world, links } = this.crossing.bridge;
		const { color } = theme();
		const left = level.joints[0].x;
		const right = level.joints[level.deck[level.deck.length - 1]].x;
		gfx.clear();
		gfx.rect(left, 130, right - left, 70).fill(0x2a5d86);
		gfx.rect(left - 400, 0, 400, 200)
			.fill(GROUND)
			.rect(right, 0, 400, 200)
			.fill(GROUND);
		level.joints.forEach((joint, i) => {
			if (joint.fixed && i !== 0 && i !== level.deck.length - 1) gfx.rect(joint.x - 10, 0, 20, 200).fill(GROUND);
		});
		this.crossing.beams.forEach(([a, b, cable], i) => {
			const link = world.links[links[i]];
			if (link.broken) return;
			const stroke = { color: ratioColour(link.ratio), width: cable ? 2.5 : 5 };
			gfx.moveTo(world.nodes[a].x, world.nodes[a].y).lineTo(world.nodes[b].x, world.nodes[b].y).stroke(stroke);
		});
		for (const spot of this.breaks) gfx.circle(spot.x, spot.y, 8).stroke({ color: 0xff3b30, width: 2 });
		world.nodes.forEach((node) => gfx.circle(node.x, node.y, 5).fill(node.fixed ? 0xcfcfcf : color.text));
		if (this.from !== null) {
			const node = world.nodes[this.from];
			gfx.moveTo(node.x, node.y)
				.lineTo(this.cursor.x, this.cursor.y)
				.stroke({ color: color.textHighlight, width: 2 });
		}
		if (this.running || this.crossing.distance > 0) {
			const car = this.crossing.where();
			gfx.rect(car.x - 14, car.y - 18, 28, 10).fill(0xf0b030);
			gfx.circle(car.x - 8, car.y - 6, 5)
				.fill(0x202020)
				.circle(car.x + 8, car.y - 6, 5)
				.fill(0x202020);
		}
	}
}

const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101820 });
game.start(BridgeScene).catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
