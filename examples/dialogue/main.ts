import { Game, Scene } from '../../src/core/index.ts';
import { SpriteSheet, registerColorTransform } from '../../src/render/index.ts';
import { WindowStack, MessageBox } from '../../src/ui/index.ts';
import { DialogueStage, StageScript, type StageCommand } from '../../src/stage/index.ts';
import * as Resources from '../../src/assets/index.ts';
import tileset from '../assets/tiles.json' with { type: 'json' };

/**
 * A scripted conversation: backdrop, characters, dialogue.
 *
 * The whole scene below is data. Nothing in the list knows about Pixi, textures or the
 * frame loop, which is the point: it could as easily have come out of a file, a
 * spreadsheet or an editor.
 *
 * Alice and Bob are one drawing. The generator in tools/make-example-assets.mjs builds a
 * character from five colours (skin, eyes, hair, upper garment, lower garment), so a
 * second person costs a palette rather than a second sprite sheet.
 */

const BACKDROP = 'backdrop_room.png';
const ALICE = 'char_alice.png';
const BOB = 'char_bob.png';

const { character } = tileset;

const SCENE: StageCommand[] = [
	{ backdrop: 'room', fade: 0.6 },
	{ show: 'alice', at: 'left', expression: 'neutral', fade: 0.4 },
	{ say: 'You are late. The rain stopped an hour ago.', as: 'alice' },
	{ show: 'bob', at: 'right', expression: 'neutral', fade: 0.4 },
	{ say: 'It stopped where you were standing. It did not stop where I was.', as: 'bob' },
	{ expression: 'cross', of: 'alice' },
	{ say: 'That is not how rain works.', as: 'alice' },
	{ expression: 'happy', of: 'bob' },
	{
		ask: 'It is how this one worked. Do you want to see where?',
		as: 'bob',
		choices: [
			{ text: 'Show me.' },
			{ text: 'Not in these shoes.' },
			{ text: 'You are making this up.' },
		],
		store: 'answer',
	},
	{
		call: async (state) => {
			//an ordinary function, for what a data list should not try to express
			console.log('Alice said:', state.answers.answer);
		},
	},
	{ expression: 'neutral', of: 'alice' },
	{ say: 'Then bring a lamp. It will be dark by the time we get there.', as: 'bob' },
	{ hideAll: true, fade: 0.5 },
	{ say: 'They went out through the back, and the door stayed open behind them.' },
];

class DialogueScene extends Scene {
	private windows = new WindowStack();
	private dialogue!: DialogueStage;
	private script: StageScript | null = null;

	override create(): void {
		const game = Game.current;

		this.dialogue = new DialogueStage(game.width, game.height);
		this.stage.addChild(this.dialogue);
		this.stage.addChild(this.windows);

		//both characters come from the same generator, differing only in five colours
		const cast = { alice: ALICE, bob: BOB };
		for (const [id, asset] of Object.entries(cast)) {
			this.dialogue.defineCharacter(id, {
				sheet: SpriteSheet.fromTexture(
					Resources.texture(asset),
					character.frameWidth,
					character.frameHeight
				),
				expressions: character.expressions,
				height: 0.64,
			});
		}

		this.script = new StageScript({
			stage: this.dialogue,
			windows: this.windows,
			backdrop: () => Resources.texture(BACKDROP),
			displayName: (id) => (id === 'alice' ? 'Alice' : 'Bob'),
			boxWidth: Math.min(560, game.width - 80),
			boxHeight: 110,
		});

		void this.script.run(SCENE).then(() => this.showEpilogueNvl());
	}

	/**
	 * A standalone `MessageBox` in `'nvl'` mode: several lines accumulate into one growing
	 * block instead of clearing each time, Ren'Py's other display mode alongside the
	 * strip-of-speech-bubbles `'adv'` mode the scripted scene above already used.
	 */
	private showEpilogueNvl(): void {
		this.windows.push(
			new MessageBox({
				width: Math.min(560, Game.current.width - 80),
				height: 160,
				mode: 'nvl',
				speed: 45,
				pages: [
					{ text: 'The lamp went out before they reached the lot.', speaker: 'Narrator' },
					{ text: 'Neither of them minded. They knew the way from here.', speaker: 'Narrator' },
					{ text: 'The end.', speaker: 'Narrator' },
				],
				dims: false,
				anchor: 'bottom',
			})
		);
	}

	override resize(width: number, height: number): void {
		this.dialogue?.resize(width, height);
		this.windows.setViewport(width, height);
	}

	override update(dt: number): void {
		this.dialogue.update(dt);
		this.windows.update(dt);
	}

	override destroy(): void {
		this.script?.cancel();
		super.destroy();
	}
}

async function main(): Promise<void> {
	const game = new Game({
		canvas: document.getElementById('game') as HTMLCanvasElement,
		background: 0x0d0d12,
		extensions: [registerColorTransform],
	});

	await Resources.load([BACKDROP, ALICE, BOB]);
	await game.start(DialogueScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`
	);
});
