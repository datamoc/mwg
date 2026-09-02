import { Container } from 'pixi.js';
import { Signal } from './Signal.ts';

/**
 * One screen of the game: a title, a menu, the dungeon itself.
 *
 * A scene owns a Pixi container and everything in it. Switching scenes destroys the old
 * one, so a scene may hold whatever state it likes without cleaning up by hand.
 */
export abstract class Scene {
	/** everything this scene draws hangs off here */
	readonly stage = new Container();

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
		this.stage.destroy({ children: true });
	}

	get isDestroyed(): boolean {
		return this.destroyed;
	}
}

export type SceneClass = new () => Scene;
