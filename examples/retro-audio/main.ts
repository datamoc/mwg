import { Game, Scene2D } from '../../src/two-d/index.ts';
import {
	MusicPlayer,
	midiSynthNames,
	onMidiSynthFallback,
	parseMidi,
	registerMidiSynth,
	renderMidiThroughSynth,
	renderMidiToBuffer,
	resolveMidiSynth,
	type MidiSynth,
	type MidiSynthFallback,
} from '../../src/audio/index.ts';
import { Button, Label, theme } from '../../src/two-d/ui/index.ts';
import { exposeForTests } from '../../src/testing/index.ts';

/**
 * Retro audio with an interchangeable MIDI engine: the same small tune, written as a
 * Standard MIDI File in code, is voiced three ways - by two toy synths registered under
 * names (`retro:sine`, `retro:square`, the seam a real retro-instrument package plugs
 * into) and by the internal path. Picking an engine resolves it by name, renders through
 * it, and plays the render; a fallback the resolver had to make is shown, not silent.
 */

/** a one-oscillator-per-note synth with a waveform's shape, the smallest honest `MidiSynth` */
class ToySynth implements MidiSynth {
	readonly sampleRate = 22050;
	private readonly voices = new Map<number, { frequency: number; phase: number; velocity: number }>();

	constructor(private readonly square: boolean) {}

	event(status: number, data1: number, data2: number): void {
		const kind = status & 0xf0;
		const key = ((status & 0x0f) << 8) | data1;
		if (kind === 0x90 && data2 > 0) {
			this.voices.set(key, { frequency: 440 * 2 ** ((data1 - 69) / 12), phase: 0, velocity: data2 / 127 });
		} else if (kind === 0x80 || kind === 0x90) this.voices.delete(key);
	}

	sysex(): void {}

	render(left: Float32Array, right: Float32Array, start: number, count: number): void {
		for (let i = 0; i < count; i++) {
			let sample = 0;
			for (const voice of this.voices.values()) {
				voice.phase += voice.frequency / this.sampleRate;
				const cycle = voice.phase % 1;
				sample += (this.square ? (cycle < 0.5 ? 1 : -1) : Math.sin(cycle * Math.PI * 2)) * voice.velocity;
			}
			left[start + i] += sample * 0.2;
			right[start + i] += sample * 0.2;
		}
	}

	reset(): void {
		this.voices.clear();
	}
}

registerMidiSynth('retro:sine', () => new ToySynth(false));
registerMidiSynth('retro:square', () => new ToySynth(true));

/** the tune as SMF bytes: a rising line, then the same line a third up, at 120 bpm */
function tuneBytes(): Uint8Array {
	const notes = [60, 64, 67, 72, 76, 79, 76, 72];
	const track: number[] = [0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20];
	for (const note of notes) track.push(0, 0x90, note, 96, 0x60, 0x80, note, 0);
	track.push(0, 0xff, 0x2f, 0);
	return new Uint8Array([
		0x4d,
		0x54,
		0x68,
		0x64,
		0,
		0,
		0,
		6,
		0,
		0,
		0,
		1,
		0,
		96,
		0x4d,
		0x54,
		0x72,
		0x6b,
		0,
		0,
		0,
		track.length,
		...track,
	]);
}

class RetroAudioScene extends Scene2D {
	private player: MusicPlayer | null = null;
	private audioContext: AudioContext | null = null;
	private status!: Label;
	/** what the browser smoke reads: the engine that voiced the last pick, and the context's state */
	readonly exposed = { engine: '', contextState: '', fallbacks: 0, status: '' };

	override create(): void {
		const game = Game.current;
		const centerX = game.width / 2;

		const title = new Label({
			text: 'One tune, three engines: two registered retro synths and the internal path.\nPick one: it renders, then plays. A fallback is announced under the buttons.',
			color: theme().color.text,
			size: 15,
			align: 'center',
		});
		title.anchor.set(0.5, 0);
		title.position.set(centerX, 30);
		this.stage.addChild(title);

		const engines: [string, string][] = [
			['Sine (retro:sine)', 'retro:sine'],
			['Square (retro:square)', 'retro:square'],
			['Internal path', 'builtin'],
		];
		engines.forEach(([label, engine], index) => {
			const button = new Button({
				width: 240,
				height: 30,
				text: label,
				onClick: () => void this.playWith(engine),
			});
			button.position.set(centerX - 120, 110 + index * 40);
			this.stage.addChild(button);
		});

		const missing = new Button({
			width: 240,
			height: 30,
			text: 'Ask for retro:mt32 (absent)',
			onClick: () => void this.playWith('retro:mt32'),
		});
		missing.position.set(centerX - 120, 110 + engines.length * 40);
		this.stage.addChild(missing);

		this.status = new Label({ text: '', color: theme().color.textDim, size: 13, align: 'center' });
		this.status.anchor.set(0.5, 0);
		this.status.position.set(centerX, 110 + (engines.length + 1) * 40 + 16);
		this.stage.addChild(this.status);
		this.showStatus(`engines available: ${midiSynthNames().join(', ')}`);
		exposeForTests('retroAudio', this.exposed);
	}

	override update(): void {
		this.player?.update();
	}

	private showStatus(text: string): void {
		this.status.setText(text);
		this.exposed.status = text;
	}

	private async playWith(engine: string): Promise<void> {
		//the context is made inside the click, so the browser's gesture rule is satisfied
		if (!this.player) {
			this.audioContext = new AudioContext();
			this.player = new MusicPlayer(this.audioContext, { volume: 0.7 });
		}
		await this.audioContext?.resume();
		const onFallback = ({ requested, used }: MidiSynthFallback): void => {
			this.exposed.fallbacks++;
			this.showStatus(`fallback: ${requested} unavailable, voiced by ${used} instead`);
		};
		onMidiSynthFallback.add(onFallback);
		try {
			const file = parseMidi(tuneBytes());
			const { synth, name } = resolveMidiSynth(engine, 22050, 'builtin');
			const rendered = synth ? renderMidiThroughSynth(file, synth) : renderMidiToBuffer(file);
			this.player.load(rendered);
			this.player.play();
			this.exposed.engine = name;
			this.exposed.contextState = this.audioContext?.state ?? '';
			if (name === engine || engine === 'builtin') this.showStatus(`playing through: ${name}`);
		} finally {
			onMidiSynthFallback.remove(onFallback);
		}
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(RetroAudioScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
