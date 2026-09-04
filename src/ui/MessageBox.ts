import { Container, Sprite, type Texture } from 'pixi.js';
import type { Action } from '../core/Input.ts';
import { Window } from './Window.ts';
import { Label } from './Label.ts';
import { ListView, type ListItem } from './ListView.ts';
import { theme, themeChanged } from './theme.ts';

export interface MessagePage {
	text: string;

	/** who is speaking, drawn above the text */
	speaker?: string;

	/** a portrait drawn to the left of the text */
	portrait?: Texture;
}

export interface Choice {
	text: string;
	value?: unknown;
	disabled?: boolean;
}

export interface MessageBoxOptions {
	width: number;
	height: number;
	pages: Array<MessagePage | string>;

	/** characters revealed per second; 0 shows each page at once */
	speed?: number;

	/** offered after the last page */
	choices?: Choice[];

	/** called with the chosen value, or undefined when there were no choices */
	onDone?: (chosen: unknown) => void;

	/** dim the world behind; false when the scene behind is the point, as in a dialogue */
	dims?: boolean;

	/** where the stack puts the box */
	anchor?: 'center' | 'bottom' | 'top';

	/**
	 * `'adv'` (the default) clears and redraws the box for each page, the way this class
	 * has always worked. `'nvl'` is Ren'Py's other display mode: every page's text stays
	 * on screen, accumulating into one growing block instead of being replaced - the same
	 * script data, presented as a page of prose instead of a strip of speech bubbles.
	 */
	mode?: 'adv' | 'nvl';

	/**
	 * Seconds after a page's text finishes revealing before it advances on its own, as if
	 * `confirm` had been pressed. Never applies once choices are on screen - a choice
	 * always waits for a real answer. Omit to require `confirm` for every page, the
	 * default.
	 */
	autoAdvance?: number;
}

/**
 * The dialogue box.
 *
 * It reveals text a character at a time, advances page by page on `confirm`, and can end
 * on a set of choices. Pressing `confirm` while text is still appearing completes the page
 * instead of advancing: the behaviour every player expects, and the reason the reveal is
 * driven by a character count rather than by animating the label.
 *
 * This is the one window that is not closable by `cancel`: a conversation ends when it
 * ends, or a cutscene would be left half-run.
 */
export class MessageBox extends Window {
	private pages: MessagePage[];
	private pageIndex = 0;

	private speed: number;
	private revealed = 0;
	private mode: 'adv' | 'nvl';

	private body: Label;
	private speakerLabel: Label;
	private portrait: Sprite | null = null;
	private portraitLayer = new Container();
	private prompt: Label;

	private choices: Choice[];
	private choiceList: ListView | null = null;

	private onDone: ((chosen: unknown) => void) | null;
	private finished = false;

	private autoAdvance?: number;
	private autoAdvanceElapsed = 0;

	private readonly messageThemeListener = () => this.restyleMessage();

	constructor(options: MessageBoxOptions) {
		super({
			width: options.width,
			height: options.height,
			modal: true,
			closable: false,
			dims: options.dims,
			anchor: options.anchor ?? 'bottom',
		});

		this.pages = options.pages.map((page) => (typeof page === 'string' ? { text: page } : page));
		this.speed = options.speed ?? 40;
		this.mode = options.mode ?? 'adv';
		this.autoAdvance = options.autoAdvance;
		this.choices = options.choices ?? [];
		this.onDone = options.onDone ?? null;

		const t = theme();

		this.content.addChild(this.portraitLayer);

		this.speakerLabel = new Label({ color: t.color.textHighlight, bold: true });
		this.content.addChild(this.speakerLabel);

		this.body = new Label({ wrapWidth: this.contentWidth });
		this.content.addChild(this.body);

		//a small hint that the box is waiting, rather than leaving the player guessing
		this.prompt = new Label({ text: '▼', color: t.color.textDim });
		this.prompt.visible = false;
		this.content.addChild(this.prompt);

		this.showPage(0);
		themeChanged.add(this.messageThemeListener);
	}

	/** recolours the parts `Window`'s own restyle does not know about: the speaker/prompt labels */
	private restyleMessage(): void {
		const t = theme();
		this.speakerLabel.setColor(t.color.textHighlight);
		this.prompt.setColor(t.color.textDim);
	}

	override destroy(options?: Parameters<Window['destroy']>[0]): void {
		themeChanged.remove(this.messageThemeListener);
		super.destroy(options);
	}

	private showPage(index: number): void {
		const page = this.pages[index];
		const t = theme();
		//in rtl the portrait moves to the right edge, the text runs from the left edge up
		//to it, and the "waiting" prompt moves to the opposite corner from ltr
		const rtl = t.direction === 'rtl';

		this.portraitLayer.removeChildren();
		this.portrait = null;

		let textLeft = 0;
		let textWidth = this.contentWidth;
		if (page.portrait) {
			this.portrait = new Sprite(page.portrait);
			if (rtl) this.portrait.x = this.contentWidth - this.portrait.width;
			this.portraitLayer.addChild(this.portrait);

			textWidth = this.contentWidth - this.portrait.width - t.padding;
			textLeft = rtl ? 0 : this.portrait.width + t.padding;
		}

		//nvl mode inlines the speaker into the accumulated text instead of a separate label,
		//since there is no longer one current page's worth of header to place
		this.speakerLabel.visible = this.mode === 'adv' && page.speaker !== undefined;
		this.speakerLabel.x = textLeft;
		this.speakerLabel.setText(page.speaker ?? '');

		this.body.x = textLeft;
		this.body.y = this.mode === 'adv' && page.speaker !== undefined ? this.speakerLabel.height + t.spacing : 0;
		this.body.style.wordWrapWidth = Math.max(16, textWidth);

		this.revealed = this.speed > 0 ? 0 : page.text.length;
		this.autoAdvanceElapsed = 0;
		this.renderBody();

		this.prompt.visible = false;
		this.prompt.x = rtl ? 0 : this.contentWidth - this.prompt.width;
		this.prompt.y = this.contentHeight - this.prompt.height;
	}

	/** the current page's revealed slice, formatted with its speaker inline in nvl mode */
	private renderBody(): void {
		if (this.mode === 'adv') {
			this.body.setText(this.pages[this.pageIndex].text.slice(0, Math.floor(this.revealed)));
			return;
		}

		//every earlier page is already fully revealed and stays on screen; only the newest
		//page's own reveal is still in progress
		const lines = this.pages.slice(0, this.pageIndex).map((page) => this.formatLine(page, page.text));
		const current = this.pages[this.pageIndex];
		lines.push(this.formatLine(current, current.text.slice(0, Math.floor(this.revealed))));
		this.body.setText(lines.join('\n\n'));
	}

	private formatLine(page: MessagePage, text: string): string {
		return page.speaker !== undefined ? `${page.speaker}: ${text}` : text;
	}

	private get pageComplete(): boolean {
		return this.revealed >= this.pages[this.pageIndex].text.length;
	}

	override update(dt: number): void {
		if (this.finished) return;

		if (!this.pageComplete) {
			this.revealed = Math.min(this.pages[this.pageIndex].text.length, this.revealed + this.speed * dt);
			this.renderBody();
			return;
		}

		//only prompt once there is something to advance to
		this.prompt.visible = !this.choiceList;

		//never applies with choices on screen - a choice always waits for a real answer,
		//the same rule `confirm` follows once `delegate` takes over
		if (this.autoAdvance === undefined || this.choiceList) return;

		this.autoAdvanceElapsed += dt;
		if (this.autoAdvanceElapsed >= this.autoAdvance) {
			this.autoAdvanceElapsed = 0;
			this.advance();
		}
	}

	override handleAction(action: Action): boolean {
		//once choices are up they own the input, which is what `delegate` expresses
		if (this.delegate) return super.handleAction(action);

		if (action !== 'confirm') return false;

		//first press completes the page, second advances: skipping the reveal must never
		//also skip the page, or fast readers lose lines
		if (!this.pageComplete) {
			this.revealed = this.pages[this.pageIndex].text.length;
			this.renderBody();
			return true;
		}

		this.advance();
		return true;
	}

	/** what a completed page does next: the next page, choices, or finishing - shared by `confirm` and `autoAdvance` */
	private advance(): void {
		if (this.pageIndex < this.pages.length - 1) {
			this.pageIndex++;
			this.showPage(this.pageIndex);
			return;
		}

		if (this.choices.length > 0) {
			this.showChoices();
			return;
		}

		this.finish(undefined);
	}

	private showChoices(): void {
		const t = theme();
		const items: ListItem[] = this.choices.map((choice) => ({
			text: choice.text,
			disabled: choice.disabled,
			value: choice.value ?? choice.text,
		}));

		const rowHeight = Math.ceil(t.font.size * t.font.lineHeight) + t.spacing;
		const height = items.length * rowHeight;

		//the choices go under the text, never over it. anchoring them to the bottom of the
		//box looks tidier until a page wraps to more lines than the author expected, and
		//then it silently eats the last line of what was said
		const top = this.body.y + this.body.height + t.padding;

		//if that does not fit, the box grows rather than clipping or overlapping: a
		//conversation must never become unreadable because a translation ran long
		const overflow = top + height - this.contentHeight;
		if (overflow > 0) {
			this.grow(overflow);
		}

		this.choiceList = new ListView({
			width: this.contentWidth,
			height,
			items,
			onSelect: (item) => this.finish(item.value),
		});
		this.choiceList.y = top;
		this.content.addChild(this.choiceList);
		this.delegate = this.choiceList;

		this.prompt.visible = false;
	}

	/** makes the box taller by `amount`, growing upwards so its foot stays put */
	private grow(amount: number): void {
		const bounds = this.getLocalBounds();
		this.resize(bounds.width, bounds.height + amount);
		//a box anchored to the bottom must not slide off it when choices appear
		this.y = Math.max(0, this.y - amount);
	}

	private finish(chosen: unknown): void {
		if (this.finished) return;
		this.finished = true;
		this.onDone?.(chosen);
		this.close();
	}
}
