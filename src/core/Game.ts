import { Application, TextureSource } from 'pixi.js';
import type { Scene, SceneClass } from './Scene.ts';
import { SceneStack } from './SceneStack.ts';
import { Signal } from './Signal.ts';
import * as Input from './Input.ts';

const PIXEL_ART_CLASS = 'mwg-pixel-art';

/** one queued scene change, applied in order at the start of the next frame */
type SceneRequest =
	| { kind: 'switch'; next: SceneClass }
	| { kind: 'push'; next: SceneClass }
	| { kind: 'pop'; result: unknown };

/**
 * A class beats an inline `canvas.style.imageRendering` because Pixi's own `autoDensity`/
 * `resizeTo` rewrite the canvas's `style` attribute wholesale (see `start()`); this rule
 * lives in the CSSOM instead, in a stylesheet Pixi never touches, so it survives that.
 * Injected once per page, however many `Game`s end up on it.
 */
function ensurePixelArtStylesheet(): void {
	if (document.getElementById(PIXEL_ART_CLASS)) return;

	const style = document.createElement('style');
	style.id = PIXEL_ART_CLASS;
	style.textContent = `.${PIXEL_ART_CLASS} { image-rendering: pixelated; }`;
	document.head.appendChild(style);
}

/**
 * Calls back whenever `devicePixelRatio` changes - a browser zoom, or dragging the window
 * to a display with a different scale factor. There is no direct DOM event for this: a
 * `matchMedia` query only fires once, for the specific ratio it was created against, so
 * catching the *next* change means building a fresh query after every firing.
 *
 * @returns a function that stops watching
 */
function watchDevicePixelRatio(onChange: () => void): () => void {
	let query: MediaQueryList | null = null;

	const rearm = (): void => {
		query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		query.addEventListener('change', fire, { once: true });
	};
	const fire = (): void => {
		onChange();
		rearm();
	};

	rearm();
	return () => query?.removeEventListener('change', fire);
}

export interface GameOptions {
	/** the canvas to draw into; one is created and appended if omitted */
	canvas?: HTMLCanvasElement;

	/** background colour behind everything, as 0xRRGGBB */
	background?: number;

	/**
	 * Longest frame the game will simulate, in seconds.
	 *
	 * A backgrounded tab reports an enormous delta on its first frame back, which would
	 * teleport everything that moves. Frames longer than this are treated as this long,
	 * so the game slows down rather than jumping.
	 */
	maxDelta?: number;

	/**
	 * Pixel art is never smoothed when scaled - both inside the game (texture sampling)
	 * and in the browser's own compositing of the canvas element onto the page, which is a
	 * separate step and blurs on its own if left at the default. Set false for a game whose
	 * art is not pixel art and should smooth when magnified.
	 */
	pixelArt?: boolean;

	/**
	 * What the renderer sizes itself to. Defaults to the window.
	 *
	 * Sizing to the canvas's parent looks tidier but circles: a canvas styled to fill its
	 * parent gives the parent no height of its own, so both collapse. Pass an element only
	 * when that element has a size the canvas does not depend on.
	 */
	resizeTo?: HTMLElement | Window;

	/**
	 * Pixi extension registrations to run before the renderer is built, such as
	 * `mwg/render`'s `registerColorTransform` for `TintedSprite`.
	 *
	 * `mwg/core` does not import `mwg/render` itself - a game that only ever imports
	 * `mwg/core` should not find the whole render module compiled in regardless. A game
	 * that does use `TintedSprite` (directly, or through `TileMap`/`DialogueStage`/
	 * `AnimatedSprite`, which are all built on it) passes its registration function here:
	 *
	 * ```ts
	 * import { registerColorTransform } from 'mw_games/render';
	 * new Game({ extensions: [registerColorTransform] });
	 * ```
	 */
	extensions?: readonly (() => void)[];
}

/**
 * The application: owns the renderer, the loop, and the current scene.
 *
 * Construct it, `await start(FirstScene)`, and the rest is scenes.
 */
export class Game {
	private static instance: Game | null = null;

	readonly app = new Application();

	/** seconds elapsed in the previous frame, clamped by `maxDelta` */
	elapsed = 0;

	/** total seconds since the current scene was created */
	timeTotal = 0;

	/** multiplies elapsed time; 0 pauses the game without stopping the renderer */
	timeScale = 1;

	/** fires after every frame's update, for systems that are not scene-owned */
	readonly onFrame = new Signal<number>();

	private stack = new SceneStack();
	private pending: SceneRequest[] = [];
	private options: Required<GameOptions>;
	private started = false;
	private stopWatchingDpr: (() => void) | null = null;

	constructor(options: GameOptions = {}) {
		this.options = {
			canvas: options.canvas ?? document.createElement('canvas'),
			background: options.background ?? 0x000000,
			maxDelta: options.maxDelta ?? 0.25,
			pixelArt: options.pixelArt ?? true,
			resizeTo: options.resizeTo ?? window,
			extensions: options.extensions ?? [],
		};

		if (this.options.pixelArt) {
			//set here rather than in start(), because textures are usually loaded before
			//the game starts and each one takes the default that was current when it was
			//created. nearest sampling is what keeps magnified pixel art crisp - but only
			//inside the game's own rendering; the browser then does a second, entirely
			//separate resize when it composites the canvas element onto the page (its
			//backing buffer is rarely the same size as its CSS display size, especially at
			//a devicePixelRatio other than 1), and that step defaults to smooth
			//interpolation regardless of anything Pixi does - see `start()` for the other
			//half of this, since `app.init()` overwrites whatever style is set here.
			TextureSource.defaultOptions.scaleMode = 'nearest';
		}

		Game.instance = this;
	}

	/** the viewport width in css pixels, which is what scenes lay out against */
	get width(): number {
		return this.app.renderer.screen.width;
	}

	get height(): number {
		return this.app.renderer.screen.height;
	}

	/** the running game, for the few places that genuinely need a global */
	static get current(): Game {
		if (!Game.instance) throw new Error('no Game has been created yet');
		return Game.instance;
	}

	async start(first: SceneClass): Promise<void> {
		if (this.started) throw new Error('this Game has already been started');
		this.started = true;

		//batchers and pipes have to be registered before the renderer is built - see
		//GameOptions.extensions for why this is a caller-supplied list rather than mwg/core
		//reaching into mwg/render itself
		for (const register of this.options.extensions) register();
		Input.attach();

		await this.app.init({
			canvas: this.options.canvas,
			background: this.options.background,
			resizeTo: this.options.resizeTo,
			antialias: false,
			//the game clears and redraws every frame, so the buffer need not be preserved
			preserveDrawingBuffer: false,
			//drawing at device resolution is what keeps pixel art on whole device pixels
			resolution: window.devicePixelRatio || 1,
			autoDensity: true,
		});

		if (!this.options.canvas.isConnected) {
			document.body.appendChild(this.options.canvas);
		}

		//`autoDensity` (and `resizeTo`, on its own asynchronous schedule) rewrite the canvas
		//element's `style` attribute wholesale to keep its CSS size matching the backing
		//buffer - which loses anything else set through `canvas.style`, including right
		//after `init` and again from inside pixi's own 'resize' event. A class, rather than
		//an inline style, lives in a different attribute entirely and survives that.
		if (this.options.pixelArt) {
			ensurePixelArtStylesheet();
			this.options.canvas.classList.add(PIXEL_ART_CLASS);
		}

		//`screen` is the logical size in css pixels; `renderer.width` is the backing store,
		//which is larger on a hidpi display. Scenes lay out in logical units, so handing
		//them the backing size would push everything they centre off the screen.
		this.app.renderer.on('resize', () => {
			this.stack.resize(this.width, this.height);
		});

		//the resolution passed to app.init() above is a one-time snapshot of
		//devicePixelRatio; a later browser zoom (or dragging the window to a display with a
		//different scale factor) changes that ratio without Pixi noticing on its own. Left
		//stale, the backing buffer and the browser's own CSS scaling of the canvas element
		//fall out of a whole-pixel relationship, and nearest-neighbour upscaling of a
		//non-integer ratio duplicates pixel columns inconsistently - the seams a pixel-art
		//tilemap shows between tiles that were perfectly adjacent in the buffer itself.
		this.stopWatchingDpr = watchDevicePixelRatio(() => {
			this.app.renderer.resize(this.width, this.height, window.devicePixelRatio || 1);
		});

		this.expose();
		this.switchNow(first);

		//pixi's ticker drives the loop, so its own systems stay in step with the game
		this.app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
	}

	/**
	 * Queues a scene change; it happens at the start of the next frame.
	 *
	 * The whole stack goes: every scene is destroyed, suspended or not, and the
	 * new one starts alone. For a scene that returns, push it instead.
	 */
	switchScene(next: SceneClass): void {
		this.pending.push({ kind: 'switch', next });
	}

	/**
	 * Queues a scene on top of the current one; it starts at the next frame.
	 *
	 * The scene underneath suspends but is not destroyed: it stops updating and
	 * keeps rendering, so the new scene can layer over it or replace it
	 * outright, and `popScene` resumes exactly where play left off.
	 */
	pushScene(next: SceneClass): void {
		this.pending.push({ kind: 'push', next });
	}

	/**
	 * Queues the top scene's removal; it happens at the start of the next frame.
	 *
	 * @param result reported back to the resumed scene's `onResume`
	 */
	popScene(result?: unknown): void {
		this.pending.push({ kind: 'pop', result });
	}

	/** the scene currently updating: the top of the stack */
	get currentScene(): Scene | null {
		return this.stack.current;
	}

	/**
	 * Advances the game by one frame and draws it, without waiting for the browser.
	 *
	 * The loop normally runs on requestAnimationFrame, which browsers suspend while a tab
	 * is not visible. That is right for a game and wrong for a test or a screenshot, so
	 * this drives a frame directly.
	 *
	 * @param dt seconds to advance by
	 */
	step(dt: number): void {
		this.frame(dt);
		this.app.renderer.render(this.app.stage);
	}

	/**
	 * Publishes the running game on the global object, for tools and for the console.
	 *
	 * `__PIXI_APP__` is the name the PixiJS devtools extension looks for, so declaring it
	 * costs nothing and makes the scene graph inspectable. `__MWG__` is the game itself,
	 * which is what makes `__MWG__.step(1/60)` possible from a console: the only way to
	 * advance a game whose tab the browser has suspended, and the difference between
	 * diagnosing a frozen page and guessing at it.
	 *
	 * Neither is read by the framework. Nothing depends on them existing.
	 */
	private expose(): void {
		const target = globalThis as unknown as Record<string, unknown>;
		target.__PIXI_APP__ = this.app;
		target.__MWG__ = this;
	}

	private frame(deltaSeconds: number): void {
		//queued scene changes run first, in order, so a frame never updates a
		//scene that was already asked to leave
		for (const request of this.pending) {
			if (request.kind === 'switch') this.applySwitch(request.next);
			else if (request.kind === 'push') this.applyPush(request.next);
			else this.applyPop(request.result);
		}
		this.pending.length = 0;

		this.elapsed = Math.min(deltaSeconds, this.options.maxDelta) * this.timeScale;
		this.timeTotal += this.elapsed;

		//no native "gamepad button pressed" event exists to attach a listener to, so this
		//has to run once a frame instead, before the scene reads isDown/justPressed
		Input.pollGamepads();

		this.stack.update(this.elapsed);
		this.onFrame.dispatch(this.elapsed);

		//after everything has had a chance to poll it, so nothing misses a press
		Input.endFrame();
	}

	private switchNow(next: SceneClass): void {
		this.applySwitch(next);
	}

	/** a new scene alone: everything else is destroyed, the clocks restart */
	private applySwitch(next: SceneClass): void {
		const scene = new next();
		this.stack.replace(scene);
		this.app.stage.removeChildren();
		this.app.stage.addChild(scene.stage);

		this.elapsed = 0;
		this.timeTotal = 0;
		this.timeScale = 1;

		scene.resize(this.width, this.height);
	}

	/** a new scene over the current one, which suspends but survives underneath */
	private applyPush(next: SceneClass): void {
		const scene = new next();
		this.stack.push(scene);
		this.app.stage.addChild(scene.stage);

		this.elapsed = 0;
		this.timeTotal = 0;
		this.timeScale = 1;

		scene.resize(this.width, this.height);
	}

	/** the top scene leaves, reporting back to whatever it covered */
	private applyPop(result: unknown): void {
		const top = this.stack.current;
		this.stack.pop(result);
		if (top) this.app.stage.removeChild(top.stage);
	}

	destroy(): void {
		Input.detach();
		this.stopWatchingDpr?.();
		this.stack.destroy();
		this.onFrame.removeAll();
		this.app.destroy(true, { children: true });
		if (Game.instance === this) Game.instance = null;
	}
}
