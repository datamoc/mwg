import { Game, Scene2D } from '../../src/two-d/index.ts';
import { ClothSprite, Texture2D } from '../../src/two-d/render/index.ts';
import { Label } from '../../src/two-d/ui/index.ts';

/**
 * Item 423 on screen: a chequered tunic breathing in a slow gust cycle. The top edge
 * stays pinned (the waistband), the hem answers gravity and the wind, and the print
 * bends with the mesh because UVs are never rewritten.
 */

function tunicTexture(): Texture2D {
	const canvas = document.createElement('canvas');
	canvas.width = 96;
	canvas.height = 96;
	const context = canvas.getContext('2d')!;
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			context.fillStyle = (x + y) % 2 === 0 ? '#4caf50' : '#2e7d32';
			context.fillRect(x * 12, y * 12, 12, 12);
		}
	}
	return Texture2D.from(canvas);
}

class ClothScene extends Scene2D {
	private tunic!: ClothSprite;
	private elapsed = 0;

	override create(): void {
		this.tunic = new ClothSprite(tunicTexture(), {
			segmentsX: 10,
			segmentsY: 10,
			gravity: { x: 0, y: 900 },
		});
		this.tunic.position.set(152, 60);
		this.stage.addChild(this.tunic);

		const title = new Label({ text: 'Cloth: a tunic in a gust cycle', color: 0xffffff, size: 16 });
		title.position.set(16, 12);
		this.stage.addChild(title);
		const hint = new Label({
			text: 'waistband pinned, hem free - the print bends with the mesh',
			color: 0xbbbbbb,
			size: 12,
		});
		hint.position.set(16, 36);
		this.stage.addChild(hint);
	}

	override update(dt: number): void {
		this.elapsed += dt;
		//a slow gust cycle, so the still screenshot and the running page both show the drape
		this.tunic.setWind(260 + 240 * Math.sin(this.elapsed * 0.9), 0);
		this.tunic.update(dt);
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x101018,
	});
	await game.start(ClothScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
