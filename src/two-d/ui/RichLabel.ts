import { HTMLText, HTMLTextStyle, type HTMLTextStyleOptions } from 'pixi.js';
import { theme, themeChanged, type Theme } from './theme.ts';
import { normalizeTextOptions, themedAlign, type ThemedTextOptions } from './themedText.ts';
import { parseMarkdown, sliceSpans, stripMarkdown, type MarkdownSpan } from './markdown.ts';
import { startReveal, advanceReveal, completeReveal, type RevealState } from './reveal.ts';

export interface RichLabelOptions extends ThemedTextOptions {
	/** Text texture resolution; omit to use the renderer default. */
	resolution?: number;
	/**
	 * Pixi `HTMLText` tag styles for custom inline tags, the same option a bare `Text2D` takes:
	 * supplying `<quest>`, say, makes `<quest>...</quest>` a styled run rather than escaped text.
	 */
	tagStyles?: Record<string, HTMLTextStyleOptions>;
}

/**
 * A label that renders basic inline markdown (`**bold**`, `__bold__`, `*italic*`,
 * `_italic*`, combined `***both***`) through Pixi's `HTMLText`, which is what makes
 * mixed styles inside one string possible at all - plain `Text` styles the whole string
 * or nothing, which is exactly what `Label` stays for.
 *
 * Costs more than a `Label`: HTML text measures and re-renders through the DOM rather
 * than one canvas texture upload, so this is for descriptions, dialogue lines and help
 * bodies, not for a number updated every frame. For the same reason it does not suit
 * `MessageBox`'s typewriter reveal - a half-revealed `**bo` shows its markers literally.
 *
 * @example
 * ```ts
 * import { RichLabel } from '@datamoc/mw_games/two-d/ui';
 *
 * const blurb = new RichLabel({ text: 'Take **two** *small* coins' });
 *
 * blurb.setText('Take **three** coins'); // skips the re-render if the string is unchanged
 * ```
 */
export class RichLabel extends HTMLText {
	private readonly opts: RichLabelOptions;
	private readonly tags: readonly string[];
	private readonly themeListener = (t: Theme) => this.restyle(t);
	private revealSpans: MarkdownSpan[] | null = null;
	private reveal: RevealState | null = null;

	constructor(options: RichLabelOptions | string = {}) {
		const opts = normalizeTextOptions(options);
		const t = theme();
		const tags = opts.tagStyles === undefined ? [] : Object.keys(opts.tagStyles);

		super({
			text: toHtml(opts.text ?? '', tags),
			resolution: opts.resolution,
			style: new HTMLTextStyle({
				fontFamily: t.font.family,
				fontSize: opts.size ?? t.font.size,
				fontWeight: opts.bold ? 'bold' : 'normal',
				fill: opts.color ?? t.color.text,
				lineHeight: (opts.size ?? t.font.size) * t.font.lineHeight,
				align: themedAlign(opts, t),
				wordWrap: opts.wrapWidth !== undefined,
				wordWrapWidth: opts.wrapWidth ?? 0,
				breakWords: true,
				tagStyles: opts.tagStyles,
			}),
		});

		this.opts = opts;
		this.tags = tags;
		themeChanged.add(this.themeListener);
	}

	/** avoids the re-render when the markdown source has not actually changed */
	setText(value: string): void {
		//an instant set cancels any reveal in progress - the two never interleave
		this.revealSpans = null;
		this.reveal = null;
		const html = toHtml(value, this.tags);
		if (this.text !== html) this.text = html;
	}

	/**
	 * Shows markdown `value` progressively, `speed` visible characters per second -
	 * markers never count toward the total and never leak half-shown, which is exactly
	 * what a plain character slice over the source would get wrong. Driven by
	 * `updateReveal(dt)` like `Label`'s own reveal, for the same reason: a label owns no
	 * update loop of its own.
	 */
	showProgressive(value: string, speed?: number): void {
		this.revealSpans = parseMarkdown(value);
		this.reveal = startReveal(stripMarkdown(value).length, speed);
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
		if (!this.reveal || !this.revealSpans) return;
		//through the field rather than setText, which cancels a reveal in progress
		const html = toHtmlSpans(sliceSpans(this.revealSpans, this.reveal.revealed), this.tags);
		if (this.text !== html) this.text = html;
	}

	/**
	 * Reapplies whichever style fields were never given an explicit option, the same rule
	 * `Label`'s own restyle follows: an explicit `color`/`size` survives a theme change
	 * while theme defaults pick up the new one.
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

	override destroy(options?: Parameters<HTMLText['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

/** styled spans to an HTML fragment; literal text is escaped so `a < b` never parses */
function toHtml(source: string, tags: readonly string[]): string {
	return toHtmlSpans(parseMarkdown(source), tags);
}

function toHtmlSpans(spans: readonly MarkdownSpan[], tags: readonly string[]): string {
	return spans
		.map((span) => {
			let text = escapeHtml(span.text, tags);
			if (span.italic) text = `<i>${text}</i>`;
			if (span.bold) text = `<b>${text}</b>`;
			return text;
		})
		.join('');
}

/**
 * Escapes literal text, then un-escapes the registered custom tags again, so `a < b` never parses
 * but `<quest>...</quest>` survives as a real element for `HTMLText`'s own `tagStyles` to match.
 */
function escapeHtml(text: string, tags: readonly string[]): string {
	let html = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	for (const tag of tags) {
		html = html.replaceAll(`&lt;${tag}&gt;`, `<${tag}>`).replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`);
	}
	return html;
}
