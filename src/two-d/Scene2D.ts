import { Container } from 'pixi.js';
import { Scene } from '../core/Scene.ts';
import type { Container2D } from './render/Types2D.ts';

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

	protected override teardown(): void {
		this.stage.destroy({ children: true });
	}
}

export type Scene2DClass = new () => Scene2D;
