import { Container } from 'pixi.js';
import { Scene } from '../core/Scene.ts';
import { Game } from './Game.ts';
import type { Container2D } from './render/Types2D.ts';
import type { TransitionOptions } from './render/SceneTransition.ts';

/**
 * A scene that draws through Pixi: `core.Scene`'s lifecycle plus the container everything
 * this screen shows hangs off.
 *
 * This is what a 2D game extends. The container is destroyed with the scene, so a scene may
 * add whatever it likes to `stage` without tracking it for cleanup. The base class holds the
 * lifecycle alone precisely so that `core.SceneStack` can drive a Babylon scene just as well
 * as this one - the stack calls `create`, `resize`, `onSuspend`, `onResume` and `destroy`,
 * and never touches `stage`.
 */
export abstract class Scene2D extends Scene {
	/** everything this scene draws hangs off here */
	readonly stage: Container2D = new Container();

	/**
	 * Replaces what this scene shows under a transition: the current picture is photographed, `swap`
	 * changes the content (a new level, decor, layout), and the transition plays over the result.
	 * Without a running `Game` (a test) `swap` just runs.
	 *
	 * @example
	 * ```ts
	 * import { Scene2D } from '@datamoc/mw_games/two-d';
	 * import { tileShrink } from '@datamoc/mw_games/two-d/render';
	 *
	 * class Levels extends Scene2D {
	 * 	override create(): void {}
	 * 	private level = 1;
	 * 	next(): void {
	 * 		this.transitionTo(() => this.load(++this.level), { transition: tileShrink({ columns: 8, rows: 5 }), duration: 0.6 });
	 * 	}
	 * 	private load(level: number): void {
	 * 		console.log('loading level', level);
	 * 	}
	 * }
	 * ```
	 */
	transitionTo(swap: () => void, options: TransitionOptions): void {
		const game = Game.active;
		if (game) game.transition(swap, options);
		else swap();
	}

	protected override teardown(): void {
		this.stage.destroy({ children: true });
	}
}

export type Scene2DClass = new () => Scene2D;
