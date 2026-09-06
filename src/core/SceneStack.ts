import type { Scene } from './Scene.ts';

/**
 * The stack of scenes a `Game` runs: exactly one updates, all render.
 *
 * Generic over the scene type, and typed against `core.Scene`'s lifecycle rather than any
 * display node, so a Pixi game uses `SceneStack<Scene2D>` and a Babylon game its own - this
 * class only ever calls `create`, `destroy`, `resize`, `update`, `onSuspend` and `onResume`.
 *
 * `switchScene` replaces the whole stack, for moving between screens.
 * `pushScene` suspends the current scene and starts another on top of it - a
 * minigame over the dungeon, a pause menu over play - and `popScene` destroys
 * the top and resumes whatever was underneath, reporting back a result. Only
 * the top scene updates; every scene in the stack stays in the display list, so
 * a pushed scene can be translucent (layered *over*) or opaque (*instead of*).
 *
 * Takes instances, never classes: constructing scenes is the `Game`'s job, and
 * keeping it out is what keeps this testable without a browser.
 *
 * @example
 * ```ts
 * import { SceneStack, Scene } from '@datamoc/mw_games/core';
 *
 * class DungeonScene extends Scene {
 *   create(): void {}
 *   onResume(result: unknown): void {
 *     console.log('the pushed scene reported back', result);
 *   }
 * }
 * class PauseMenu extends Scene {
 *   create(): void {}
 * }
 *
 * const stack = new SceneStack();
 * stack.replace(new DungeonScene());
 * stack.push(new PauseMenu()); // dungeon suspends, pause menu draws over it
 * stack.pop('resumed'); // pause menu destroyed, DungeonScene.onResume('resumed') fires
 * ```
 */
export class SceneStack<T extends Scene = Scene> {
	private scenes: T[] = [];

	/** the scene that updates, or null when the stack is empty */
	get current(): T | null {
		return this.scenes.length === 0 ? null : this.scenes[this.scenes.length - 1];
	}

	get depth(): number {
		return this.scenes.length;
	}

	/** replaces everything with one scene, destroying what was there */
	replace(scene: T): void {
		for (const old of this.scenes) old.destroy();
		this.scenes = [scene];
		scene.create();
	}

	/** suspends the current scene and starts another above it */
	push(scene: T): void {
		this.current?.onSuspend();
		this.scenes.push(scene);
		scene.create();
	}

	/**
	 * Destroys the top scene and resumes the one below with `result`.
	 *
	 * Throws when only one scene is left: popping it would leave the game with
	 * nothing to run, which is always an authoring error rather than intent.
	 */
	pop(result?: unknown): void {
		if (this.scenes.length <= 1) {
			throw new Error('cannot pop the last scene off the stack - switchScene somewhere instead');
		}
		const top = this.scenes.pop();
		top?.destroy();
		this.current?.onResume(result);
	}

	/** only the top scene runs; the suspended ones wait underneath */
	update(dt: number): void {
		this.current?.update(dt);
	}

	/** every scene relayouts, including the suspended ones waiting underneath */
	resize(width: number, height: number): void {
		for (const scene of this.scenes) scene.resize(width, height);
	}

	destroy(): void {
		for (const scene of this.scenes) scene.destroy();
		this.scenes = [];
	}
}
