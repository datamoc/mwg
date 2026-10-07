import { Graphics } from 'pixi.js';
import { onComposition, onText, type Action, type CompositionInput } from '../../core/Input.ts';
import { TextModel } from './TextModel.ts';
import { Window } from './Window.ts';
import { Label } from './Label.ts';
import { theme, themeChanged } from './theme.ts';
import { screenReader, type ScreenReader } from './a11y.ts';
import { OnScreenKeyboard, type KeyboardLayout } from './OnScreenKeyboard.ts';

/** seconds per caret blink half-cycle */
const BLINK_PERIOD = 0.5;

export interface TextPromptOptions {
	width: number;
	height: number;

	/** the window title; also announced by `Window` itself */
	title?: string;

	/** the one-line question above the field, announced politely on open */
	message?: string;

	/** the field's starting text; the caret starts after it */
	initialValue?: string;

	/** the most characters the field will hold; unlimited when omitted */
	maxLength?: number;
	/**
	 * Rows of keys rendered beneath the field for pointer-only devices, feeding the same
	 * `onText`/`onAction` paths a physical key travels. Omit on a keyboard-first platform.
	 */
	keyboard?: KeyboardLayout;

	/**
	 * Decides whether the current value may be confirmed: return an error message to
	 * keep the prompt open, or null (or '') when the value is fine. Runs only on
	 * `confirm`, so typing never nags; the error clears on the next edit.
	 */
	validate?: (value: string) => string | null;

	/** called with the value, then the prompt closes */
	onConfirm: (value: string) => void;

	/** called on `cancel`, then the prompt closes; omit to just close */
	onCancel?: () => void;

	/** dim the world behind; true for a modal window, which this is */
	dims?: boolean;

	/**
	 * Whether a click under the prompt is swallowed rather than reaching the game
	 * behind it. On by default: a name not yet given is not something a stray click
	 * on the world should be able to act past.
	 */
	blocker?: boolean;

	/** where the stack puts the prompt */
	anchor?: 'center' | 'bottom' | 'top';

	/**
	 * Announce the message on open and a validation error on `confirm` through an
	 * `a11y.ScreenReader`. Default true; the calls are no-ops where there is no DOM.
	 */
	announce?: boolean;

	/** the reader announcements go to; the shared one by default, a fake in tests */
	announcer?: Pick<ScreenReader, 'announce'>;
}

/**
 * A modal single-line text field: a name entry, a save-slot label, a seed.
 *
 * Typing arrives through `core.Input`'s `onText`, which is the signal a free text field
 * listens to, so this plays no part in key bindings for characters: whatever the
 * platform turns a key press into lands in the field. Editing and movement arrive as
 * actions instead, which a game binds the way it binds everything else: `left`/`right`
 * move the caret, `backspace`/`delete` edit, `confirm` accepts subject to `validate`,
 * `cancel` gives up. The prompt is modal and swallows each of those while open, so
 * the game underneath never walks away mid-name.
 *
 * `onText` wakes the most recently added listener first, so when two prompts overlap
 * the topmost one gets the keystrokes - the same order the window stack shows them in.
 *
 * An in-progress IME composition previews below the field and only becomes value on
 * commit, so CJK, dead keys and emoji pickers type through the same path the DOM gives
 * every other input rather than through a game-specific workaround.
 *
 * @example
 * ```ts
 * import { TextPrompt } from '@datamoc/mw_games/two-d/ui';
 *
 * const prompt = new TextPrompt({
 * 	width: 320,
 * 	height: 140,
 * 	title: 'New hero',
 * 	message: 'Name your hero (Enter keeps it)',
 * 	maxLength: 12,
 * 	validate: (value) => (value.trim() === '' ? 'Give them a name first.' : null),
 * 	onConfirm: (value) => console.log('named', value),
 * });
 * ```
 */
export class TextPrompt extends Window {
	private readonly model: TextModel;
	private readonly validate?: (value: string) => string | null;
	private readonly onConfirm: (value: string) => void;
	private readonly onCancel?: () => void;
	private readonly announce: boolean;
	private readonly announcer: Pick<ScreenReader, 'announce'>;

	private preview = '';
	private promptError: string | null = null;

	private readonly keyboard: OnScreenKeyboard | null = null;
	private messageLabel: Label | null = null;
	private valueLabel: Label;
	private previewLabel: Label;
	private errorLabel: Label;
	private caretBar = new Graphics();
	private readonly measurer = new Label();
	private readonly lineHeight: number;
	private readonly valueY: number;

	private canMeasureCaret = typeof document !== 'undefined';
	private blinkOn = true;
	private blinkElapsed = 0;

	private readonly promptThemeListener = () => this.restylePrompt();

	private readonly textListener = (text: string): boolean => {
		if (this.closed) return false;
		this.edit(() => this.model.insert(text));
		return true;
	};

	private readonly compositionListener = (input: CompositionInput): boolean => {
		if (this.closed) return false;
		if (input.phase === 'end') {
			this.edit(() => {
				this.preview = '';
				this.model.insert(input.text);
			});
		} else {
			this.preview = input.phase === 'start' ? '' : input.text;
			this.render();
		}
		return true;
	};

	constructor(options: TextPromptOptions) {
		super({
			width: options.width,
			height: options.height,
			title: options.title,
			modal: true,
			closable: false,
			dims: options.dims,
			blocker: options.blocker ?? true,
			anchor: options.anchor ?? 'center',
		});

		this.model = new TextModel({ value: options.initialValue ?? '', maxLength: options.maxLength });
		this.validate = options.validate;
		this.onConfirm = options.onConfirm;
		this.onCancel = options.onCancel;
		this.announce = options.announce ?? true;
		this.announcer = options.announcer ?? screenReader;

		const t = theme();
		this.lineHeight = t.font.size * t.font.lineHeight;
		const gap = t.spacing;

		if (options.message !== undefined) {
			this.messageLabel = new Label({ text: options.message });
			this.content.addChild(this.messageLabel);
		}

		this.valueY = this.messageLabel ? this.lineHeight + gap : 0;
		this.valueLabel = new Label();
		this.valueLabel.y = this.valueY;
		this.content.addChild(this.valueLabel);

		this.previewLabel = new Label({ color: t.color.textDim });
		this.previewLabel.y = this.valueY + this.lineHeight + gap;
		this.content.addChild(this.previewLabel);

		this.errorLabel = new Label({ color: t.color.textHighlight });
		this.errorLabel.y = this.previewLabel.y + this.lineHeight + gap;
		this.content.addChild(this.errorLabel);

		this.content.addChild(this.caretBar);

		//the touch half: rows of keys under the field, sized into the window
		if (options.keyboard) {
			this.keyboard = new OnScreenKeyboard(options.keyboard, { width: this.contentWidth });
			this.keyboard.y = this.errorLabel.y + this.lineHeight + gap;
			this.content.addChild(this.keyboard);
			this.resize(options.width, options.height + this.keyboard.contentHeight + gap);
		}

		onText.add(this.textListener);
		onComposition.add(this.compositionListener);
		themeChanged.add(this.promptThemeListener);

		this.render();
		if (this.announce && options.message !== undefined) this.announcer.announce(options.message);
	}

	/** the field's current text */
	get value(): string {
		return this.model.value;
	}

	/** the caret's index into `value` */
	get caretIndex(): number {
		return this.model.caret;
	}

	/** the last validation error, or null when the value currently passes */
	get error(): string | null {
		return this.promptError;
	}

	override handleAction(action: Action): boolean {
		if (this.delegate) return super.handleAction(action);
		if (this.closed) return false;

		switch (action) {
			case 'left':
				this.model.moveCaret(-1);
				this.render();
				return true;
			case 'right':
				this.model.moveCaret(1);
				this.render();
				return true;
			case 'backspace':
				this.edit(() => this.model.backspace());
				return true;
			case 'delete':
				this.edit(() => this.model.deleteForward());
				return true;
			case 'confirm':
				this.confirm();
				return true;
			case 'cancel':
				this.onCancel?.();
				this.close();
				return true;
			default:
				return false;
		}
	}

	override update(dt: number): void {
		this.blinkElapsed += dt;
		if (this.blinkElapsed < BLINK_PERIOD) return;
		this.blinkElapsed = 0;
		this.blinkOn = !this.blinkOn;
		this.caretBar.visible = this.blinkOn && this.canMeasureCaret;
	}

	override destroy(options?: Parameters<Window['destroy']>[0]): void {
		onText.remove(this.textListener);
		onComposition.remove(this.compositionListener);
		themeChanged.remove(this.promptThemeListener);
		this.measurer.destroy();
		super.destroy(options);
	}

	/** runs an edit, dropping a stale validation error only when the text changed */
	private edit(run: () => void): void {
		const before = this.model.value;
		run();
		if (this.model.value !== before) this.promptError = null;
		this.render();
	}

	private confirm(): void {
		const problem = this.validate?.(this.model.value) ?? null;
		if (problem) {
			this.promptError = problem;
			this.render();
			if (this.announce) this.announcer.announce(problem, { assertive: true });
			return;
		}
		this.onConfirm(this.model.value);
		this.close();
	}

	private restylePrompt(): void {
		const t = theme();
		this.previewLabel.setColor(t.color.textDim);
		this.errorLabel.setColor(t.color.textHighlight);
		this.render();
	}

	private render(): void {
		this.valueLabel.setText(this.model.value);

		//the caret sits after the text before it, measured through a label that is never
		//added to the scene: reading any width needs a canvas, which `node --test` has
		//not got, so where there is no document the position is unknowable and the caret
		//stays hidden rather than guessing
		this.measurer.setText(this.model.value.slice(0, this.model.caret));
		let caretX = 0;
		if (this.canMeasureCaret) {
			try {
				caretX = this.measurer.width;
			} catch {
				this.canMeasureCaret = false;
			}
		}
		this.caretBar
			.clear()
			.rect(this.valueLabel.x + caretX, this.valueY, 2, this.lineHeight)
			.fill({ color: theme().color.text });
		this.caretBar.visible = this.blinkOn && this.canMeasureCaret;

		this.previewLabel.setText(this.preview);
		this.previewLabel.visible = this.preview.length > 0;

		this.errorLabel.setText(this.promptError ?? '');
		this.errorLabel.visible = this.promptError !== null;
	}
}
