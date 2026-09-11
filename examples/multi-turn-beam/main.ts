import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Button, Label, theme } from '../../src/two-d/ui/index.ts';
import { FLOOR, Level, WALL, MultiTurnBeam } from '../../src/roguelike/index.ts';

/** A small interactive proof of multi-turn traversal, blockers and moving targets. */
class BeamScene extends Scene2D {
	private log!: Label;

	override create(): void {
		const button = new Button({ width: 220, height: 32, text: 'Fire multi-turn beam', onClick: () => this.fire() });
		button.position.set(20, 20);
		this.stage.addChild(button);
		this.log = new Label({
			text: 'The target moves before the beam reaches it.',
			color: theme().color.text,
			size: 14,
			wrapWidth: 720,
		});
		this.log.position.set(20, 70);
		this.stage.addChild(this.log);
	}

	private fire(): void {
		const level = new Level(9, 1, [WALL, FLOOR], 1);
		level.set(6, 0, 0); //the beam demonstrates that an opaque cell ends the action
		const target = { x: 4, hp: 10 };
		const lines = ['Beam started at x=0, target starts at x=4.'];
		const beam = new MultiTurnBeam({
			level,
			from: { x: 0, y: 0 },
			target: { x: 7, y: 0 },
			damage: 3,
			targetsAt: (cell) => (cell.x === target.x ? [target] : []),
			applyDamage: (unit, amount) => {
				unit.hp -= amount;
				lines.push(`  target hit for ${amount}, hp=${unit.hp}`);
			},
		});
		beam.start();
		for (let turn = 1; beam.active; turn++) {
			if (turn === 2) target.x = 3; //moving targets are looked up when reached, not when aimed
			const result = beam.advance();
			lines.push(`turn ${turn}: x=${result.cell?.x}, ${result.status}`);
		}
		lines.push(`finished: ${beam.done ? 'terminal' : 'active'}`);
		this.log.setText(lines.join('\n'));
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(BeamScene);
}

void main();
