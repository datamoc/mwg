import { Graphics, Text } from 'pixi.js';
import { Game, Input, Scene } from '../../src/core/index.ts';

type LockpickResult = { success: boolean; score: number } | { canceled: true };

const TAU = Math.PI * 2;
const TARGET_START = -0.42;
const TARGET_SIZE = 0.72;

class RoomScene extends Scene {
	private status!: Text;
	private input = (action: string): boolean => {
		if (action !== 'confirm') return false;
		Game.current.pushScene(LockpickScene);
		return true;
	};

	override create(): void {
		const width = Game.current.width;
		const height = Game.current.height;
		this.stage.addChild(new Graphics().rect(0, 0, width, height).fill(0x101018));

		const title = new Text({ text: 'THE OLD WATCHTOWER', style: { fill: 0xe8d7a5, fontFamily: 'monospace', fontSize: 24 } });
		title.anchor.set(0.5);
		title.position.set(width / 2, height * 0.28);
		this.stage.addChild(title);

		const chest = new Graphics().roundRect(-110, -65, 220, 130, 12).fill(0x70452f).stroke({ color: 0xc58a46, width: 5 });
		chest.position.set(width / 2, height * 0.53);
		this.stage.addChild(chest);

		const lock = new Graphics().circle(0, 0, 24).fill(0x17151b).stroke({ color: 0xe0b15d, width: 4 });
		lock.position.set(width / 2, height * 0.53);
		this.stage.addChild(lock);

		this.status = new Text({ text: 'Press Enter to pick the lock', style: { fill: 0xb7b4c6, fontFamily: 'monospace', fontSize: 15, align: 'center' } });
		this.status.anchor.set(0.5);
		this.status.position.set(width / 2, height * 0.78);
		this.stage.addChild(this.status);
		Input.onAction.add(this.input);
	}

	override resize(width: number, height: number): void {
		this.status?.position.set(width / 2, height * 0.78);
	}

	override onResume(result: unknown): void {
		const outcome = result as LockpickResult | undefined;
		if (outcome && 'canceled' in outcome) this.status.text = 'You step away from the chest. Enter to try again';
		else if (outcome?.success) this.status.text = `Unlocked! Precision score: ${outcome.score}%`;
		else this.status.text = 'The lock clicks shut. Enter to try again';
	}

	override destroy(): void {
		Input.onAction.remove(this.input);
		super.destroy();
	}
}

class LockpickScene extends Scene {
	private needle = 0;
	private attempts = 3;
	private dial!: Graphics;
	private prompt!: Text;
	private input = (action: string): boolean => {
		if (action === 'cancel') {
			Game.current.popScene({ canceled: true } satisfies LockpickResult);
			return true;
		}
		if (action === 'confirm') {
			this.tryPick();
			return true;
		}
		return false;
	};

	override create(): void {
		const width = Game.current.width;
		const height = Game.current.height;
		this.stage.addChild(new Graphics().rect(0, 0, width, height).fill({ color: 0x090910, alpha: 0.94 }));
		this.prompt = new Text({ text: '', style: { fill: 0xf3ead2, fontFamily: 'monospace', fontSize: 18, align: 'center' } });
		this.prompt.anchor.set(0.5);
		this.prompt.position.set(width / 2, height * 0.18);
		this.stage.addChild(this.prompt);
		this.dial = new Graphics();
		this.dial.position.set(width / 2, height * 0.52);
		this.stage.addChild(this.dial);
		this.drawDial();
		Input.onAction.add(this.input);
	}

	override resize(width: number, height: number): void {
		if (!this.dial) return;
		this.prompt.position.set(width / 2, height * 0.18);
		this.dial.position.set(width / 2, height * 0.52);
	}

	override update(dt: number): void {
		this.needle = (this.needle + dt * 2.4) % TAU;
		this.drawDial();
	}

	override destroy(): void {
		Input.onAction.remove(this.input);
		super.destroy();
	}

	private drawDial(): void {
		if (!this.dial) return;
		this.dial.clear();
		this.dial.circle(0, 0, 124).fill(0x1d1d2a).stroke({ color: 0x77738c, width: 4 });
		this.dial.arc(0, 0, 105, TARGET_START, TARGET_START + TARGET_SIZE).stroke({ color: 0x69d391, width: 18 });
		this.dial.moveTo(0, 0).lineTo(Math.cos(this.needle) * 112, Math.sin(this.needle) * 112).stroke({ color: 0xf2c14e, width: 7 });
		this.dial.circle(0, 0, 12).fill(0xe8d7a5);
		this.prompt.text = `ENTER: set the pin    ESC: leave    attempts ${this.attempts}`;
	}

	private tryPick(): void {
		const distance = Math.abs(Math.atan2(Math.sin(this.needle - (TARGET_START + TARGET_SIZE / 2)), Math.cos(this.needle - (TARGET_START + TARGET_SIZE / 2))));
		if (distance <= TARGET_SIZE / 2) {
			Game.current.popScene({ success: true, score: Math.max(1, Math.round(100 - distance / (TARGET_SIZE / 2) * 40)) } satisfies LockpickResult);
			return;
		}
		this.attempts -= 1;
		if (this.attempts <= 0) Game.current.popScene({ success: false, score: 0 } satisfies LockpickResult);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(RoomScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
