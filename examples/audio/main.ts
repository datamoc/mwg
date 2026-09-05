import { Game, Scene } from '../../src/core/index.ts';
import { Music, Sound } from '../../src/audio/index.ts';
import { Button, Label, theme } from '../../src/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';

/**
 * `mwg/audio` on its own: `Sound` for one-shot effects (pooled, so overlapping plays never
 * steal the same instance) and `Music.playTracks` for a background playlist that advances on
 * its own once each track ends, crossfading into the next - three generated tracks, not one
 * looping clip, since a playlist needs more than one track to show a "several tracks"
 * behaviour at all.
 */

const TRACKS = ['tune_dawn.wav', 'tune_march.wav', 'tune_dusk.wav'];

class AudioScene extends Scene {
	private music = new Music({ volume: 0.6 });
	private pickup = new Sound('pickup.wav', { volume: 0.8 });
	private volumeLabel!: Label;

	override create(): void {
		const game = Game.current;
		const centerX = game.width / 2;

		const title = new Label({
			text: 'Music.playTracks cycles three generated tracks;\nSound plays a pooled one-shot effect.',
			color: theme().color.text,
			size: 15,
			align: 'center',
		});
		title.anchor.set(0.5, 0);
		title.position.set(centerX, 30);
		this.stage.addChild(title);

		const row = (index: number): number => 110 + index * 40;

		const playPlaylist = new Button({
			width: 220,
			height: 30,
			text: 'Play playlist',
			onClick: () => this.music.playTracks(TRACKS, 1.5),
		});
		playPlaylist.position.set(centerX - 110, row(0));
		this.stage.addChild(playPlaylist);

		const stopMusic = new Button({ width: 220, height: 30, text: 'Stop music', onClick: () => this.music.stop(1) });
		stopMusic.position.set(centerX - 110, row(1));
		this.stage.addChild(stopMusic);

		const louder = new Button({
			width: 105,
			height: 30,
			text: 'Volume +',
			onClick: () => this.setVolume(this.music.volume + 0.1),
		});
		louder.position.set(centerX - 110, row(2));
		this.stage.addChild(louder);

		const quieter = new Button({
			width: 105,
			height: 30,
			text: 'Volume -',
			onClick: () => this.setVolume(this.music.volume - 0.1),
		});
		quieter.position.set(centerX + 5, row(2));
		this.stage.addChild(quieter);

		const playSfx = new Button({ width: 220, height: 30, text: 'Play pickup sound', onClick: () => this.pickup.play() });
		playSfx.position.set(centerX - 110, row(3));
		this.stage.addChild(playSfx);

		this.volumeLabel = new Label({ text: '', color: theme().color.textDim, size: 13, align: 'center' });
		this.volumeLabel.anchor.set(0.5, 0);
		this.volumeLabel.position.set(centerX, row(4) + 20);
		this.stage.addChild(this.volumeLabel);
		this.refreshVolumeLabel();
	}

	override update(dt: number): void {
		this.music.update(dt);
	}

	private setVolume(value: number): void {
		this.music.volume = Math.max(0, Math.min(1, value));
		this.refreshVolumeLabel();
	}

	private refreshVolumeLabel(): void {
		this.volumeLabel.setText(`music volume: ${Math.round(this.music.volume * 100)}%`);
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await Resources.load(['pickup.wav', ...TRACKS]);
	await game.start(AudioScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
