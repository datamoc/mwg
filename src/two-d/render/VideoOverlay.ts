/** where the video sits, and how it behaves, before any `play` call narrows it further */
export interface VideoOverlayOptions {
	/** the element the video is appended to; default the document body */
	container?: HTMLElement;

	/** left edge in the container's coordinates; default 0 */
	x?: number;

	/** top edge in the container's coordinates; default 0 */
	y?: number;

	/** width in pixels; default the container's client width */
	width?: number;

	/** height in pixels; default the container's client height */
	height?: number;

	/** replay from the start every time it finishes; default false */
	loop?: boolean;

	/** start muted, which is what a browser allows autoplay to do; default true */
	muted?: boolean;

	/** show the browser's own transport controls; default false */
	controls?: boolean;

	/** ask the browser to start as soon as a source is set; default false */
	autoplay?: boolean;

	/** value for the element's `crossOrigin` attribute, for a video served from another origin */
	crossOrigin?: string;
}

/** what a single `play` call can override */
export interface VideoPlayOptions {
	/** replay from the start every time it finishes; defaults to the overlay's own `loop` */
	loop?: boolean;

	/** defaults to the overlay's own `muted` */
	muted?: boolean;

	/** seek to this many seconds before playing; default 0, the start */
	startAt?: number;
}

/**
 * A DOM `<video>` laid over the game canvas, for the intro movies, cutscene clips and live
 * action footage that Pixi has no primitive for.
 *
 * Pixi draws its own scene graph; a video is a browser element, so this creates one, styles
 * it `position: absolute` above the canvas with `pointer-events: none` (the game keeps the
 * taps unless `controls` is on), and removes it on `dispose`. Outside a browser - a headless
 * test, a Node import of the module - the constructor succeeds and every method is a safe
 * no-op, so game code that opens a cutscene still runs in a test harness.
 *
 * `play` resolves when the clip ends, which is what a scene wants to `await` between two
 * beats. A looping clip never ends, so its promise settles when something stops it: `stop`,
 * `dispose`, or the next `play`, which also settles whatever the previous clip was awaiting.
 *
 * @example
 * ```ts
 * import { VideoOverlay } from '@datamoc/mwg/two-d/render';
 *
 * const overlay = new VideoOverlay({ width: 640, height: 360, muted: true });
 *
 * async function intro(): Promise<void> {
 * 	await overlay.play('assets/intro.webm', { startAt: 0.5 });
 * 	overlay.setVisible(false);
 * }
 *
 * overlay.stop(); // settles `intro` early, if the player skipped it
 * overlay.dispose(); // takes the element back out of the page
 * ```
 */
export class VideoOverlay {
	private video: HTMLVideoElement | null = null;
	private readonly host: HTMLElement | null;
	private readonly defaultLoop: boolean;
	private readonly defaultMuted: boolean;
	private bounds: { x: number; y: number; width: number; height: number };

	/** resolves or rejects the promise a `play` call handed back, once that clip is over */
	private pending: { settle(error?: Error): void } | null = null;

	constructor(options: VideoOverlayOptions = {}) {
		this.host = options.container ?? (typeof document === 'undefined' ? null : document.body);
		this.defaultLoop = options.loop ?? false;
		this.defaultMuted = options.muted ?? true;
		this.bounds = {
			x: options.x ?? 0,
			y: options.y ?? 0,
			width: options.width ?? this.host?.clientWidth ?? 0,
			height: options.height ?? this.host?.clientHeight ?? 0,
		};

		if (typeof document === 'undefined') return;

		const video = document.createElement('video');
		video.preload = 'auto';
		video.style.position = 'absolute';
		video.style.zIndex = '1';
		video.loop = this.defaultLoop;
		video.muted = this.defaultMuted;
		video.controls = options.controls ?? false;
		//the game keeps the taps unless it asked for the browser's own transport controls
		video.style.pointerEvents = video.controls ? 'auto' : 'none';
		video.autoplay = options.autoplay ?? false;
		if (options.crossOrigin !== undefined) video.crossOrigin = options.crossOrigin;
		this.video = video;
		this.applyBounds();
		this.host?.appendChild(video);
	}

	/** the DOM element, or null outside a browser */
	get element(): HTMLVideoElement | null {
		return this.video;
	}

	/** whether a clip is running: not paused and not finished */
	get playing(): boolean {
		return this.video !== null && !this.video.paused && !this.video.ended;
	}

	/**
	 * Plays `src` from the start, replacing whatever was playing. The returned promise
	 * resolves when the clip ends (or is stopped, or replaced), and rejects if the element
	 * cannot play it at all: no browser support for the format, a blocked autoplay, a
	 * missing file.
	 */
	async play(src: string, options: VideoPlayOptions = {}): Promise<void> {
		const video = this.video;
		//outside a browser there is nothing to show, so a cutscene waits for nobody
		if (!video) return;

		this.stop();
		video.loop = options.loop ?? this.defaultLoop;
		video.muted = options.muted ?? this.defaultMuted;
		video.src = src;

		const done = this.watch(video);
		const startAt = options.startAt ?? 0;
		if (startAt > 0) this.seek(video, startAt);

		try {
			await video.play();
		} catch (error) {
			const reason = error instanceof Error ? error : new Error(String(error));
			//settle the pending clip before throwing: nothing is awaiting `done`, and an
			//abandoned rejected promise would surface as an unhandled rejection instead of this throw
			this.finish();
			throw reason;
		}
		return done;
	}

	/** pauses and unloads the clip, settling whatever `play` was awaiting */
	stop(): void {
		const video = this.video;
		if (!video) return;
		video.pause();
		video.removeAttribute('src');
		video.load();
		this.finish();
	}

	pause(): void {
		this.video?.pause();
	}

	/**
	 * Resumes a paused clip, returning the browser's own play promise so a caller can catch
	 * a refused autoplay. A no-op outside a browser.
	 */
	resume(): Promise<void> {
		const video = this.video;
		if (!video) return Promise.resolve();
		return video.play().then(() => undefined);
	}

	setBounds(x: number, y: number, width: number, height: number): void {
		this.bounds = { x, y, width, height };
		this.applyBounds();
	}

	setVisible(visible: boolean): void {
		if (this.video) this.video.style.display = visible ? 'block' : 'none';
	}

	/** settles any pending `play`, stops the clip and takes the element out of the page */
	dispose(): void {
		const video = this.video;
		this.finish();
		if (!video) return;
		video.pause();
		video.removeAttribute('src');
		video.load();
		video.remove();
		this.video = null;
	}

	/** @returns a promise that settles when this clip is over, or when something replaces or stops it */
	private watch(video: HTMLVideoElement): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const onEnded = () => this.finish();
			const onError = () =>
				this.finish(
					new Error(`VideoOverlay could not play ${video.currentSrc || video.src || 'the given source'}`),
				);

			video.addEventListener('ended', onEnded);
			video.addEventListener('error', onError);

			this.pending = {
				settle: (error) => {
					video.removeEventListener('ended', onEnded);
					video.removeEventListener('error', onError);
					if (error) reject(error);
					else resolve();
				},
			};
		});
	}

	/** settles the pending `play` once and drops its listeners; later calls are no-ops */
	private finish(error?: Error): void {
		const pending = this.pending;
		this.pending = null;
		pending?.settle(error);
	}

	/**
	 * Seeks once the element knows the clip's duration: setting `currentTime` before then is
	 * an error in some browsers, and a silent no-op in others.
	 */
	private seek(video: HTMLVideoElement, seconds: number): void {
		const apply = () => {
			try {
				video.currentTime = seconds;
			} catch {
				//the clip was stopped again between the metadata arriving and this listener running
			}
		};
		if (video.readyState >= 1) apply();
		else video.addEventListener('loadedmetadata', apply, { once: true });
	}

	private applyBounds(): void {
		const video = this.video;
		if (!video) return;
		const { x, y, width, height } = this.bounds;
		video.style.left = `${x}px`;
		video.style.top = `${y}px`;
		video.style.width = `${width}px`;
		video.style.height = `${height}px`;
	}
}
