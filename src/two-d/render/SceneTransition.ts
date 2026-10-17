import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { Easing, type Easing as EasingFunction } from '../../core/Tween.ts';
import type { Container2D, Texture2D } from './Types2D.ts';

/**
 * Screen transitions: how one picture hands over to the next. `Game.switchScene(Next, { transition })`
 * photographs the outgoing scene, starts the new one underneath and animates the photograph away
 * (`tileShrink`, `slide`, `dissolve`, `shrink`) or grows the new scene over it (`pop`, `grow`, `iris`).
 * `Scene2D.transitionTo(swap, options)` does the same for a scene that replaces its own content.
 *
 * Each transition is a small factory: `start(context)` builds what it needs from the outgoing
 * `snapshot` and the `incoming` container and returns a runtime whose `update(progress)` is called
 * with eased progress from 0 to 1. The geometry (`tileDelays`, `tileProgress`, `popScale`) is plain
 * functions, so a transition's timing is testable without drawing it.
 */

/** what a transition is given to work with */
export interface TransitionContext {
	/** the size of the screen in logical pixels */
	width: number;
	height: number;
	/** a picture of the outgoing scene, or null when there was none to photograph */
	snapshot: Texture2D | null;
	/** the new scene, in a container the transition may move, scale, fade or mask */
	incoming: Container2D;
	/** drawn beneath `incoming`: the old picture, for a transition that grows the new scene over it */
	under: Container2D;
	/** drawn over `incoming`: the old picture, for a transition that takes it away */
	over: Container2D;
}

export interface TransitionRuntime {
	/** @param progress eased, 0 at the start and 1 at the end */
	update(progress: number): void;
	/** removes whatever the transition added, leaving `incoming` as it found it */
	destroy(): void;
}

export interface SceneTransition {
	readonly name: string;
	start(context: TransitionContext): TransitionRuntime;
}

/** how a transition is run; `transition` is the only required part */
export interface TransitionOptions {
	transition: SceneTransition;
	/** seconds, counted in real time; 0.5 when omitted. Reduced motion skips the transition entirely */
	duration?: number;
	/** a name from `Easing` or a function of progress; `easeInOutQuad` when omitted */
	easing?: keyof typeof Easing | EasingFunction;
	/** hold the scene still while the transition plays; false when omitted */
	pause?: boolean;
	/**
	 * What happens when this transition is requested while another is already playing:
	 * by default the new request is ignored (its swap never runs and its `onDone` never
	 * fires). `queue: true` holds it until the running transition finishes, then plays it;
	 * `interrupt: true` finishes the running one at once (its `onDone` fires) and plays
	 * this one instead. `interrupt` wins when both are set.
	 */
	queue?: boolean;
	/** see `queue`: finish the running transition at once and play this one instead */
	interrupt?: boolean;
	/** runs once, the frame the transition ends */
	onDone?: () => void;
}

/** what `Game` does with a scene change requested while a transition may already be playing */
export type TransitionDisposition = 'apply' | 'ignore' | 'queue' | 'interrupt';

/**
 * The rule for a request that arrives while a transition is playing: it applies at once
 * when nothing is playing; while one is playing, a request with no transition finishes it
 * and applies (`interrupt`, the historical behaviour), a transition request is ignored by
 * default, held by `queue: true`, or interrupts with `interrupt: true` (which wins when
 * both are set).
 *
 * @example
 * ```ts
 * import { transitionDisposition, dissolve } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(transitionDisposition({ transition: dissolve() }, true)); // 'ignore'
 * console.log(transitionDisposition({ transition: dissolve(), queue: true }, true)); // 'queue'
 * console.log(transitionDisposition({ transition: dissolve() }, false)); // 'apply'
 * ```
 */
export function transitionDisposition(
	options: TransitionOptions | undefined,
	transitioning: boolean,
): TransitionDisposition {
	if (!transitioning) return 'apply';
	if (!options) return 'interrupt';
	if (options.interrupt) return 'interrupt';
	if (options.queue) return 'queue';
	return 'ignore';
}

/** where a transition starts from or aims at, in screen pixels; the screen's centre when omitted */
export interface TransitionPoint {
	x: number;
	y: number;
}

export type TileOrder = 'diagonal' | 'random' | 'spiral' | 'rows';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * When each tile of a `columns` by `rows` grid starts, from 0 (first) to 1 (last), in row-major order.
 * `diagonal` sweeps from the top left, `spiral` from the outside in, `rows` top to bottom, and
 * `random` is a fixed shuffle for a given `seed`.
 *
 * @example
 * ```ts
 * import { tileDelays } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(tileDelays(3, 2, 'diagonal')); // [0, 1/3, 2/3, 1/3, 2/3, 1]
 * ```
 */
export function tileDelays(columns: number, rows: number, order: TileOrder = 'diagonal', seed = 1): number[] {
	const count = columns * rows;
	const keys: number[] = [];
	let state = seed >>> 0 || 1;
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			if (order === 'diagonal') keys.push(column + row);
			else if (order === 'rows') keys.push(row * columns + column);
			else if (order === 'spiral') keys.push(Math.min(column, row, columns - 1 - column, rows - 1 - row));
			else {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				keys.push(state / 2 ** 32);
			}
		}
	}
	const low = Math.min(...keys);
	const high = Math.max(...keys);
	return keys.map((key) => (count === 1 || high === low ? 0 : (key - low) / (high - low)));
}

/**
 * One tile's progress when the whole transition is at `progress`: tiles start spread across the first
 * `stagger` of the time, according to their `delay` from `tileDelays`, and each then takes the rest
 * of it, so the last tile finishes exactly as the transition does.
 *
 * @example
 * ```ts
 * import { tileProgress } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(tileProgress(0, 0.5, 0.5)); // 1: the first tile is already done
 * console.log(tileProgress(1, 0.5, 0.5)); // 0: the last one has not started
 * ```
 */
export function tileProgress(delay: number, progress: number, stagger: number): number {
	const spread = clamp01(stagger);
	return clamp01((progress - delay * spread) / (1 - spread || 1));
}

/**
 * The scale of something that pops in: 0 growing past 1 to `overshoot`, then settling on 1.
 *
 * @example
 * ```ts
 * import { popScale } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(popScale(0)); // 0
 * console.log(popScale(0.7)); // 1.08, the peak
 * console.log(popScale(1)); // 1
 * ```
 */
export function popScale(progress: number, overshoot = 1.08): number {
	const p = clamp01(progress);
	if (p < 0.7) return Easing.easeOutCubic(p / 0.7) * overshoot;
	return overshoot + (1 - overshoot) * Easing.easeInOutQuad((p - 0.7) / 0.3);
}

/**
 * the `Easing` function for a name or a function, defaulting to `easeInOutQuad`
 *
 * @example
 * ```ts
 * import { resolveEasing } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(resolveEasing('linear')(0.25)); // 0.25
 * console.log(resolveEasing((t) => t * t)(0.5)); // 0.25
 * ```
 */
export function resolveEasing(easing: TransitionOptions['easing']): EasingFunction {
	if (typeof easing === 'function') return easing;
	return Easing[easing ?? 'easeInOutQuad'];
}

function pointOr(point: TransitionPoint | undefined, context: TransitionContext): TransitionPoint {
	return point ?? { x: context.width / 2, y: context.height / 2 };
}

/** a full-screen sprite of the snapshot, or an empty container when there is none */
function snapshotSprite(context: TransitionContext): Sprite | null {
	if (!context.snapshot) return null;
	const sprite = new Sprite(context.snapshot);
	sprite.width = context.width;
	sprite.height = context.height;
	return sprite;
}

function runtime(container: Container, update: (progress: number) => void, restore?: () => void): TransitionRuntime {
	return {
		update,
		destroy() {
			restore?.();
			container.destroy({ children: true });
		},
	};
}

export interface TileShrinkOptions {
	columns?: number;
	rows?: number;
	/** the part of the duration over which tiles start, 0 to 1; 0.5 when omitted */
	stagger?: number;
	order?: TileOrder;
	/** how far each tile turns while it shrinks, in radians; 0 when omitted */
	rotation?: number;
	seed?: number;
}

/**
 * The old picture cut into tiles that each shrink to nothing, in `order`, uncovering the new scene.
 *
 * @example
 * ```ts
 * import { tileShrink } from '@datamoc/mw_games/two-d/render';
 *
 * const transition = tileShrink({ columns: 8, rows: 5, order: 'diagonal' });
 * // Game.current.switchScene(NextLevel, { transition, duration: 0.6 });
 * console.log(transition.name); // 'tileShrink'
 * ```
 */
export function tileShrink(options: TileShrinkOptions = {}): SceneTransition {
	const columns = Math.max(1, Math.floor(options.columns ?? 8));
	const rows = Math.max(1, Math.floor(options.rows ?? 5));
	const stagger = options.stagger ?? 0.5;
	const rotation = options.rotation ?? 0;
	return {
		name: 'tileShrink',
		start(context) {
			const layer = new Container();
			context.over.addChild(layer);
			const delays = tileDelays(columns, rows, options.order ?? 'diagonal', options.seed);
			const tiles: { sprite: Sprite; width: number; height: number }[] = [];
			const snapshot = context.snapshot;
			const tileWidth = context.width / columns;
			const tileHeight = context.height / rows;
			if (snapshot) {
				const frame = snapshot.frame;
				for (let row = 0; row < rows; row++) {
					for (let column = 0; column < columns; column++) {
						const crop = new Rectangle(
							frame.x + (column * frame.width) / columns,
							frame.y + (row * frame.height) / rows,
							frame.width / columns,
							frame.height / rows,
						);
						const tile = new Sprite(new Texture({ source: snapshot.source, frame: crop }));
						tile.anchor.set(0.5);
						tile.width = tileWidth;
						tile.height = tileHeight;
						tile.position.set((column + 0.5) * tileWidth, (row + 0.5) * tileHeight);
						tiles.push({ sprite: tile, width: tile.scale.x, height: tile.scale.y });
						layer.addChild(tile);
					}
				}
			}
			return runtime(layer, (progress) => {
				tiles.forEach(({ sprite, width, height }, index) => {
					const left = 1 - tileProgress(delays[index], progress, stagger);
					sprite.scale.set(width * left, height * left);
					sprite.rotation = (1 - left) * rotation;
					sprite.visible = left > 0;
				});
			});
		},
	};
}

/**
 * The old picture shrinking to a point (the screen's centre unless `to` names one) over the new scene.
 *
 * @example
 * ```ts
 * import { shrink } from '@datamoc/mw_games/two-d/render';
 *
 * const closeToButton = shrink({ to: { x: 700, y: 40 } });
 * console.log(closeToButton.name); // 'shrink'
 * ```
 */
export function shrink(options: { to?: TransitionPoint } = {}): SceneTransition {
	return {
		name: 'shrink',
		start(context) {
			const layer = new Container();
			context.over.addChild(layer);
			const sprite = snapshotSprite(context);
			if (sprite) layer.addChild(sprite);
			const to = pointOr(options.to, context);
			return runtime(layer, (progress) => {
				const scale = 1 - progress;
				layer.scale.set(scale);
				layer.position.set(to.x * (1 - scale), to.y * (1 - scale));
				layer.alpha = 1 - progress * progress;
			});
		},
	};
}

/** shared by `pop` and `grow`: the new scene scales up from a point over the old picture */
function growing(
	name: string,
	from: TransitionPoint | undefined,
	scaleAt: (progress: number) => number,
): SceneTransition {
	return {
		name,
		start(context) {
			const layer = new Container();
			context.under.addChild(layer);
			const sprite = snapshotSprite(context);
			if (sprite) layer.addChild(sprite);
			const origin = pointOr(from, context);
			const target = context.incoming;
			return runtime(
				layer,
				(progress) => {
					const scale = scaleAt(progress);
					target.scale.set(scale);
					target.position.set(origin.x * (1 - scale), origin.y * (1 - scale));
					target.alpha = clamp01(progress * 3);
				},
				() => {
					target.scale.set(1);
					target.position.set(0, 0);
					target.alpha = 1;
				},
			);
		},
	};
}

/**
 * The new scene springing out of a point (the centre unless `from` names one), overshooting a little
 * (`overshoot`, 1.08 when omitted) before it settles.
 *
 * @example
 * ```ts
 * import { pop } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(pop({ from: { x: 400, y: 300 } }).name); // 'pop'
 * ```
 */
export function pop(options: { from?: TransitionPoint; overshoot?: number } = {}): SceneTransition {
	return growing('pop', options.from, (progress) => popScale(progress, options.overshoot));
}

/**
 * The new scene growing from a point (the centre unless `from` names one) without overshoot.
 *
 * @example
 * ```ts
 * import { grow } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(grow().name); // 'grow'
 * ```
 */
export function grow(options: { from?: TransitionPoint } = {}): SceneTransition {
	return growing('grow', options.from, (progress) => progress);
}

/**
 * Old and new pictures sliding together: the new one enters from the `direction` side while the old
 * one leaves the other way.
 *
 * @example
 * ```ts
 * import { slide } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(slide({ direction: 'left' }).name); // 'slide'
 * ```
 */
export function slide(options: { direction?: 'left' | 'right' | 'up' | 'down' } = {}): SceneTransition {
	const direction = options.direction ?? 'left';
	const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
	const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
	return {
		name: 'slide',
		start(context) {
			const layer = new Container();
			context.over.addChild(layer);
			const sprite = snapshotSprite(context);
			if (sprite) layer.addChild(sprite);
			const target = context.incoming;
			return runtime(
				layer,
				(progress) => {
					layer.position.set(dx * context.width * progress, dy * context.height * progress);
					target.position.set(-dx * context.width * (1 - progress), -dy * context.height * (1 - progress));
				},
				() => target.position.set(0, 0),
			);
		},
	};
}

/**
 * A circle opening from a point (the centre unless `from` names one) that shows the new scene
 * through it, the old picture around it.
 *
 * @example
 * ```ts
 * import { iris } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(iris({ from: { x: 120, y: 80 } }).name); // 'iris'
 * ```
 */
export function iris(options: { from?: TransitionPoint } = {}): SceneTransition {
	return {
		name: 'iris',
		start(context) {
			const layer = new Container();
			context.under.addChild(layer);
			const sprite = snapshotSprite(context);
			if (sprite) layer.addChild(sprite);
			const origin = pointOr(options.from, context);
			const reach = Math.hypot(
				Math.max(origin.x, context.width - origin.x),
				Math.max(origin.y, context.height - origin.y),
			);
			const mask = new Graphics();
			context.incoming.addChild(mask);
			context.incoming.mask = mask;
			return runtime(
				layer,
				(progress) => {
					mask.clear()
						.circle(origin.x, origin.y, reach * progress)
						.fill({ color: 0xffffff });
				},
				() => {
					context.incoming.mask = null;
					mask.destroy();
				},
			);
		},
	};
}

/**
 * The old picture fading out over the new scene.
 *
 * @example
 * ```ts
 * import { dissolve } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(dissolve().name); // 'dissolve'
 * ```
 */
export function dissolve(): SceneTransition {
	return {
		name: 'dissolve',
		start(context) {
			const layer = new Container();
			context.over.addChild(layer);
			const sprite = snapshotSprite(context);
			if (sprite) layer.addChild(sprite);
			return runtime(layer, (progress) => {
				layer.alpha = 1 - progress;
			});
		},
	};
}

/** how a window or panel comes and goes */
export type OpenAnimationKind = 'pop' | 'grow' | 'slide' | 'fade';

/**
 * What a window opening (or closing, run backwards) looks like at `progress`: its scale, opacity and
 * how far it is still pushed down by a `slide`. Closing never overshoots.
 *
 * @example
 * ```ts
 * import { openAnimationFrame } from '@datamoc/mw_games/two-d/render';
 *
 * console.log(openAnimationFrame('pop', 0).scale); // 0
 * console.log(openAnimationFrame('pop', 1).scale); // 1
 * console.log(openAnimationFrame('slide', 0.5).offset > 0); // true: still sliding up
 * ```
 */
export function openAnimationFrame(
	kind: OpenAnimationKind,
	progress: number,
	closing = false,
): { scale: number; alpha: number; offset: number } {
	const p = clamp01(progress);
	const eased = Easing.easeOutCubic(p);
	if (kind === 'pop') return { scale: closing ? eased : popScale(p), alpha: clamp01(p * 3), offset: 0 };
	if (kind === 'grow') return { scale: eased, alpha: clamp01(p * 3), offset: 0 };
	if (kind === 'slide') return { scale: 1, alpha: eased, offset: (1 - eased) * 48 };
	return { scale: 1, alpha: eased, offset: 0 };
}

/**
 * Plays one transition: owns the `under` and `over` layers, advances with `update(dt)` in real
 * time and tells its `onDone` once. `Game` runs one of these around a scene change; it is exported so
 * a game with its own compositing can run a transition the same way.
 *
 * @example
 * ```ts
 * import { Container2D as Container } from '@datamoc/mw_games/two-d/render';
 * import { TransitionRunner, dissolve } from '@datamoc/mw_games/two-d/render';
 *
 * const incoming = new Container();
 * const runner = new TransitionRunner({ transition: dissolve(), duration: 0.5 }, { width: 800, height: 600 }, null, incoming);
 * // put runner.under, incoming and runner.over on the stage, in that order
 * while (!runner.update(1 / 60)) continue;
 * console.log(runner.done); // true
 * ```
 */
export class TransitionRunner {
	readonly under: Container2D = new Container();
	readonly over: Container2D = new Container();
	readonly pause: boolean;
	private readonly runtime: TransitionRuntime;
	private readonly duration: number;
	private readonly ease: EasingFunction;
	private readonly onDone?: () => void;
	private readonly snapshot: Texture2D | null;
	private elapsed = 0;
	private finished = false;

	constructor(
		options: TransitionOptions,
		size: { width: number; height: number },
		snapshot: Texture2D | null,
		incoming: Container2D,
	) {
		this.snapshot = snapshot;
		this.duration = Math.max(0.0001, options.duration ?? 0.5);
		this.ease = resolveEasing(options.easing);
		this.pause = options.pause ?? false;
		this.onDone = options.onDone;
		this.runtime = options.transition.start({
			width: size.width,
			height: size.height,
			snapshot,
			incoming,
			under: this.under,
			over: this.over,
		});
		this.runtime.update(0);
	}

	/** how far along it is, 0 to 1, before easing */
	get progress(): number {
		return this.finished ? 1 : Math.min(1, this.elapsed / this.duration);
	}

	get done(): boolean {
		return this.finished;
	}

	/** @returns true on the frame it ends (and on every call after) */
	update(dt: number): boolean {
		if (this.finished) return true;
		this.elapsed += dt;
		if (this.elapsed >= this.duration) {
			this.finish();
			return true;
		}
		this.runtime.update(this.ease(this.progress));
		return false;
	}

	/** jumps to the end: the transition's last frame is applied, its layers are emptied, `onDone` runs */
	finish(): void {
		if (this.finished) return;
		this.finished = true;
		this.runtime.update(1);
		this.runtime.destroy();
		this.snapshot?.destroy(true);
		this.under.destroy({ children: true });
		this.over.destroy({ children: true });
		this.onDone?.();
	}
}
