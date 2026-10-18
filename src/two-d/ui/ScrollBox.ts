import { Container, Graphics, Rectangle } from 'pixi.js';
import { Signal } from '../../core/Signal.ts';
import { theme, themeChanged } from './theme.ts';

/**
 * Clamps a scroll offset so the content never pulls away from the top or leaves a gap past the
 * bottom. When the content is shorter than the viewport the only offset is 0.
 *
 * @example
 * ```ts
 * import { scrollOffset } from '@datamoc/mwg/two-d/ui';
 *
 * console.log(scrollOffset(-5, 500, 200)); // 0
 * console.log(scrollOffset(900, 500, 200)); // 300
 * ```
 */
export function scrollOffset(offset: number, contentSize: number, viewportSize: number): number {
	return Math.max(0, Math.min(Math.max(0, contentSize - viewportSize), offset));
}

/**
 * Touch scrolling as plain numbers: feed it pointer positions and it says how far the content moves
 * while the finger is down, then keeps coasting after release with a friction that decays the speed.
 * No pointer events or clock of its own, so it is the same under a test as under a finger.
 *
 * @example
 * ```ts
 * import { ScrollDrag } from '@datamoc/mwg/two-d/ui';
 *
 * const drag = new ScrollDrag();
 * drag.start(200, 0);
 * console.log(drag.move(170, 0.1)); // 30: the content follows the finger up
 * drag.end();
 * console.log(drag.step(1 / 60) > 0); // true: it keeps coasting
 * ```
 */
export class ScrollDrag {
	/** content pixels per second the content keeps moving at after release; 0 when at rest */
	velocity = 0;
	dragging = false;
	/** how far the pointer has travelled since `start`, to tell a drag from a tap */
	travelled = 0;

	private lastY = 0;
	private lastTime = 0;

	private readonly friction: number;
	private readonly minSpeed: number;

	/**
	 * @param friction fraction of the speed lost per second of coasting; 0.92 when omitted
	 * @param minSpeed the speed, in pixels per second, below which it counts as at rest; 8 when omitted
	 */
	constructor(friction = 0.92, minSpeed = 8) {
		this.friction = friction;
		this.minSpeed = minSpeed;
	}

	start(y: number, time: number): void {
		this.dragging = true;
		this.velocity = 0;
		this.travelled = 0;
		this.lastY = y;
		this.lastTime = time;
	}

	/** @returns how far the content should move for this pointer position */
	move(y: number, time: number): number {
		if (!this.dragging) return 0;
		const delta = this.lastY - y;
		const dt = time - this.lastTime;
		if (dt > 0) this.velocity = this.velocity * 0.4 + (delta / dt) * 0.6;
		this.travelled += Math.abs(delta);
		this.lastY = y;
		this.lastTime = time;
		return delta;
	}

	end(): void {
		this.dragging = false;
		if (Math.abs(this.velocity) < this.minSpeed) this.velocity = 0;
	}

	/** @returns how far the content coasts in `dt` seconds, 0 once it has stopped */
	step(dt: number): number {
		if (this.dragging || this.velocity === 0) return 0;
		const delta = this.velocity * dt;
		this.velocity *= (1 - this.friction) ** dt;
		if (Math.abs(this.velocity) < this.minSpeed) this.velocity = 0;
		return delta;
	}

	/** stops coasting, for when the content hit an end */
	stop(): void {
		this.velocity = 0;
	}
}

export interface ScrollBoxOptions {
	width: number;
	/** the viewport's height, or its largest height when `autoHeight` is on */
	height: number;
	/** how tall the content is; set it again with `setContentHeight` as the content changes */
	contentHeight?: number;
	offset?: number;
	/** dragging the content scrolls it and it coasts on release (`update(dt)` drives the coasting) */
	touch?: boolean;
	/** `handleKey` scrolls by line, page and to the ends */
	keyboard?: boolean;
	/** a viewport as tall as the content, up to `height` */
	autoHeight?: boolean;
	/** how far an arrow key scrolls; 24 when omitted */
	lineHeight?: number;
}

/** the key names `ScrollBox.handleKey` answers to, as `KeyboardEvent.key` spells them */
export type ScrollKey = 'ArrowUp' | 'ArrowDown' | 'PageUp' | 'PageDown' | 'Home' | 'End';

/**
 * A clipped viewport with a scrollbar: put rows in `content` and they scroll inside the box,
 * everything outside it hidden by a mask. The scrollbar is drawn from the theme; the wheel,
 * `scrollBy` and `scrollIntoView` all run through `scrollOffset`, so they clamp the same way.
 * The box owns its `hitArea` (its viewport, kept current by `resize` and `setContentHeight`),
 * so a wheel over the empty part of the viewport reaches it instead of needing a row under
 * the pointer to bubble from.
 *
 * `touch: true` lets a finger drag the content (a drag ends the tap on the rows under it) and coast
 * on release, `keyboard: true` makes `handleKey` scroll by line, page and to the ends, the scrollbar's
 * thumb can be dragged and its track clicked, and `autoHeight` sizes the viewport to the content up
 * to `height`. Call `update(dt)` each frame for the coasting.
 *
 * @example
 * ```ts
 * import { ScrollBox } from '@datamoc/mwg/two-d/ui';
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

	private readonly hit = new Rectangle(0, 0, 0, 0);
	private maskShape = new Graphics();
	private track = new Graphics();
	private thumb = new Graphics();

	private width_: number;
	private maxHeight_: number;
	private height_: number;
	private contentHeight_: number;
	private offset_: number;
	private readonly auto: boolean;
	private readonly lineHeight: number;
	private readonly drag: ScrollDrag | null;
	private dragMoved = false;
	private thumbGrab: { y: number; offset: number } | null = null;

	private readonly themeListener = () => this.draw();

	constructor(options: ScrollBoxOptions) {
		super();

		this.width_ = options.width;
		this.maxHeight_ = options.height;
		this.auto = options.autoHeight ?? false;
		this.lineHeight = options.lineHeight ?? 24;
		this.drag = options.touch ? new ScrollDrag() : null;
		this.contentHeight_ = Math.max(0, options.contentHeight ?? 0);
		this.height_ = this.fit();
		this.offset_ = scrollOffset(options.offset ?? 0, this.contentHeight_, this.height_);

		this.addChild(this.content);
		this.addChild(this.maskShape);
		this.addChild(this.track);
		this.addChild(this.thumb);
		this.content.mask = this.maskShape;

		this.eventMode = 'static';
		this.on('wheel', this.handleWheel);
		if (this.drag) {
			this.on('pointerdown', (event) => this.dragStart(event.global.y, performance.now() / 1000));
			this.on('globalpointermove', (event) => this.dragMove(event.global.y, performance.now() / 1000));
			this.on('pointerup', () => this.dragEnd());
			this.on('pointerupoutside', () => this.dragEnd());
			//a drag that ended over a row is not a click on that row
			this.on('pointerupcapture', (event) => {
				if (this.dragMoved) event.stopPropagation();
			});
		}
		this.track.eventMode = 'static';
		this.thumb.eventMode = 'static';
		this.thumb.on('pointerdown', (event) => {
			event.stopPropagation();
			this.thumbDragStart(event.global.y);
		});
		this.thumb.on('globalpointermove', (event) => this.thumbDragMove(event.global.y));
		this.thumb.on('pointerup', () => (this.thumbGrab = null));
		this.thumb.on('pointerupoutside', () => (this.thumbGrab = null));
		this.track.on('pointerdown', (event) => {
			event.stopPropagation();
			this.scrollToThumbCentre(this.toLocal(event.global).y);
		});

		this.draw();

		themeChanged.add(this.themeListener);
	}

	get offset(): number {
		return this.offset_;
	}

	get contentHeight(): number {
		return this.contentHeight_;
	}

	/** the viewport's width, the other half of the box's `hitArea` */
	get viewportWidth(): number {
		return this.width_;
	}

	get viewportHeight(): number {
		return this.height_;
	}

	/** the viewport's height: the content's, capped at the maximum, when `autoHeight` is on */
	private fit(): number {
		return this.auto ? Math.min(this.maxHeight_, this.contentHeight_) : this.maxHeight_;
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
		this.height_ = this.fit();
		this.setOffset(scrollOffset(this.offset_, this.contentHeight_, this.height_));
	}

	resize(width: number, height: number): void {
		this.width_ = width;
		this.maxHeight_ = height;
		this.height_ = this.fit();
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

	/**
	 * Scrolls for a key a keyboard-driven list was handed (`KeyboardEvent.key`).
	 *
	 * @returns true when the key is one this box scrolls by, so a caller can stop it going further
	 */
	handleKey(key: string): boolean {
		const page = Math.max(this.lineHeight, this.height_ - this.lineHeight);
		switch (key as ScrollKey) {
			case 'ArrowUp':
				this.scrollBy(-this.lineHeight);
				return true;
			case 'ArrowDown':
				this.scrollBy(this.lineHeight);
				return true;
			case 'PageUp':
				this.scrollBy(-page);
				return true;
			case 'PageDown':
				this.scrollBy(page);
				return true;
			case 'Home':
				this.scrollTo(0);
				return true;
			case 'End':
				this.scrollTo(this.maxOffset);
				return true;
			default:
				return false;
		}
	}

	/** a finger or button went down at `y` (any one coordinate space, `time` in seconds) */
	dragStart(y: number, time: number): void {
		this.drag?.start(y, time);
		this.dragMoved = false;
	}

	/** the pointer moved while down; the content follows once it has travelled a few pixels */
	dragMove(y: number, time: number): void {
		const drag = this.drag;
		if (!drag?.dragging) return;
		const delta = drag.move(y, time);
		if (!this.dragMoved && drag.travelled < 6) return;
		this.dragMoved = true;
		this.scrollBy(delta);
	}

	dragEnd(): void {
		this.drag?.end();
	}

	/** true once the pointer travelled far enough to count as a drag rather than a tap */
	get dragged(): boolean {
		return this.dragMoved;
	}

	/** advances touch coasting; call once a frame from the owning scene's `update` */
	update(dt: number): void {
		const drag = this.drag;
		if (!drag) return;
		const before = this.offset_;
		this.scrollBy(drag.step(dt));
		if (this.offset_ === before && drag.velocity !== 0) drag.stop();
	}

	/** where the scrollbar's thumb sits and how tall it is, in the box's own space */
	get thumbMetrics(): { y: number; height: number } {
		const barWidth = 6;
		const height = Math.max(barWidth, (this.height_ / Math.max(1, this.contentHeight_)) * this.height_);
		const y = this.maxOffset === 0 ? 0 : (this.offset_ / this.maxOffset) * (this.height_ - height);
		return { y, height };
	}

	/** the thumb was grabbed at `y` */
	thumbDragStart(y: number): void {
		this.thumbGrab = { y, offset: this.offset_ };
	}

	/** the thumb moved to `y`: the offset follows in proportion to the thumb's travel */
	thumbDragMove(y: number): void {
		if (!this.thumbGrab) return;
		const travel = this.height_ - this.thumbMetrics.height;
		if (travel <= 0) return;
		this.scrollTo(this.thumbGrab.offset + ((y - this.thumbGrab.y) / travel) * this.maxOffset);
	}

	/** a click on the track at local `y` puts the thumb's centre there */
	scrollToThumbCentre(y: number): void {
		const travel = this.height_ - this.thumbMetrics.height;
		if (travel <= 0) return;
		this.scrollTo(((y - this.thumbMetrics.height / 2) / travel) * this.maxOffset);
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
		this.hit.width = this.width_;
		this.hit.height = this.height_;
		this.hitArea = this.hit;
		const t = theme();
		this.content.y = -this.offset_;

		this.maskShape.clear().rect(0, 0, this.width_, this.height_).fill({ color: 0xffffff });

		this.track.clear();
		this.thumb.clear();
		if (!this.scrollable) return;

		const barWidth = 6;
		const x = this.width_ - barWidth;
		this.track.roundRect(x, 0, barWidth, this.height_, barWidth / 2).fill({ color: t.color.panelFill });

		const { y: thumbY, height: thumbHeight } = this.thumbMetrics;
		this.thumb.roundRect(x, thumbY, barWidth, thumbHeight, barWidth / 2).fill({ color: t.color.textHighlight });
	}

	override destroy(options?: Parameters<Container['destroy']>[0]): void {
		themeChanged.remove(this.themeListener);
		super.destroy(options);
	}
}
