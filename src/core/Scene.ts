import { Signal } from './Signal.ts';

/**
 * One screen of the game: a title, a menu, the dungeon itself.
 *
 * This is the lifecycle half only, and owns no renderer: `create`, `update`, `resize`, the
 * suspend/resume pair a pushed scene needs, and a destroy that fires once. `two-d.Scene2D`
 * adds the Pixi container a 2D game draws into; a Babylon game supplies its own equivalent.
 * The split exists so `SceneStack` - which never touches a display node, only these methods -
 * works for either, rather than scene management being something only a Pixi game gets.
 *
 * Switching scenes destroys the old one, so a scene may hold whatever state it likes without
 * cleaning up by hand.
 *
 * @example
 * ```ts
 * import { Scene } from '@datamoc/mw_games/core';
 *
 * // a 2D game extends two-d.Scene2D instead, which adds the Pixi display container;
 * // this base is what a renderer-free game (or a Babylon one) extends directly.
 * class TitleScreen extends Scene {
 *   create(): void {
 *     // build the screen's own state here
 *   }
 * }
 * ```
 */
export abstract class Scene {
	/** fires when the scene is torn down, for listeners that need to detach */
	readonly onDestroy = new Signal<void>();

	private destroyed = false;

	/** builds the scene's contents; assets are already loaded when this runs */
	abstract create(): void;

	/** @param dt seconds since the previous frame, already clamped */
	update(_dt: number): void {
		//scenes that only react to input need no per-frame work
	}

	/** the display was resized; the scene may relayout rather than be rebuilt */
	resize(_width: number, _height: number): void {
		//most scenes lay out in create() and are rebuilt instead
	}

	/**
	 * Called when another scene is pushed on top of this one.
	 *
	 * Updating already stops on its own - only the top scene runs - but input
	 * listeners do not stand down by themselves. A scene holding windows, music
	 * or key handlers pauses or detaches them here; the default does nothing.
	 */
	onSuspend(): void {
		//scenes with nothing live need nothing stood down
	}

	/**
	 * Called when the scene above pops, reporting back what it decided.
	 *
	 * @param result whatever the popped scene passed to `popScene` - a choice,
	 * a score, or nothing at all. Games cast it to what their minigame returns.
	 */
	onResume(_result: unknown): void {
		//scenes that pushed nothing back need nothing reported
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		this.onDestroy.dispatch();
		this.onDestroy.removeAll();
		this.teardown();
	}

	/**
	 * Renderer-owned resources this scene holds, released exactly once as it is destroyed.
	 *
	 * The base owns none, because it owns no renderer; `two-d.Scene2D` destroys its container
	 * here. A subclass overriding it does not need to call `super.teardown()`.
	 */
	protected teardown(): void {
		//nothing renderer-shaped at this level
	}

	get isDestroyed(): boolean {
		return this.destroyed;
	}
}

export type SceneClass<T extends Scene = Scene> = new () => T;
