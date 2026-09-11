import { TintedSprite } from './TintedSprite.ts';
import type { Texture2D } from './Types2D.ts';

/**
 * One frame, with its own timing and its own place.
 *
 * A frame may carry its own duration, which is what Wesnoth writes as `image=a.png:120,b.png:80`: a
 * list of frames with how long each is held. It may also sit a few pixels away from where the sprite
 * is - a recoil, a hit shake, a frame drawn high on purpose.
 */
export interface AnimationFrame {
	readonly texture: Texture2D;

	/** seconds this frame is held; without it, `AnimationOptions.fps` decides */
	readonly duration?: number;

	/** pixels this frame is drawn away from the sprite's own position */
	readonly offsetX?: number;
	readonly offsetY?: number;
}

/** a plain texture is a frame with no timing or offset of its own */
export type AnimationFrameInput = Texture2D | AnimationFrame;

export interface AnimationOptions {
	/** frames per second: the duration of every frame that does not carry one of its own */
	fps?: number;

	/** whether to start again at the end, or hold on the last frame */
	loop?: boolean;

	/**
	 * Seconds into its own timeline this animation starts at. Positive holds the first frame that
	 * much longer, negative skips that much of the leading frames. The negative case is not a quirk:
	 * it is how Wesnoth lines an attack animation up with the frame the damage lands on, by starting
	 * mid-swing (`start_time=-450` over frames of 100ms each skips four and a half of them). The
	 * offset applies once, when playback starts; a looping animation then cycles on the frames' own
	 * length, so the delay does not repeat every lap.
	 */
	startTime?: number;
}

/**
 * @example
 * ```ts
 * import { Animation } from '@datamoc/mw_games/two-d/render';
 * import type { Texture2D } from '@datamoc/mw_games/two-d/render';
 *
 * declare const frames: Texture2D[];
 *
 * const walk = new Animation(frames, { fps: 10 });
 * console.log(walk.duration); // frames.length / 10, in seconds
 * ```
 */
export class Animation {
	readonly frames: readonly AnimationFrame[];

	/** the duration every frame without one of its own is held for */
	readonly frameDuration: number;

	readonly loop: boolean;
	readonly startTime: number;

	/** how long one pass over the frames takes, `startTime` excluded */
	readonly duration: number;

	/** each frame's resolved duration, in order: `frameAt` walks these rather than the frames */
	private readonly times: readonly number[];

	constructor(
		frames: readonly AnimationFrameInput[],
		{ fps = 10, loop = true, startTime = 0 }: AnimationOptions = {},
	) {
		if (frames.length === 0) throw new Error('an animation needs at least one frame');
		if (!(fps > 0)) throw new Error(`an animation needs a positive fps, got ${fps}`);

		this.frameDuration = 1 / fps;
		this.frames = frames.map((frame) => (isFrame(frame) ? frame : { texture: frame }));
		this.times = this.frames.map((frame) => frame.duration ?? this.frameDuration);
		this.loop = loop;
		this.startTime = startTime;

		//the frames that borrow the fps are multiplied rather than added one by one: ten frames at a
		//tenth of a second are exactly a second, where summing ten copies of 0.1 lands an ulp away
		//from it. This total is what a loop wraps on and what a one-shot animation is timed against
		let uniform = 0;
		let timed = 0;
		for (const frame of this.frames) {
			if (frame.duration === undefined) uniform++;
			else timed += frame.duration;
		}
		this.duration = uniform * this.frameDuration + timed;
	}

	/** the frame playing `seconds` in, with `startTime` and `loop` applied */
	frameAt(seconds: number): AnimationFrame {
		return this.frames[this.frameIndexAt(seconds)];
	}

	/**
	 * Which frame plays `seconds` in. Before it starts the first frame is held, however long that
	 * is, and a non-looping animation that has run out stays on its last frame rather than running
	 * off the end.
	 */
	frameIndexAt(seconds: number): number {
		const elapsed = seconds - this.startTime;
		if (elapsed <= 0) return 0;

		const total = this.duration;
		if (total <= 0) return this.frames.length - 1;

		let time = this.loop ? elapsed % total : Math.min(elapsed, total);
		for (let index = 0; index < this.times.length; index++) {
			if (time < this.times[index]) return index;
			time -= this.times[index];
		}
		return this.frames.length - 1;
	}
}

function isFrame(frame: AnimationFrameInput): frame is AnimationFrame {
	return typeof (frame as AnimationFrame).texture !== 'undefined';
}

/**
 * A sprite that plays named animations, and can still be tinted.
 *
 * Animations are registered once and played by name, which is how a character ends up
 * reading as `hero.play('walk')` rather than juggling frame arrays.
 *
 * Nothing advances on its own: call `update(dt)` from the scene, or add the sprite to a
 * `SpriteGroup`, so that pausing the game pauses the animations with it.
 *
 * Frames may carry their own duration, and the animation may start partway into itself, which is
 * what Wesnoth's `image=a.png:120,b.png:80` and `start_time=-450` mean. A frame may also carry an
 * offset, so a swing recoils a few pixels without a second texture: `frameOffset` reports it, and
 * the *caller* adds it where it already positions the sprite. The framework does not apply it
 * itself, on purpose - this sprite's position belongs to whoever put it there (a `GridMover`, a
 * walk tween, a camera projection), and a sprite that overwrote `y` every frame would undo that
 * every frame. `FloatingText` learned the same rule the hard way.
 *
 * Reduced motion deliberately does not pause this. A frame cycle is usually game state - a
 * walking enemy that freezes when the player has asked for less motion is a bug, not an
 * accommodation, and the article's own "Don't Reduce Too Much" is about exactly this. A game
 * whose loops are purely decorative (torches, rippling water) can stop those itself through
 * `paused`, or not add the sprite at all.
 *
 * Extends `TintedSprite` directly, so `alpha` composes with `tint`/`colorAdd` the same
 * way here too - a translucent, animated ghost is `alpha = 0.5` plus whatever tint, no
 * different from a still one (see `TintedSprite`'s own doc comment).
 *
 * @example
 * ```ts
 * import { AnimatedSprite, SpriteSheet } from '@datamoc/mw_games/two-d/render';
 *
 * declare const sheet: SpriteSheet;
 *
 * const hero = new AnimatedSprite();
 * hero.add('idle', sheet.pick(0, 0, 0, 1), { fps: 2 });
 * hero.add('walk', sheet.range(6, 10), { fps: 10 });
 * hero.add('die', sheet.range(11, 14), { fps: 10, loop: false });
 * hero.add(
 *   'thrust',
 *   [
 *     { texture: sheet.get(20), duration: 0.4 },
 *     { texture: sheet.get(21), duration: 0.1, offsetX: 3 }, // the lunge
 *   ],
 *   { startTime: -0.2 },
 * );
 * hero.play('idle');
 *
 * hero.onFinish = (name) => console.log(`${name} finished`);
 * hero.update(1 / 60); // advance one frame's worth of time
 * ```
 */
export class AnimatedSprite extends TintedSprite {
	private animations = new Map<string, Animation>();

	private current: Animation | null = null;
	private currentName: string | null = null;
	private elapsed = 0;
	private finished = false;
	private readonly offset = { x: 0, y: 0 };

	/** fires once when a non-looping animation reaches its last frame */
	onFinish: ((name: string) => void) | null = null;

	paused = false;

	add(name: string, frames: readonly AnimationFrameInput[], options?: AnimationOptions): this {
		this.animations.set(name, new Animation(frames, options));
		return this;
	}

	has(name: string): boolean {
		return this.animations.has(name);
	}

	get playing(): string | null {
		return this.currentName;
	}

	get isFinished(): boolean {
		return this.finished;
	}

	/**
	 * Where the current frame is drawn relative to the sprite's own position, in pixels. The caller
	 * adds it, as in `sprite.position.set(x + sprite.frameOffset.x, y + sprite.frameOffset.y)`. Both
	 * are zero for a frame with no offset of its own.
	 */
	get frameOffset(): { readonly x: number; readonly y: number } {
		return this.offset;
	}

	/** how long the current animation has been running, `startTime` and all */
	get elapsedTime(): number {
		return this.elapsed;
	}

	/**
	 * Starts an animation.
	 *
	 * Playing the one already running does nothing, so a movement loop can call
	 * `play('walk')` every frame without restarting it. Pass `restart` to force it.
	 */
	play(name: string, restart = false): this {
		if (!restart && this.currentName === name && !this.finished) return this;

		const animation = this.animations.get(name);
		if (!animation) throw new Error(`no animation named "${name}" on this sprite`);

		this.current = animation;
		this.currentName = name;
		this.elapsed = 0;
		this.finished = false;
		this.show(animation.frameAt(0));

		return this;
	}

	stop(): void {
		this.current = null;
		this.currentName = null;
	}

	update(dt: number): void {
		const animation = this.current;
		if (!animation || this.paused || this.finished) return;

		//elapsed rather than a leftover timer: one long frame lands on the right frame instead of
		//catching up through each of them, which keeps two sprites started together in step
		this.elapsed += dt;
		this.show(animation.frameAt(this.elapsed));

		if (!animation.loop && this.elapsed >= animation.startTime + animation.duration) {
			this.finished = true;
			this.onFinish?.(this.currentName!);
		}
	}

	private show(frame: AnimationFrame): void {
		this.texture = frame.texture;
		this.offset.x = frame.offsetX ?? 0;
		this.offset.y = frame.offsetY ?? 0;
	}
}
