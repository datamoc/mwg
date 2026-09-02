import { Container, Graphics } from 'pixi.js';
import { Signal } from '../core/Signal.ts';
import type { Action } from '../core/Input.ts';
import { NinePatch } from './NinePatch.ts';
import { Label } from './Label.ts';
import { theme } from './theme.ts';

export interface WindowOptions {
	width: number;
	height: number;
	title?: string;

	/** a modal window swallows input; anything below it stops responding */
	modal?: boolean;

	/** whether `cancel` closes it; false for a window that must be answered */
	closable?: boolean;

	/**
	 * Whether the world behind is dimmed. Defaults to true for a modal window.
	 *
	 * A dialogue box over a conversation scene is the case for false: it takes the input
	 * like any modal, but the scene behind it is what the player is meant to be looking at,
	 * so dimming it would be backwards.
	 */
	dims?: boolean;

	/** where the stack puts it; 'bottom' is the usual place for a dialogue box */
	anchor?: 'center' | 'bottom' | 'top';
}

/**
 * A panel with a frame, a title and a content area.
 *
 * Windows are the interface: inventory, dialogue, character sheets, confirmations. They
 * live in a `WindowStack`, which decides which one has the keyboard.
 *
 * Contents go in `content`, whose origin is already inset past the frame and padding, so a
 * child placed at 0,0 sits correctly whatever the theme's border is.
 */
export class Window extends Container {
	readonly content = new Container();
	readonly onClose = new Signal<void>();

	readonly modal: boolean;
	readonly closable: boolean;
	readonly dims: boolean;
	readonly anchor: 'center' | 'bottom' | 'top';

	private background: NinePatch | Graphics;
	private titleLabel: Label | null = null;

	private innerWidth = 0;
	private innerHeight = 0;

	constructor(options: WindowOptions) {
		super();

		const t = theme();
		this.modal = options.modal ?? true;
		this.closable = options.closable ?? true;
		this.dims = options.dims ?? this.modal;
		this.anchor = options.anchor ?? 'center';

		if (t.panel) {
			this.background = new NinePatch(t.panel, { border: t.panelBorder });
		} else {
			//no panel texture: a flat rounded rectangle, so a game is usable before it has
			//any interface art at all
			this.background = new Graphics();
		}
		this.addChild(this.background);

		if (options.title !== undefined) {
			this.titleLabel = new Label({ text: options.title, color: t.color.textHighlight, bold: true });
			this.addChild(this.titleLabel);
		}

		this.addChild(this.content);
		this.resize(options.width, options.height);
	}

	resize(width: number, height: number): void {
		const t = theme();
		const border = this.background instanceof NinePatch ? this.background.border.left : 2;
		const inset = border + t.padding;

		if (this.background instanceof NinePatch) {
			this.background.resize(width, height);
		} else {
			this.background
				.clear()
				.roundRect(0, 0, width, height, 4)
				.fill({ color: t.color.panelFill })
				.stroke({ color: t.color.panelBorder, width: 1 });
		}

		let contentTop = inset;
		if (this.titleLabel) {
			this.titleLabel.x = inset;
			this.titleLabel.y = inset;
			contentTop = inset + this.titleLabel.height + t.padding;
		}

		this.content.x = inset;
		this.content.y = contentTop;

		this.innerWidth = Math.max(0, width - inset * 2);
		this.innerHeight = Math.max(0, height - contentTop - inset);
	}

	/** the space available inside the frame, which is what contents should lay out against */
	get contentWidth(): number {
		return this.innerWidth;
	}

	get contentHeight(): number {
		return this.innerHeight;
	}

	setTitle(text: string): void {
		this.titleLabel?.setText(text);
	}

	/**
	 * A widget offered actions before the window itself sees them.
	 *
	 * Set it to the list or field the window exists to show. Without it, every window
	 * holding a widget has to override `handleAction` just to forward, which is noise at
	 * best and, done by assigning over the method, a trap.
	 */
	delegate: { handleAction(action: Action): boolean } | null = null;

	/**
	 * Offered every action while this window is on top of the stack.
	 *
	 * @returns true if the window used it, which stops it going any further down
	 */
	handleAction(action: Action): boolean {
		if (this.delegate?.handleAction(action)) return true;

		if (action === 'cancel' && this.closable) {
			this.close();
			return true;
		}
		return false;
	}

	/** called each frame while this window is the top of the stack */
	update(_dt: number): void {
		//most windows are static and need nothing here
	}

	close(): void {
		this.onClose.dispatch();
		this.parent?.removeChild(this);
		this.destroy({ children: true });
	}

	/** positions the window in a viewport of the given size, per its anchor */
	place(viewportWidth: number, viewportHeight: number): void {
		const bounds = this.getLocalBounds();
		const margin = theme().padding * 2;

		this.x = Math.round((viewportWidth - bounds.width) / 2);

		if (this.anchor === 'bottom') {
			this.y = Math.round(viewportHeight - bounds.height - margin);
		} else if (this.anchor === 'top') {
			this.y = margin;
		} else {
			this.y = Math.round((viewportHeight - bounds.height) / 2);
		}
	}
}
