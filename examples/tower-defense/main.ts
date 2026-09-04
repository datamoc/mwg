import { Graphics, Text } from 'pixi.js';
import { Game, Scene, Spawner } from '../../src/core/index.ts';

const COLS = 16;
const ROWS = 9;
const CELL = 48;
const PATH_ROW = 4;

interface Enemy {
	view: Graphics;
	x: number;
	hp: number;
	maxHp: number;
	speed: number;
}

interface Tower {
	view: Graphics;
	x: number;
	y: number;
	cooldown: number;
}

class TowerDefenseScene extends Scene {
	private enemies: Enemy[] = [];
	private towers: Tower[] = [];
	private spawner!: Spawner<'scout' | 'armoured'>;
	private lives = 10;
	private gold = 100;
	private status!: Text;

	create(): void {
		const background = new Graphics().rect(0, 0, COLS * CELL, ROWS * CELL).fill(0x17202b);
		this.stage.addChild(background);
		this.drawBoard();
		this.addTower(4, 2);
		this.addTower(9, 6);
		this.addTower(12, 2);

		this.status = new Text({ text: '', style: { fill: 0xf4f0d0, fontSize: 18 } });
		this.status.x = 12;
		this.status.y = 12;
		this.stage.addChild(this.status);

		this.spawner = new Spawner({
			waves: [
				{ delay: 1, entries: [{ kind: 'scout', count: 8 }], duration: 18 },
				{ delay: 12, entries: [{ kind: 'scout', count: 8 }, { kind: 'armoured', count: 3 }], duration: 16 },
				{ delay: 28, entries: [{ kind: 'armoured', count: 8 }], duration: 12 },
			],
			onSpawn: (kind) => this.spawn(kind),
		});
	}

	private drawBoard(): void {
		for (let x = 0; x < COLS; x++) {
			const tile = new Graphics().rect(x * CELL, PATH_ROW * CELL, CELL - 2, CELL - 2).fill(0x6a543d);
			this.stage.addChild(tile);
		}
		for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
			if (y === PATH_ROW) continue;
			this.stage.addChild(new Graphics().rect(x * CELL, y * CELL, CELL - 2, CELL - 2).fill(0x243544));
		}
	}

	private addTower(x: number, y: number): void {
		const view = new Graphics().circle(CELL / 2, CELL / 2, 15).fill(0x5bb6a9).circle(CELL / 2, CELL / 2, 6).fill(0xdceca3);
		view.x = x * CELL;
		view.y = y * CELL;
		this.stage.addChild(view);
		this.towers.push({ view, x: x * CELL + CELL / 2, y: y * CELL + CELL / 2, cooldown: 0 });
	}

	private spawn(kind: 'scout' | 'armoured'): void {
		const maxHp = kind === 'armoured' ? 12 : 5;
		const view = new Graphics().circle(0, 0, kind === 'armoured' ? 14 : 10).fill(kind === 'armoured' ? 0xd9825b : 0xf0c75e);
		view.x = -CELL;
		view.y = PATH_ROW * CELL + CELL / 2;
		this.stage.addChild(view);
		this.enemies.push({ view, x: -CELL, hp: maxHp, maxHp, speed: kind === 'armoured' ? 24 : 34 });
	}

	override update(dt: number): void {
		this.spawner.update(dt);
		for (const enemy of this.enemies) {
			enemy.x += enemy.speed * dt;
			enemy.view.x = enemy.x;
		}
		for (const tower of this.towers) {
			tower.cooldown -= dt;
			if (tower.cooldown > 0) continue;
			const target = this.enemies
				.filter((enemy) => Math.abs(enemy.x - tower.x) < CELL * 3.5)
				.sort((a, b) => b.x - a.x)[0];
			if (!target) continue;
			target.hp -= 2;
			tower.cooldown = 0.45;
		}
		for (let i = this.enemies.length - 1; i >= 0; i--) {
			const enemy = this.enemies[i];
			if (enemy.hp <= 0) {
				enemy.view.destroy();
				this.enemies.splice(i, 1);
				this.gold += 5;
			} else if (enemy.x >= COLS * CELL) {
				enemy.view.destroy();
				this.enemies.splice(i, 1);
				this.lives--;
			}
		}
		this.status.text = `Tower defense  |  lives ${this.lives}  |  gold ${this.gold}  |  enemies ${this.enemies.length}`;
	}
}

const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x10131a });
game.start(TowerDefenseScene).catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f88">${String(error)}</pre>`);
});
