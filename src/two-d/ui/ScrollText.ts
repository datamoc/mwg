import { Container, Graphics } from 'pixi.js';
import { reducedMotion } from '../../core/Motion.ts';
import { Label, type LabelOptions } from './Label.ts';
import { ScrollBox } from './ScrollBox.ts';

/**
 * `text` cut to fit `maxWidth`, ending in `ellipsis`, as measured by `measure` (the width of a string
 * in whatever font the caller draws it with). A text that already fits comes back unchanged.
 *
 * @example
 * ```ts
 * import { ellipsize } from '@datamoc/mw_games/two-d/ui';
 *
 * const width = (text: string) => text.length * 10;
 * console.log(ellipsize('3. Le Fleuve profond (verrouillé)', 150, width)); // 3. Le Fleuve…
 * ```
 */
export function ellipsize(text: string, maxWidth: number, measure: (text: string) => number, ellipsis = '…'): string {
	if (measure(text) <= maxWidth) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (measure(text.slice(0, middle).trimEnd() + ellipsis) <= maxWidth) low = middle;
		else high = middle - 1;
	}
	return low === 0 ? ellipsis : text.slice(0, low).trimEnd() + ellipsis;
}

/**
 * `text` wrapped at `maxWidth` and cut to `maxLines`, the last kept line ending in an ellipsis when
 * something was dropped. Words are not split unless one alone is wider than a line.
 *
 * @example
 * ```ts
 * import { truncateLines } from '@datamoc/mw_games/two-d/ui';
 *
 * const width = (text: string) => text.length * 10;
 * console.log(truncateLines('build a bridge across the river gorge', 120, 2, width));
 * // ['build a', 'bridge acr…']
 * ```
 */
export function truncateLines(
	text: string,
	maxWidth: number,
	maxLines: number,
	measure: (text: string) => number,
	ellipsis = '…',
): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const next = line ? `${line} ${word}` : word;
		if (measure(next) <= maxWidth || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	if (lines.length <= maxLines) return lines.map((each) => ellipsize(each, maxWidth, measure, ellipsis));
	const kept = lines.slice(0, maxLines);
	const rest = lines.slice(maxLines - 1).join(' ');
	kept[maxLines - 1] = ellipsize(rest + ellipsis, maxWidth, measure, ellipsis);
	return kept;
}

/**
 * How far a line of `textWidth` is shifted to scroll inside `boxWidth`, `time` seconds in: it waits
 * `pause` seconds, slides to its end at `speed` px/s, waits again, then slides back, over and over.
 * A text that fits never moves.
 *
 * @example
 * ```ts
 * import { marqueeOffset } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(marqueeOffset(300, 200, 0)); // 0, waiting at the start
 * console.log(marqueeOffset(300, 200, 3)); // 100, at the far end
 * console.log(marqueeOffset(150, 200, 3)); // 0, it fits
 * ```
 */
export function marqueeOffset(textWidth: number, boxWidth: number, time: number, speed = 40, pause = 1): number {
	const travel = textWidth - boxWidth;
	if (travel <= 0) return 0;
	const slide = travel / speed;
	const period = 2 * (pause + slide);
	const at = ((time % period) + period) % period;
	if (at < pause) return 0;
	if (at < pause + slide) return (at - pause) * speed;
	if (at < 2 * pause + slide) return travel;
	return travel - (at - 2 * pause - slide) * speed;
}

export interface ScrollTextOptions {
	width: number;
	/** the tallest the box grows before the text scrolls instead */
	maxHeight: number;
	text?: string;
	label?: Omit<LabelOptions, 'text' | 'wrapWidth'>;
	/** a finger drag scrolls the text; true when omitted */
	touch?: boolean;
}

/**
 * A wrapped `Label` in a `ScrollBox` that sizes itself: the box is as tall as the text up to
 * `maxHeight`, and scrolls (wheel, touch, keys, scrollbar) beyond it, so a long hint, credit list or
 * result message never spills over what is around it. `setText` re-measures; the caller no longer
 * measures the label and feeds `setContentHeight` by hand.
 *
 * @example
 * ```ts
 * import { ScrollText } from '@datamoc/mw_games/two-d/ui';
 *
 * const hint = new ScrollText({ width: 220, maxHeight: 60 });
 * hint.setText('Span the gorge with at most 400 of budget. Cables only pull; beams push as well.');
 * console.log(hint.box.viewportHeight <= 60); // true
 * ```
 */
export class ScrollText extends Container {
	readonly box: ScrollBox;
	private readonly body: Label;

	constructor(options: ScrollTextOptions) {
		super();
		this.body = new Label({ ...options.label, text: options.text ?? '', wrapWidth: options.width - 10 });
		this.box = new ScrollBox({
			width: options.width,
			height: options.maxHeight,
			autoHeight: true,
			touch: options.touch ?? true,
			keyboard: true,
		});
		this.box.content.addChild(this.body);
		this.addChild(this.box);
		this.measure();
	}

	/** the text's own height, which sizes the box; its own method so a test can supply it */
	protected measureHeight(): number {
		return this.body.height;
	}

	private measure(): void {
		this.box.setContentHeight(this.measureHeight());
	}

	setText(text: string): void {
		this.body.setText(text);
		this.measure();
		this.box.scrollTo(0);
	}

	/** call each frame for touch coasting */
	update(dt: number): void {
		this.box.update(dt);
	}
}

export interface MarqueeLabelOptions {
	width: number;
	text?: string;
	label?: Omit<LabelOptions, 'text'>;
	/** pixels per second; 40 when omitted */
	speed?: number;
	/** seconds it waits at each end; 1 when omitted */
	pause?: number;
}

/**
 * One line of text that stays on one line: when it is wider than `width` it slides back and forth
 * inside a clipped window (`marqueeOffset`), driven by `update(dt)`. Under reduced motion it holds
 * still, cut short with an ellipsis, instead of moving.
 *
 * @example
 * ```ts
 * import { MarqueeLabel } from '@datamoc/mw_games/two-d/ui';
 *
 * const title = new MarqueeLabel({ width: 160, text: 'A very long track title that cannot fit' });
 * title.update(1 / 60); // once a frame from the scene
 * ```
 */
export class MarqueeLabel extends Container {
	private readonly body: Label;
	private readonly clip = new Graphics();
	private readonly speed: number;
	private readonly pause: number;
	private readonly width_: number;
	private readonly labelOptions: Omit<LabelOptions, 'text'>;
	private source = '';
	private fullWidth = 0;
	private time = 0;

	constructor(options: MarqueeLabelOptions) {
		super();
		this.width_ = options.width;
		this.speed = options.speed ?? 40;
		this.pause = options.pause ?? 1;
		this.labelOptions = options.label ?? {};
		this.body = new Label({ ...this.labelOptions, text: '' });
		this.clip.rect(0, 0, options.width, 4096).fill({ color: 0xffffff });
		this.addChild(this.body, this.clip);
		this.body.mask = this.clip;
		this.setText(options.text ?? '');
	}

	/** the text's width in pixels; its own method so a test can supply it */
	protected measureWidth(text: string): number {
		const probe = new Label({ ...this.labelOptions, text });
		const width = probe.width;
		probe.destroy();
		return width;
	}

	setText(text: string): void {
		this.source = text;
		this.fullWidth = this.measureWidth(text);
		this.time = 0;
		this.apply();
	}

	private apply(): void {
		if (reducedMotion()) {
			this.body.setText(ellipsize(this.source, this.width_, (text) => this.measureWidth(text)));
			this.body.x = 0;
			return;
		}
		this.body.setText(this.source);
		this.body.x = -marqueeOffset(this.fullWidth, this.width_, this.time, this.speed, this.pause);
	}

	/** where the text is shifted to now (0 until it has waited out its first pause) */
	get shift(): number {
		return 0 - this.body.x;
	}

	update(dt: number): void {
		this.time += dt;
		this.apply();
	}
}
