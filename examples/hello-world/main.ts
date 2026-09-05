import { Graphics, Text } from 'pixi.js';
import { Game, Scene } from '../../src/core/index.ts';

/**
 * The smallest thing `mwg` can show: a `Game` owning one `Scene`, a sprite, and `update(dt)`
 * moving it every frame. Nothing here reads input, loads an asset, or manages state - see
 * `movement`, `tilemap`, and the rest of the tutorial-sized examples for those, one concept
 * at a time. This is the shape every one of them builds on: `class extends Scene { create()
 * ... }`, then `new Game(...).start(TheScene)`.
 */
class HelloScene extends Scene {
	private square!: Graphics;
	private elapsed = 0;

	override create(): void {
		const label = new Text({
			text: 'Hello, mwg!\nThis square moves because update(dt) runs every frame.',
			style: { fill: 0xd8dae6, fontFamily: 'monospace', fontSize: 16, align: 'center' },
		});
		label.anchor.set(0.5, 0);
		label.position.set(Game.current.width / 2, 24);
		this.stage.addChild(label);

		this.square = new Graphics().rect(-20, -20, 40, 40).fill(0x6fb1ff);
		this.square.position.set(Game.current.width / 2, Game.current.height / 2);
		this.stage.addChild(this.square);
	}

	override update(dt: number): void {
		this.elapsed += dt;
		this.square.position.x = Game.current.width / 2 + Math.sin(this.elapsed) * 120;
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(HelloScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
