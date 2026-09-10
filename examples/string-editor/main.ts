import { Game, Scene2D } from '../../src/two-d/index.ts';
import { Input } from '../../src/core/index.ts';
import * as I18n from '../../src/i18n/index.ts';
import { Sound } from '../../src/audio/index.ts';
import { Button, Label, RichLabel, theme } from '../../src/two-d/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';

/**
 * The string editor as a playable page: a reference English string on the left, an
 * editable French translation on the right, and a rendered preview underneath - the
 * same split screen as `tools/i18n-edit`, with markdown, a live `{HP_loose}` variable,
 * and three auditionable sound cues instead of a terminal.
 *
 * Click the French pane (or the Edit button) and type: the preview re-renders through
 * `RichLabel`, placeholder drift against the reference is flagged on the spot, and the
 * Play button reveals the line progressively while firing its cue.
 */

const BASE: I18n.Catalog = {
	locale: 'en',
	direction: 'ltr',
	messages: {
		'player.hit.log': "You're *hit*. You loose {HP_loose}. You **die**!",
		'player.hit.audio': 'hit.wav',
	},
};

const FRENCH_DEFAULT = "T'es *touché*. Tu perds {HP_loose}. Tu **meurs** !";

const CUES: ReadonlyArray<string | null> = ['hit.wav', 'blip.wav', 'pickup.wav', null];

class StringEditorScene extends Scene2D {
	private fr: I18n.Catalog = { locale: 'fr', direction: 'ltr', messages: { 'player.hit.log': FRENCH_DEFAULT } };
	private hp = 12;
	private previewLocale: 'en' | 'fr' = 'fr';
	private cueIndex = 0;
	private editing = false;

	private enPane!: Label;
	private frPane!: Label;
	private preview!: RichLabel;
	private notice!: Label;
	private hpLabel!: Label;
	private cueButton!: Button;
	private localeButton!: Button;
	private editButton!: Button;

	private sounds = new Map<string, Sound>();
	private formatter = I18n.createCatalogFormatter();
	private onKeyTyped = (event: KeyboardEvent): void => this.typeKey(event);

	override create(): void {
		I18n.setBase(BASE);
		I18n.setActive(this.fr);
		for (const path of ['blip.wav', 'hit.wav', 'pickup.wav']) {
			this.sounds.set(path, new Sound(path, { volume: 0.8 }));
		}

		const game = Game.current;
		const margin = 24;
		const half = (game.width - margin * 2 - 16) / 2;

		const title = new Label({ text: 'String editor: reference, translation, rendered line', color: theme().color.text, size: 17 });
		title.position.set(margin, 12);
		this.stage.addChild(title);

		const enHead = new Label({ text: 'EN reference', color: theme().color.textDim, size: 13 });
		enHead.position.set(margin, 44);
		this.stage.addChild(enHead);

		this.enPane = new Label({ text: '', color: theme().color.text, size: 15, wrapWidth: half });
		this.enPane.position.set(margin, 64);
		this.stage.addChild(this.enPane);

		const frHead = new Label({ text: 'FR translation (click to edit)', color: theme().color.textDim, size: 13 });
		frHead.position.set(margin + half + 16, 44);
		this.stage.addChild(frHead);

		this.frPane = new Label({ text: '', color: theme().color.textHighlight, size: 15, wrapWidth: half });
		this.frPane.position.set(margin + half + 16, 64);
		this.frPane.eventMode = 'static';
		this.frPane.cursor = 'text';
		this.frPane.on('pointerdown', () => this.setEditing(true));
		this.stage.addChild(this.frPane);

		const previewHead = new Label({ text: 'Rendered preview', color: theme().color.textDim, size: 13 });
		previewHead.position.set(margin, 132);
		this.stage.addChild(previewHead);

		this.preview = new RichLabel({ text: '', color: theme().color.text, size: 19, wrapWidth: game.width - margin * 2 });
		this.preview.position.set(margin, 152);
		this.stage.addChild(this.preview);

		this.notice = new Label({ text: '', color: theme().color.textDim, size: 13 });
		this.notice.position.set(margin, 208);
		this.stage.addChild(this.notice);

		const addButton = (text: string, x: number, y: number, onClick: () => void, width = 128): Button => {
			const button = new Button({ width, height: 30, text, onClick });
			button.position.set(x, y);
			this.stage.addChild(button);
			return button;
		};

		addButton('Play line', margin, 236, () => this.playLine(), 118);
		this.cueButton = addButton('', margin + 126, 236, () => this.cycleCue(), 150);
		this.localeButton = addButton('', margin + 284, 236, () => this.toggleLocale(), 110);
		this.editButton = addButton('', margin + 402, 236, () => this.setEditing(!this.editing), 150);

		addButton('HP -', margin, 274, () => this.setHp(this.hp - 1), 80);
		this.hpLabel = new Label({ text: '', color: theme().color.text, size: 15 });
		this.hpLabel.position.set(margin + 88, 279);
		this.stage.addChild(this.hpLabel);
		addButton('HP +', margin + 212, 274, () => this.setHp(this.hp + 1), 80);

		const auditionHead = new Label({ text: 'Audition cues:', color: theme().color.textDim, size: 13 });
		auditionHead.position.set(margin + 322, 279);
		this.stage.addChild(auditionHead);
		addButton('blip', margin + 432, 274, () => this.sounds.get('blip.wav')?.play(), 80);
		addButton('hit', margin + 518, 274, () => this.sounds.get('hit.wav')?.play(), 80);
		addButton('pickup', margin + 604, 274, () => this.sounds.get('pickup.wav')?.play(), 80);

		const hint = new Label({
			text: 'Type in the FR pane (Esc stops). Play reveals the line and fires its cue.',
			color: theme().color.textDim,
			size: 13,
		});
		hint.position.set(margin, 312);
		this.stage.addChild(hint);

		Input.onKey.add(this.onKeyTyped);
		this.refresh();
	}

	override destroy(): void {
		Input.onKey.remove(this.onKeyTyped);
		super.destroy();
	}

	override update(dt: number): void {
		this.preview.updateReveal(dt);
	}

	private message(): I18n.SemanticMessage {
		return { type: 'player.hit', params: { HP_loose: this.hp } };
	}

	private rendered(): string {
		return this.formatter.format(this.message(), 'log');
	}

	private cuePath(): string | null {
		const cue = this.formatter.format(this.message(), 'audio');
		return cue === '' ? null : cue;
	}

	private refresh(): void {
		I18n.setActive(this.previewLocale === 'fr' ? this.fr : BASE);
		this.enPane.setText(BASE.messages['player.hit.log'] as string);
		const frText = this.fr.messages['player.hit.log'] as string;
		this.frPane.setText(frText + (this.editing ? '▌' : ''));
		this.preview.setText(this.rendered());

		const drift = I18n.diffPlaceholders(BASE.messages['player.hit.log'] as string, frText);
		const problems = [
			...drift.missing.map((token) => `missing {${token}}`),
			...drift.extra.map((token) => `extra {${token}}`),
			...drift.changed.map(({ token }) => `{${token}} reshaped`),
		];
		if (problems.length > 0) {
			this.notice.setColor(0xff6666);
			this.notice.setText(`placeholder drift: ${problems.join(', ')}`);
		} else {
			this.notice.setColor(theme().color.textDim);
			this.notice.setText('placeholders match the reference');
		}

		this.hpLabel.setText(`HP_loose = ${this.hp}`);
		this.cueButton.setText(`cue: ${CUES[this.cueIndex] ?? 'none'}`);
		this.localeButton.setText(`show: ${this.previewLocale.toUpperCase()}`);
		this.editButton.setText(this.editing ? 'Stop editing' : 'Edit translation');
	}

	private setHp(value: number): void {
		this.hp = Math.max(0, Math.min(99, value));
		this.refresh();
	}

	private toggleLocale(): void {
		this.previewLocale = this.previewLocale === 'fr' ? 'en' : 'fr';
		this.refresh();
	}

	private cycleCue(): void {
		this.cueIndex = (this.cueIndex + 1) % CUES.length;
		const cue = CUES[this.cueIndex];
		if (cue === null) delete this.fr.messages['player.hit.audio'];
		else this.fr.messages['player.hit.audio'] = cue;
		this.refresh();
	}

	private setEditing(editing: boolean): void {
		this.editing = editing;
		this.refresh();
	}

	private playLine(): void {
		this.preview.showProgressive(this.rendered(), 60);
		const cue = this.cuePath();
		if (cue !== null) this.sounds.get(cue)?.play();
	}

	private typeKey(event: KeyboardEvent): void {
		if (!this.editing) return;
		if (event.key === 'Escape') {
			this.setEditing(false);
			return;
		}
		if (event.key === 'Backspace') {
			const text = this.fr.messages['player.hit.log'] as string;
			this.fr.messages['player.hit.log'] = text.slice(0, -1);
			this.refresh();
			return;
		}
		if (event.key.length === 1) {
			this.fr.messages['player.hit.log'] = (this.fr.messages['player.hit.log'] as string) + event.key;
			this.refresh();
		}
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await Resources.load(['blip.wav', 'hit.wav', 'pickup.wav']);
	await game.start(StringEditorScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
