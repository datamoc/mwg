import type { Scene } from './Scene.ts';

/**
 * The stack of scenes a `Game` runs: exactly one updates, all render.
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
 */
export class SceneStack {
	private scenes: Scene[] = [];

	/** the scene that updates, or null when the stack is empty */
	get current(): Scene | null {
		return this.scenes.length === 0 ? null : this.scenes[this.scenes.length - 1];
	}

	get depth(): number {
		return this.scenes.length;
	}

	/** replaces everything with one scene, destroying what was there */
	replace(scene: Scene): void {
		for (const old of this.scenes) old.destroy();
		this.scenes = [scene];
		scene.create();
	}

	/** suspends the current scene and starts another above it */
	push(scene: Scene): void {
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
