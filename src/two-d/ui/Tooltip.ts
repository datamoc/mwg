import { Container } from 'pixi.js';
import { Label } from './Label.ts';
import { Window } from './Window.ts';
import { theme } from './theme.ts';

export interface TooltipOptions {
	/** seconds the pointer must rest before the tooltip appears; defaults to 0.4 */
	delay?: number;

	/** width at which the text wraps; defaults to 200 */
	maxWidth?: number;

	/** where the panel sits relative to the anchor point, before clamping; defaults to 12,16 */
	offset?: { x: number; y: number };

	/** kept this far from the viewport edge when clamped; defaults to 4 */
	margin?: number;
}

/**
 * The hover explanation every dense interface needs: what this item does, what this stat
 * means, why this button is disabled.
 *
 * The delay is counted in `update(dt)` rather than a `setTimeout`, the same choice `IconGrid`
 * already made for long-press and `WindowStack` for its own timing: a frame-driven counter is
 * exactly as testable as it is correct, and it cannot fire after the scene that owned it has
 * gone away. The panel itself is a non-modal `Window`, so a tooltip inherits the theme's
 * frame, padding and live restyling rather than drawing a second kind of panel that would
 * drift from every other one the moment a game sets `theme.panel`.
 *
 * Positioning is the other half: a tooltip near the right or bottom edge flips back inside the
 * viewport instead of being cut off, which is why `setViewport` has to be called from the
 * owning scene's own `resize`.
 */
export class Tooltip extends Container {
	private readonly delay: number;
	private readonly maxWidth: number;
	private readonly offsetX: number;
	private readonly offsetY: number;
	private readonly margin: number;

	private readonly panel: Window;
	private readonly body: Label;

	private viewWidth = 0;
	private viewHeight = 0;

	/**
	 * The panel size as this widget decided it, rather than read back off Pixi.
	 *
	 * Asking a `Container` for its `width` walks its children's bounds, which for a text child
	 * means measuring through a canvas - so re-deriving a size already computed here would both
	 * cost a measure per frame and make the whole layout untestable without a DOM.
	 */
	private panelWidth = 0;
	private panelHeight = 0;

	private pending: { text: string; x: number; y: number } | null = null;
	private waited = 0;

	constructor(options: TooltipOptions = {}) {
		super();
		this.delay = options.delay ?? 0.4;
		this.maxWidth = options.maxWidth ?? 200;
		this.offsetX = options.offset?.x ?? 12;
		this.offsetY = options.offset?.y ?? 16;
		this.margin = options.margin ?? 4;

		this.panel = new Window({ width: 0, height: 0, modal: false, closable: false, dims: false });
		this.body = new Label({ text: '', wrapWidth: this.maxWidth });
		this.panel.content.addChild(this.body);
		this.addChild(this.panel);

		this.visible = false;
	}

	/** call from the owning scene's `resize`, so edge clamping knows what it is clamping to */
	setViewport(width: number, height: number): void {
		this.viewWidth = width;
		this.viewHeight = height;
		if (this.visible) this.place();
	}

	/**
	 * The pointer is resting on something with `text` to explain, at `x`/`y`.
	 *
	 * Safe to call every frame with the same arguments: the delay keeps counting rather than
	 * restarting. Calling it with *different* text restarts the wait, so sweeping across a row
	 * of icons shows the one the pointer settles on rather than the first one it crossed.
	 */
	hover(text: string, x: number, y: number): void {
		if (this.pending && this.pending.text === text) {
			this.pending.x = x;
			this.pending.y = y;
			if (this.visible) this.place();
			return;
		}

		this.pending = { text, x, y };
		this.waited = 0;
		this.visible = false;
	}

	/** the pointer left: cancels a pending tooltip and hides a shown one */
	leave(): void {
		this.pending = null;
		this.waited = 0;
		this.visible = false;
	}

	get isShowing(): boolean {
		return this.visible;
	}

	/** the text currently shown, or waiting out its delay; null when nothing is hovered */
	get text(): string | null {
		return this.pending?.text ?? null;
	}

	/** where the panel actually sits, after edge clamping - the value a layout test reads */
	get panelPosition(): { x: number; y: number } {
		return { x: this.panel.x, y: this.panel.y };
	}

	get size(): { width: number; height: number } {
		return { width: this.panelWidth, height: this.panelHeight };
	}

	/** @returns true on the frame the tooltip becomes visible, for a game that wants to cue a sound */
	update(dt: number): boolean {
		if (!this.pending || this.visible) return false;

		this.waited += dt;
		if (this.waited < this.delay) return false;

		this.body.setText(this.pending.text);

		const t = theme();
		//the frame's own inset is doubled: the panel pads its content on every side
		const inset = (t.panel ? t.panelBorder : 2) + t.padding;
		const text = this.measureBody();
		this.panelWidth = Math.ceil(text.width) + inset * 2;
		this.panelHeight = Math.ceil(text.height) + inset * 2;
		this.panel.resize(this.panelWidth, this.panelHeight);

		this.visible = true;
		this.place();
		return true;
	}

	/**
	 * How big the wrapped text is, which decides the panel's size.
	 *
	 * Its own method purely so it can be overridden: Pixi measures text through a canvas, so
	 * reading a `Label`'s width needs a DOM and nothing here can size itself under
	 * `node --test`. A test subclasses this and returns a fixed size, which leaves the parts
	 * actually worth testing (the hover delay, the edge flip, the clamp) fully exercised - the
	 * same subclass seam `StageScript`'s tests already use in place of stubbing Pixi.
	 */
	protected measureBody(): { width: number; height: number } {
		return { width: this.body.width, height: this.body.height };
	}

	/** offsets from the anchor, then pulls back inside the viewport if that would overflow it */
	private place(): void {
		const anchor = this.pending;
		if (!anchor) return;

		const width = this.panelWidth;
		const height = this.panelHeight;

		let x = anchor.x + this.offsetX;
		let y = anchor.y + this.offsetY;

		if (this.viewWidth > 0) {
			//flip to the other side of the pointer rather than merely sliding, so the tooltip
			//never ends up covering the very thing it is explaining
			if (x + width + this.margin > this.viewWidth) x = anchor.x - this.offsetX - width;
			x = Math.max(this.margin, Math.min(x, Math.max(this.margin, this.viewWidth - width - this.margin)));
		}
		if (this.viewHeight > 0) {
			if (y + height + this.margin > this.viewHeight) y = anchor.y - this.offsetY - height;
			y = Math.max(this.margin, Math.min(y, Math.max(this.margin, this.viewHeight - height - this.margin)));
		}

		this.panel.x = x;
		this.panel.y = y;
	}
}
