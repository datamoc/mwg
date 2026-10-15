import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Spring } from '../../src/physics/index.ts';
import { Shape2D, SpringSprite } from '../../src/two-d/render/index.ts';
import { Label } from '../../src/two-d/ui/index.ts';

/**
 * Item 424 on screen: a bob chasing its anchor around a loop, overshooting each turn
 * and settling onto every straight. The line is the spring's lag made visible; the
 * orange ball is where `Spring.place` puts a follower.
 */

class SpringScene extends Scene2D {
	private spring!: Spring;
	private line!: SpringSprite;
	private ball!: Shape2D;
	private anchorDot!: Shape2D;
	private elapsed = 0;

	override create(): void {
		this.spring = new Spring({ stiffness: 60, damping: 4.5 });
		this.spring.setAnchor(200, 110);

		this.line = new SpringSprite({ spring: this.spring, color: 0x9db8d6, lineWidth: 2 });
		this.stage.addChild(this.line);

		this.anchorDot = new Shape2D().circle(0, 0, 5).fill(0x2196f3);
		this.stage.addChild(this.anchorDot);

		this.ball = new Shape2D().circle(0, 0, 10).fill(0xff5722);
		this.stage.addChild(this.ball);

		const title = new Label({ text: 'Spring: a bob chasing its anchor', color: 0xffffff, size: 16 });
		title.position.set(16, 12);
		this.stage.addChild(title);
		const hint = new Label({
			text: 'the anchor loops, the bob lags, overshoots and settles',
			color: 0xbbbbbb,
			size: 12,
		});
		hint.position.set(16, 36);
		this.stage.addChild(hint);
	}

	override update(dt: number): void {
		this.elapsed += dt;
		//a slow loop with a straight on each side: overshoot on the turns, rest on the straights
		const t = this.elapsed * 0.5;
		const anchor = { x: 200 + 120 * Math.sin(t), y: 150 + 60 * Math.sin(2 * t) };
		this.spring.setAnchor(anchor.x, anchor.y);
		this.spring.update(dt);
		this.spring.place(this.ball.position);
		this.anchorDot.position.set(anchor.x, anchor.y);
		this.line.sync();
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x101018,
	});
	await game.start(SpringScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
