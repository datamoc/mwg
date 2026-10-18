import { Container } from 'pixi.js';
import type { PointerPoint, PointerTracker } from '../../core/Input.ts';
import { Button } from './Button.ts';
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
 *
 * @example
 * ```ts
 * import { Tooltip } from '@datamoc/mwg/two-d/ui';
 *
 * const tooltip = new Tooltip({ delay: 0 });
 * tooltip.setViewport(800, 600);
 *
 * tooltip.hover('Strength: raises attack', 120, 80);
 * // called every frame from the scene's own update(dt); returns true once, the frame it appears
 * console.log(tooltip.update(1 / 60)); // true - delay is 0, so it shows on the first frame
 *
 * tooltip.leave(); // the pointer moved off the stat row
 * ```
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

	private pending: { text: string; x: number; y: number; delay: number } | null = null;
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
	 * `delay` replaces the tooltip's own wait for this one call (a touch long-press waits longer than a hover).
	 *
	 * Safe to call every frame with the same arguments: the delay keeps counting rather than
	 * restarting. Calling it with *different* text restarts the wait, so sweeping across a row
	 * of icons shows the one the pointer settles on rather than the first one it crossed.
	 */
	hover(text: string, x: number, y: number, delay = this.delay): void {
		if (this.pending && this.pending.text === text) {
			this.pending.x = x;
			this.pending.y = y;
			if (this.visible) this.place();
			return;
		}

		this.pending = { text, x, y, delay };
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
		if (this.waited < this.pending.delay) return false;

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

/** a rectangle on screen that has something to explain, in the same space as the pointer positions fed to the host */
export interface TooltipTarget {
	bounds(): { x: number; y: number; width: number; height: number };
	/** what to say now, or undefined for nothing */
	text(): string | undefined;
	/** false while the target is hidden; a hidden one explains nothing. True when omitted */
	active?(): boolean;
}

export interface TooltipHostOptions {
	/** the tooltip to drive; a default one when omitted */
	tooltip?: Tooltip;
	/** seconds a finger or button must rest before the tooltip shows on a press; 0.5 when omitted */
	longPress?: number;
}

/**
 * Drives one `Tooltip` from rectangles instead of from each widget's own pointer events, which is
 * what makes it work in the two places hover cannot reach: on a touch screen (a press that rests
 * for `longPress` seconds shows the text, and releasing hides it) and over a disabled `Button`,
 * which has no pointer events to receive (the host tests the button's bounds itself, and a greyed-out
 * button is exactly the one worth explaining).
 *
 * Feed it pointer positions with `pointerMove`, `pointerDown` and `pointerUp` (or `attach` a
 * `PointerTracker`), and call `update(dt)` each frame. The later a target was added, the higher it
 * counts when targets overlap.
 *
 * @example
 * ```ts
 * import { Button, TooltipHost } from '@datamoc/mwg/two-d/ui';
 *
 * const host = new TooltipHost({ longPress: 0.4 });
 * host.tooltip.setViewport(800, 600);
 *
 * const test = new Button({ width: 80, height: 28, text: 'Test', disabled: true,
 * 	tooltip: () => 'Build a road across the gap first' });
 * host.addButton(test);
 *
 * host.pointerMove(10, 10); // over the disabled button: the text still shows after the hover delay
 * ```
 */
export class TooltipHost extends Container {
	readonly tooltip: Tooltip;
	private readonly longPress: number;
	private readonly targets: TooltipTarget[] = [];

	constructor(options: TooltipHostOptions = {}) {
		super();
		this.tooltip = options.tooltip ?? new Tooltip();
		this.longPress = options.longPress ?? 0.5;
		this.addChild(this.tooltip);
	}

	/** @returns a function that removes the target again */
	add(target: TooltipTarget): () => void {
		this.targets.push(target);
		return () => {
			const at = this.targets.indexOf(target);
			if (at >= 0) this.targets.splice(at, 1);
		};
	}

	/** a button's own bounds and `tooltip`, whether or not the button is disabled */
	addButton(button: Button): () => void {
		return this.add({
			bounds: () => {
				const rect = button.getBounds();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			},
			text: () => button.tooltip,
			active: () => {
				for (let node: Container | null = button; node; node = node.parent) if (!node.visible) return false;
				return true;
			},
		});
	}

	private targetAt(x: number, y: number): TooltipTarget | null {
		for (let index = this.targets.length - 1; index >= 0; index--) {
			const target = this.targets[index];
			if (target.active && !target.active()) continue;
			const rect = target.bounds();
			if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
				return target.text() === undefined ? null : target;
			}
		}
		return null;
	}

	/** a pointer with no button down moved: the usual hover */
	pointerMove(x: number, y: number): void {
		const text = this.targetAt(x, y)?.text();
		if (text) this.tooltip.hover(text, x, y);
		else this.tooltip.leave();
	}

	/** a finger or button went down: the tooltip shows once it has rested for `longPress` */
	pointerDown(x: number, y: number): void {
		const text = this.targetAt(x, y)?.text();
		if (text) this.tooltip.hover(text, x, y, this.longPress);
		else this.tooltip.leave();
	}

	/** the finger or button came up */
	pointerUp(): void {
		this.tooltip.leave();
	}

	/** wires a `PointerTracker` (`Input.attachPointer`) to the host; returns the function that unwires it */
	attach(pointer: PointerTracker): () => void {
		const onMove = (p: PointerPoint): void => this.pointerMove(p.x, p.y);
		const onDown = (p: PointerPoint): void => this.pointerDown(p.x, p.y);
		const onUp = (): void => this.pointerUp();
		pointer.move.add(onMove);
		pointer.down.add(onDown);
		pointer.up.add(onUp);
		return () => {
			pointer.move.remove(onMove);
			pointer.down.remove(onDown);
			pointer.up.remove(onUp);
		};
	}

	/** @returns true on the frame the tooltip appears, as `Tooltip.update` does */
	update(dt: number): boolean {
		return this.tooltip.update(dt);
	}
}
