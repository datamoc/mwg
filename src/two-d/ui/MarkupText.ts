import { Container, Texture } from 'pixi.js';
import { Sprite2D, Text2D } from '../render/Shape2D.ts';
import type { Texture2D } from '../render/Types2D.ts';
import { texture } from '../../assets/loader.ts';
import {
	layoutMarkupLines,
	parseMarkup,
	positionMarkupLines,
	type MarkupAlign,
	type MarkupDirection,
	type MarkupMeasure,
	type MarkupSpan,
} from './markup.ts';
import { theme, themeChanged, type Theme } from './theme.ts';

export interface MarkupTextOptions {
	text?: string;
	/** wrap width in pixels; omit for a single unwrapped line */
	maxWidth?: number;
	/** distance between baselines; defaults to the theme's size times line height */
	lineHeight?: number;
	align?: MarkupAlign;
	/** flow direction; defaults to the theme's `direction` */
	direction?: MarkupDirection;
	/** text texture resolution; omit for the renderer default */
	resolution?: number;
	/** how an `<img>` path becomes a texture; defaults to the asset resolver with a `Texture.EMPTY` fallback */
	resolveImage?: (path: string) => Texture2D;
	/** what a `$name` in the text becomes, the same contract `parseMarkup` takes */
	variables?: Readonly<Record<string, string>>;
}

/**
 * The canvas backend for inline markup, and the counterpart to `RichLabel`'s HTML text: the same
 * `MarkupSpan` stream, laid out once by `layoutMarkupLines` and `positionMarkupLines`, drawn here
 * as one `Text2D` per styled run (colour, size, emphasis) and one `Sprite2D` per `<img>` span,
 * resolved through the asset resolver. That split is the point - Pixi's `HTMLText` (which
 * `RichLabel` builds on) renders emphasis but has no inline-image primitive, so an image would
 * otherwise be dropped or a caller would have to position it itself at a `layoutMarkupLines`
 * offset by hand. This class is the component that does that wiring.
 *
 * Costs more than a `Label` (one drawable per run), so it is for descriptions, dialogue lines
 * and help bodies, not per-frame numbers - the same guidance `RichLabel` already carries.
 *
 * @example
 * ```ts
 * import { MarkupText } from '@datamoc/mw_games/two-d/ui';
 *
 * const description = new MarkupText({ text: 'Pay <b>10</b> gold<img>coin.png</img>', maxWidth: 240 });
 * description.setText('Pay <b>15</b> gold<img>coin.png</img>');
 * ```
 */
export class MarkupText extends Container {
	private readonly opts: MarkupTextOptions;
	private readonly themeListener = (t: Theme) => this.rebuild(t);

	constructor(options: MarkupTextOptions = {}) {
		super();
		this.opts = options;
		this.rebuild(theme());
		themeChanged.add(this.themeListener);
	}

	/** replaces the markup source and redraws, so a description can be updated in place */
	setText(value: string): void {
		this.opts.text = value;
		this.rebuild(theme());
	}

	/** re-parses, re-lays-out and re-draws; a theme change must re-measure against the new font */
	private rebuild(t: Theme): void {
		for (const child of this.removeChildren()) child.destroy();

		const lineHeight = this.opts.lineHeight ?? t.font.size * t.font.lineHeight;
		const wrapWidth = this.opts.maxWidth ?? Number.POSITIVE_INFINITY;
		const alignWidth = this.opts.maxWidth ?? 0;
		const direction = this.opts.direction ?? t.direction;
		const resolveImage = this.opts.resolveImage ?? ((path) => texture(path, Texture.EMPTY));
		const context = canvasContext();
		const measure: MarkupMeasure = (piece) => this.measurePiece(piece, t, lineHeight, resolveImage, context);

		const spans = parseMarkup(this.opts.text ?? '', { variables: this.opts.variables });
		const lines = layoutMarkupLines(spans, measure, wrapWidth);
		const runs = positionMarkupLines(lines, {
			measure,
			maxWidth: alignWidth,
			lineHeight,
			direction,
			align: this.opts.align ?? (this.opts.maxWidth === undefined ? 'left' : undefined),
		});

		for (const run of runs) {
			const child =
				run.span.image !== undefined
					? this.spriteFor(run.span.image, lineHeight, resolveImage)
					: this.textFor(run.span, t, lineHeight);
			child.x = run.x;
			child.y = run.y;
			this.addChild(child);
		}
	}

	private measurePiece(
		piece: Pick<MarkupSpan, 'text' | 'bold' | 'italic' | 'size' | 'image'>,
		t: Theme,
		lineHeight: number,
		resolveImage: (path: string) => Texture2D,
		context: CanvasRenderingContext2D | null,
	): number {
		if (piece.image !== undefined) return imageDisplaySize(resolveImage(piece.image), lineHeight).width;
		if (!context) return piece.text.length * (piece.size ?? t.font.size);
		context.font = fontString(piece, t.font.family, t.font.size);
		return context.measureText(piece.text).width;
	}

	private textFor(span: MarkupSpan, t: Theme, lineHeight: number): Text2D {
		return new Text2D({
			text: span.text,
			resolution: this.opts.resolution,
			style: {
				fontFamily: t.font.family,
				fontSize: span.size ?? t.font.size,
				fontWeight: span.bold ? 'bold' : 'normal',
				fontStyle: span.italic ? 'italic' : 'normal',
				fill: span.color ?? t.color.text,
				lineHeight,
			},
		});
	}

	private spriteFor(path: string, lineHeight: number, resolveImage: (p: string) => Texture2D): Sprite2D {
		const tex = resolveImage(path);
		const size = imageDisplaySize(tex, lineHeight);
		const sprite = new Sprite2D(tex);
		sprite.width = size.width;
		sprite.height = size.height;
		return sprite;
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}

/** a shared canvas 2D context, the same way Pixi's own `Text` measurement works under the hood */
let measureContext: CanvasRenderingContext2D | null = null;

function canvasContext(): CanvasRenderingContext2D | null {
	if (typeof document === 'undefined') return null;
	measureContext ??= document.createElement('canvas').getContext('2d');
	return measureContext;
}

function fontString(piece: Pick<MarkupSpan, 'bold' | 'italic' | 'size'>, family: string, fallbackSize: number): string {
	const style = piece.italic ? 'italic ' : '';
	const weight = piece.bold ? 'bold ' : '';
	return `${style}${weight}${piece.size ?? fallbackSize}px ${family}`;
}

/** an image run's drawn size: the line's own height, with the texture's aspect ratio kept */
function imageDisplaySize(tex: Texture2D, lineHeight: number): { width: number; height: number } {
	const width = tex.width > 0 ? tex.width : lineHeight;
	const height = tex.height > 0 ? tex.height : lineHeight;
	return { width: width * (lineHeight / height), height: lineHeight };
}
