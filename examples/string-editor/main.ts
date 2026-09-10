import { Game, Scene2D } from '../../src/two-d/index.ts';
import * as I18n from '../../src/i18n/index.ts';
import { Sound } from '../../src/audio/index.ts';
import { Button, Label, RichLabel, theme } from '../../src/two-d/ui/index.ts';
import * as Resources from '../../src/assets/index.ts';

/**
 * The string editor as a playable page: a reference English string on the left, an
 * editable French translation on the right, and a rendered preview underneath - the
 * same split screen as `tools/i18n-edit`, with markdown, a live `{HP_loose}` variable,
 * and an inline sound marker instead of a terminal.
 *
 * Click the French pane (or the Edit button) and type: the preview re-renders through
 * `RichLabel`, placeholder drift against the reference is flagged on the spot, and the
 * Play button reveals the line progressively while firing the `{sound:path}` cue in it.
 */

const BASE: I18n.Catalog = {
	locale: 'en',
	direction: 'ltr',
	messages: {
		'player.hit.log': "You're *hit* {sound:hit.wav}. You loose {HP_loose} HP. {sound:blip.wav}You **die**!",
	},
};

const FRENCH_DEFAULT = "T'es *touché* {sound:hit.wav}. Tu perds {HP_loose} HP. {sound:blip.wav}Tu **meurs** !";

const CUES: ReadonlyArray<string | null> = ['hit.wav', 'blip.wav', 'pickup.wav', null];

class StringEditorScene extends Scene2D {
	private fr: I18n.Catalog = { locale: 'fr', direction: 'ltr', messages: { 'player.hit.log': FRENCH_DEFAULT } };
	private hp = 12;
	private previewLocale: 'en' | 'fr' = 'fr';
	private cueIndex = 0;
	private editing = false;
	private editorInput!: HTMLTextAreaElement;
	private previewCues: I18n.InlineSoundCue[] = [];
	private nextPreviewCue = 0;
	private previewElapsed = 0;

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
	private onEditorInput = (): void => {
		this.fr.messages['player.hit.log'] = this.editorInput.value;
		this.refresh();
	};
	private onEditorKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape') {
			event.preventDefault();
			this.setEditing(false);
		} else if (event.key === 'Enter') {
			event.preventDefault();
		}
	};
	private onEditorKeyUp = (): void => {
		if (this.editing) this.refresh();
	};

	override create(): void {
		I18n.setBase(BASE);
		I18n.setActive(this.fr);
		for (const path of ['blip.wav', 'hit.wav', 'pickup.wav']) {
			this.sounds.set(path, new Sound(path, { volume: 0.8 }));
		}

		const game = Game.current;
		const margin = 24;
		const half = (game.width - margin * 2 - 16) / 2;

		const title = new Label({
			text: 'String editor: reference, translation, rendered line',
			color: theme().color.text,
			size: 17,
		});
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

		this.editorInput = document.createElement('textarea');
		this.editorInput.setAttribute('aria-label', 'French translation editor');
		Object.assign(this.editorInput.style, {
			position: 'fixed',
			left: '-10000px',
			top: '0',
			width: '1px',
			height: '1px',
			opacity: '0',
			pointerEvents: 'none',
		});
		this.editorInput.addEventListener('input', this.onEditorInput);
		this.editorInput.addEventListener('keydown', this.onEditorKeyDown);
		this.editorInput.addEventListener('keyup', this.onEditorKeyUp);
		document.body.appendChild(this.editorInput);

		const previewHead = new Label({ text: 'Rendered preview', color: theme().color.textDim, size: 13 });
		previewHead.position.set(margin, 132);
		this.stage.addChild(previewHead);

		this.preview = new RichLabel({
			text: '',
			color: theme().color.text,
			size: 19,
			wrapWidth: game.width - margin * 2,
		});
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
			text: 'Type, use arrows, or paste Unicode text into the FR pane (Esc stops). Play matches each cue to its sentence.',
			color: theme().color.textDim,
			size: 13,
		});
		hint.position.set(margin, 312);
		this.stage.addChild(hint);

		this.refresh();
	}

	override destroy(): void {
		this.editorInput.removeEventListener('input', this.onEditorInput);
		this.editorInput.removeEventListener('keydown', this.onEditorKeyDown);
		this.editorInput.removeEventListener('keyup', this.onEditorKeyUp);
		this.editorInput.remove();
		super.destroy();
	}

	override update(dt: number): void {
		this.preview.updateReveal(dt);
		if (this.previewCues.length > 0) {
			this.previewElapsed += dt;
			this.playPreviewCues(Math.floor(this.previewElapsed * 60));
		}
	}

	private message(): I18n.SemanticMessage {
		return { type: 'player.hit', params: { HP_loose: this.hp } };
	}

	private rendered(): string {
		return this.formatter.format(this.message(), 'log');
	}

	private refresh(): void {
		this.previewCues = [];
		this.nextPreviewCue = 0;
		this.previewElapsed = 0;
		I18n.setActive(this.previewLocale === 'fr' ? this.fr : BASE);
		this.enPane.setText(BASE.messages['player.hit.log'] as string);
		const frText = this.fr.messages['player.hit.log'] as string;
		if (this.editing) {
			if (this.editorInput.value !== frText) this.editorInput.value = frText;
			const caret = Math.max(0, Math.min(this.editorInput.selectionStart ?? frText.length, frText.length));
			this.editorInput.setSelectionRange(caret, caret);
			this.frPane.setText(`${frText.slice(0, caret)}▌${frText.slice(caret)}`);
		} else {
			this.frPane.setText(frText);
		}
		this.preview.setText(I18n.parseSoundMarkers(this.rendered()).text);

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
		this.cueButton.setText(`inline cue: ${CUES[this.cueIndex] ?? 'none'}`);
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
		const text = this.fr.messages['player.hit.log'] as string;
		this.fr.messages['player.hit.log'] = text.replace(/\{sound:[^{}]+\}/, cue === null ? '' : `{sound:${cue}}`);
		this.refresh();
	}

	private setEditing(editing: boolean): void {
		this.editing = editing;
		if (editing) {
			const text = this.fr.messages['player.hit.log'] as string;
			this.editorInput.value = text;
			this.editorInput.focus();
			this.editorInput.setSelectionRange(text.length, text.length);
		} else {
			this.editorInput.blur();
		}
		this.refresh();
	}

	private playLine(): void {
		const parsed = I18n.parseSoundMarkers(this.rendered());
		this.preview.showProgressive(parsed.text, 60);
		this.previewCues = parsed.cues;
		this.nextPreviewCue = 0;
		this.previewElapsed = 0;
		this.playPreviewCues(0);
	}

	private playPreviewCues(visibleCharacters: number): void {
		while (
			this.nextPreviewCue < this.previewCues.length &&
			this.previewCues[this.nextPreviewCue].index <= visibleCharacters
		) {
			const cue = this.previewCues[this.nextPreviewCue];
			this.sounds.get(cue.path)?.play();
			this.nextPreviewCue++;
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
	document.body.insertAdjacentHTML(
		'afterbegin',
		`<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`,
	);
});
