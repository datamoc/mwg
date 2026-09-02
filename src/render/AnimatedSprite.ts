import type { Texture } from 'pixi.js';
import { TintedSprite } from './TintedSprite.ts';

export interface AnimationOptions {
	/** frames per second */
	fps?: number;

	/** whether to start again at the end, or hold on the last frame */
	loop?: boolean;
}

export class Animation {
	readonly frames: readonly Texture[];
	readonly frameDuration: number;
	readonly loop: boolean;

	constructor(frames: readonly Texture[], { fps = 10, loop = true }: AnimationOptions = {}) {
		if (frames.length === 0) throw new Error('an animation needs at least one frame');
		this.frames = frames;
		this.frameDuration = 1 / fps;
		this.loop = loop;
	}

	get duration(): number {
		return this.frameDuration * this.frames.length;
	}
}

/**
 * A sprite that plays named animations, and can still be tinted.
 *
 * Animations are registered once and played by name, which is how a character ends up
 * reading as `hero.play('walk')` rather than juggling frame arrays:
 *
 * ```ts
 * const hero = new AnimatedSprite();
 * hero.add('idle', sheet.pick(0, 0, 0, 1), { fps: 2 });
 * hero.add('walk', sheet.range(6, 10), { fps: 10 });
 * hero.add('die', sheet.range(11, 14), { fps: 10, loop: false });
 * hero.play('idle');
 * ```
 *
 * Nothing advances on its own: call `update(dt)` from the scene, or add the sprite to a
 * `SpriteGroup`, so that pausing the game pauses the animations with it.
 */
export class AnimatedSprite extends TintedSprite {
	private animations = new Map<string, Animation>();

	private current: Animation | null = null;
	private currentName: string | null = null;
	private frameIndex = 0;
	private timer = 0;
	private finished = false;

	/** fires once when a non-looping animation reaches its last frame */
	onFinish: ((name: string) => void) | null = null;

	paused = false;

	add(name: string, frames: readonly Texture[], options?: AnimationOptions): this {
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
		this.frameIndex = 0;
		this.timer = 0;
		this.finished = false;
		this.texture = animation.frames[0];

		return this;
	}

	stop(): void {
		this.current = null;
		this.currentName = null;
	}

	update(dt: number): void {
		const animation = this.current;
		if (!animation || this.paused || this.finished) return;

		this.timer += dt;

		//a long frame may cross several animation frames, so this catches up rather than
		//dropping them, which keeps two sprites started together in step
		while (this.timer >= animation.frameDuration) {
			this.timer -= animation.frameDuration;

			if (this.frameIndex < animation.frames.length - 1) {
				this.frameIndex++;
			} else if (animation.loop) {
				this.frameIndex = 0;
			} else {
				this.finished = true;
				this.onFinish?.(this.currentName!);
				break;
			}
		}

		this.texture = animation.frames[this.frameIndex];
	}
}
