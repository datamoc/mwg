import { Container, Graphics } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { theme, themeChanged } from './theme.ts';

/**
 * Clamps a scroll offset so the content never pulls away from the top or leaves a gap past the
 * bottom. When the content is shorter than the viewport the only offset is 0.
 *
 * @example
 * ```ts
 * import { scrollOffset } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(scrollOffset(-5, 500, 200)); // 0
 * console.log(scrollOffset(900, 500, 200)); // 300
 * ```
 */
export function scrollOffset(offset: number, contentSize: number, viewportSize: number): number {
	return Math.max(0, Math.min(Math.max(0, contentSize - viewportSize), offset));
}

export interface ScrollBoxOptions {
	width: number;
	height: number;
	/** how tall the content is; set it again with `setContentHeight` as the content changes */
	contentHeight?: number;
	offset?: number;
}

/**
 * A clipped viewport with a scrollbar: put rows in `content` and they scroll inside the box,
 * everything outside it hidden by a mask. The scrollbar is drawn from the theme; the wheel,
 * `scrollBy` and `scrollIntoView` all run through `scrollOffset`, so they clamp the same way.
 *
 * @example
 * ```ts
 * import { ScrollBox } from '@datamoc/mw_games/two-d/ui';
 *
 * const box = new ScrollBox({ width: 200, height: 120, contentHeight: 400 });
 * box.scrollBy(60);
 * console.log(box.offset); // 60
 * ```
 */
export class ScrollBox extends Container {
	readonly onChange = new Signal<number>();

	/** add the rows to scroll here */
	readonly content = new Container();

	private maskShape = new Graphics();
	private track = new Graphics();
	private thumb = new Graphics();

	private width_: number;
	private height_: number;
	private contentHeight_: number;
	private offset_: number;

	private readonly themeListener = () => this.draw();

	constructor(options: ScrollBoxOptions) {
		super();

		this.width_ = options.width;
		this.height_ = options.height;
		this.contentHeight_ = Math.max(0, options.contentHeight ?? 0);
		this.offset_ = scrollOffset(options.offset ?? 0, this.contentHeight_, this.height_);

		this.addChild(this.content);
		this.addChild(this.maskShape);
		this.addChild(this.track);
		this.addChild(this.thumb);
		this.content.mask = this.maskShape;

		this.eventMode = 'static';
		this.on('wheel', this.handleWheel);

		this.draw();

		themeChanged.add(this.themeListener);
	}

	get offset(): number {
		return this.offset_;
	}

	get contentHeight(): number {
		return this.contentHeight_;
	}

	get viewportHeight(): number {
		return this.height_;
	}

	/** how far the content can scroll; 0 when it all fits */
	get maxOffset(): number {
		return Math.max(0, this.contentHeight_ - this.height_);
	}

	get scrollable(): boolean {
		return this.maxOffset > 0;
	}

	setContentHeight(height: number): void {
		this.contentHeight_ = Math.max(0, height);
		this.setOffset(scrollOffset(this.offset_, this.contentHeight_, this.height_));
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.height_ = height;
		this.setOffset(scrollOffset(this.offset_, this.contentHeight_, this.height_));
	}

	scrollBy(delta: number): void {
		this.setOffset(scrollOffset(this.offset_ + delta, this.contentHeight_, this.height_));
	}

	scrollTo(offset: number): void {
		this.setOffset(scrollOffset(offset, this.contentHeight_, this.height_));
	}

	/** scrolls just enough to bring a `height`-tall item at `top` fully into view */
	scrollIntoView(top: number, height: number): void {
		if (top < this.offset_) this.scrollTo(top);
		else if (top + height > this.offset_ + this.height_) this.scrollTo(top + height - this.height_);
	}

	private setOffset(offset: number): void {
		if (offset === this.offset_) {
			this.draw();
			return;
		}
		this.offset_ = offset;
		this.draw();
		this.onChange.dispatch(offset);
	}

	private readonly handleWheel = (event: { deltaY: number }): void => {
		this.scrollBy(event.deltaY);
	};

	private draw(): void {
		const t = theme();
		this.content.y = -this.offset_;

		this.maskShape.clear().rect(0, 0, this.width_, this.height_).fill({ color: 0xffffff });

		this.track.clear();
		this.thumb.clear();
		if (!this.scrollable) return;

		const barWidth = 6;
		const x = this.width_ - barWidth;
		this.track.roundRect(x, 0, barWidth, this.height_, barWidth / 2).fill({ color: t.color.panelFill });

		const thumbHeight = Math.max(barWidth, (this.height_ / this.contentHeight_) * this.height_);
		const thumbY = (this.offset_ / this.maxOffset) * (this.height_ - thumbHeight);
		this.thumb.roundRect(x, thumbY, barWidth, thumbHeight, barWidth / 2).fill({ color: t.color.textHighlight });
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
