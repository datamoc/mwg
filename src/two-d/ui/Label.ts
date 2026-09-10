import { Text, TextStyle } from 'pixi.js';
import { theme, themeChanged, type Theme } from './theme.ts';
import { normalizeTextOptions, themedAlign, type ThemedTextOptions } from './themedText.ts';
import { startReveal, advanceReveal, completeReveal, type RevealState } from './reveal.ts';

export interface LabelOptions extends ThemedTextOptions {
	/** Outline in texture pixels, useful for text over artwork. */
	stroke?: { color: number; width: number };
	/** Text texture resolution; omit to use the renderer default. */
	resolution?: number;
	roundPixels?: boolean;
}

/**
 * A piece of text, styled from the theme.
 *
 * This is a thin wrapper over Pixi's `Text`, and its job is to stop every call site from
 * repeating a style object. Pixi renders text to its own texture, so changing the string
 * costs a re-render: cheap enough for a label, wasteful for something updated every
 * frame, where a value that only changes on whole numbers should be guarded.
 *
 * @example
 * ```ts
 * import { Label } from '@datamoc/mw_games/two-d/ui';
 *
 * const gold = new Label({ text: 'Gold: 0', color: 0xffe680 });
 *
 * gold.setText('Gold: 50'); // skips the re-render if the string is unchanged
 * gold.setColor(0xff4444); // flash red on a loss, say
 * ```
 */
export class Label extends Text {
	private readonly opts: LabelOptions;
	private readonly themeListener = (t: Theme) => this.restyle(t);
	private revealSource: string | null = null;
	private reveal: RevealState | null = null;

	constructor(options: LabelOptions | string = {}) {
		const opts = normalizeTextOptions(options);
		const t = theme();

		super({
			text: opts.text ?? '',
			resolution: opts.resolution,
			roundPixels: opts.roundPixels,
			style: new TextStyle({
				fontFamily: t.font.family,
				stroke: opts.stroke,
				fontSize: opts.size ?? t.font.size,
				fontWeight: opts.bold ? 'bold' : 'normal',
				fill: opts.color ?? t.color.text,
				lineHeight: (opts.size ?? t.font.size) * t.font.lineHeight,
				align: themedAlign(opts, t),
				wordWrap: opts.wrapWidth !== undefined,
				wordWrapWidth: opts.wrapWidth ?? 0,
				//without this a long unbroken word overflows its window instead of wrapping
				breakWords: true,
			}),
		});

		this.opts = opts;
		themeChanged.add(this.themeListener);
	}

	/** changes the colour without rebuilding the style object */
	setColor(color: number): void {
		this.style.fill = color;
	}

	/** avoids the re-render when the text has not actually changed */
	setText(value: string): void {
		//an instant set cancels any reveal in progress - the two never interleave
		this.revealSource = null;
		this.reveal = null;
		if (this.text !== value) this.text = value;
	}

	/**
	 * Shows `value` progressively, `speed` characters per second. The game drives the
	 * reveal by calling `updateReveal(dt)` each frame (a label owns no update loop of
	 * its own, unlike a `MessageBox` on a `WindowStack`); `completeReveal` skips to the
	 * end, for a confirm press mid-reveal.
	 */
	showProgressive(value: string, speed?: number): void {
		this.revealSource = value;
		this.reveal = startReveal(value.length, speed);
		this.renderRevealed();
	}

	/** advances an in-progress reveal; returns true when nothing is left to show */
	updateReveal(dt: number): boolean {
		if (!this.reveal) return true;
		const done = advanceReveal(this.reveal, dt);
		this.renderRevealed();
		return done;
	}

	/** shows the whole in-progress text at once */
	completeReveal(): void {
		if (!this.reveal) return;
		completeReveal(this.reveal);
		this.renderRevealed();
	}

	private renderRevealed(): void {
		if (!this.reveal || this.revealSource === null) return;
		//through the field rather than setText, which cancels a reveal in progress
		const visible = this.revealSource.slice(0, Math.floor(this.reveal.revealed));
		if (this.text !== visible) this.text = visible;
	}

	/**
	 * Reapplies whichever style fields were never given an explicit option, so an
	 * explicit `color`/`size` a game passed in survives a theme change untouched while
	 * anything left to the theme's own defaults picks up the new one.
	 */
	private restyle(t: Theme): void {
		this.style.fontFamily = t.font.family;
		if (this.opts.color === undefined) this.style.fill = t.color.text;
		if (this.opts.size === undefined) {
			this.style.fontSize = t.font.size;
			this.style.lineHeight = t.font.size * t.font.lineHeight;
		}
		if (this.opts.align === undefined) this.style.align = themedAlign(this.opts, t);
	}

	override destroy(options?: Parameters<Text['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
