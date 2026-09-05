import { Game, Scene, LoadQueue, type LoadTaskContext } from '../../src/core/index.ts';
import { LoadingScreen, Button, Label, theme } from '../../src/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';
import { AssetStream } from '../../src/assets/index.ts';

const TILES = 'tiles.png';

/**
 * The loading lifecycle, end to end: `LoadQueue` running named, weighted tasks, `LoadingScreen`
 * showing truthful progress against it, and `AssetStream` preloading a likely-next bundle in
 * the background once the queue is done.
 *
 * `Scene.create()`'s own doc comment says assets are already loaded by the time it runs -
 * true for every other example, since they call `Resources.load` in `main()` before
 * `game.start()`. This scene is the exception: it *is* the loading, so its own asset load
 * happens inside one of the queue's tasks instead, deferred until this scene's queue runs.
 *
 * The "generate the world" task deliberately fails on its first attempt, so the failed
 * state, `LoadingScreen`'s retry button, and `LoadQueue.retry()` all actually get exercised
 * here rather than only ever taking the happy path once and never again.
 */

let firstAttemptDone = false;

function wait(seconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

class LoadingScene extends Scene {
	private screen!: LoadingScreen;
	private queue!: LoadQueue;
	private stream = new AssetStream();
	private unbind: (() => void) | null = null;

	override create(): void {
		const game = Game.current;

		this.queue = new LoadQueue();
		this.queue.add({
			id: 'loading assets',
			weight: 1,
			run: (context: LoadTaskContext) => Resources.load([TILES], (fraction) => context.report(fraction)),
		});
		this.queue.add({
			id: 'generating world',
			weight: 2,
			run: async (context: LoadTaskContext) => {
				for (let step = 1; step <= 5; step++) {
					await wait(0.15);
					if (context.cancelled) return;
					context.report(step / 5);
				}
				if (!firstAttemptDone) {
					firstAttemptDone = true;
					throw new Error('a generation seed collided - retry to continue');
				}
			},
		});
		this.queue.add({
			id: 'preloading next area',
			weight: 1,
			run: (context: LoadTaskContext) =>
				this.stream.preload({ id: 'area-2', paths: [TILES], estimatedBytes: 1 }, (fraction) => context.report(fraction)),
		});

		this.screen = new LoadingScreen({
			width: game.width,
			height: game.height,
			title: 'mwg loading lifecycle',
			onRetry: () => this.startQueue(),
			onCancel: () => this.queue.cancel(),
		});
		this.stage.addChild(this.screen);

		//LoadingScreen deliberately draws no retry/cancel buttons of its own - "invoke from
		//a game-owned retry button or keyboard binding", per its own doc comment - so this
		//example provides real ones, the same way a game would
		const retry = new Button({ width: 90, height: 26, text: 'Retry', onClick: () => this.screen.retry() });
		retry.x = game.width / 2 - 100;
		retry.y = game.height / 2 + 40;
		this.stage.addChild(retry);

		const cancel = new Button({ width: 90, height: 26, text: 'Cancel', onClick: () => this.screen.cancel() });
		cancel.x = game.width / 2 + 10;
		cancel.y = game.height / 2 + 40;
		this.stage.addChild(cancel);

		this.startQueue();
	}

	private startQueue(): void {
		if (this.queue.snapshot.status !== 'idle') this.queue.retry();

		this.unbind?.();
		this.unbind = this.screen.bind(this.queue);

		this.queue
			.start()
			.then(() => Game.current.switchScene(ReadyScene))
			.catch(() => {
				//left on screen: LoadingScreen already shows the failure, its retry button
				//calls startQueue() again through onRetry
			});
	}

	override resize(width: number, height: number): void {
		this.screen.resize(width, height);
	}

	override destroy(): void {
		this.unbind?.();
		super.destroy();
	}
}

class ReadyScene extends Scene {
	override create(): void {
		const game = Game.current;
		const label = new Label({
			text: 'Loaded. Assets ready, world generated, next area preloaded.',
			color: theme().color.text,
			align: 'center',
		});
		label.anchor.set(0.5);
		label.position.set(game.width / 2, game.height / 2 - 20);
		this.stage.addChild(label);

		const restart = new Button({
			width: 160,
			height: 28,
			text: 'Run again',
			onClick: () => {
				firstAttemptDone = false;
				Game.current.switchScene(LoadingScene);
			},
		});
		restart.x = game.width / 2 - 80;
		restart.y = game.height / 2 + 16;
		this.stage.addChild(restart);
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x101018,
	});

	//no Resources.load here: LoadingScene's own point is that it does that itself, inside
	//a tracked task, rather than the game assuming assets are ready before it starts
	await game.start(LoadingScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});
