import type { Scene } from './Scene.ts';
import { Registry } from './Registry.ts';

/**
 * One self-contained section of a scene - map logic, encounter logic, UI wiring - with its
 * own slice of `core.Scene`'s lifecycle, registered by name into a `SceneComponentHost`
 * instead of folded into one growing scene class.
 *
 * Every hook is optional and receives the owning scene, so a component reads whatever the
 * scene exposes (a `two-d.Scene2D`'s `stage`, a game's own fields) without the host needing
 * to know what a scene actually is beyond `core.Scene`'s lifecycle shape.
 */
export interface SceneComponent<TScene extends Scene = Scene> {
	readonly name: string;
	create?(scene: TScene): void;
	update?(scene: TScene, dt: number): void;
	resize?(scene: TScene, width: number, height: number): void;
	onSuspend?(scene: TScene): void;
	onResume?(scene: TScene, result: unknown): void;
	destroy?(scene: TScene): void;
}

/**
 * Composes a scene out of named `SceneComponent`s instead of one class accreting every
 * responsibility a scene ends up needing - a factory assembling named sections (map,
 * encounters, UI) at scene-creation time, each a separate module with its own lifecycle.
 *
 * A composition helper, not a base class: a scene owns one `SceneComponentHost` and forwards
 * `core.Scene`'s lifecycle methods to it, the same few lines regardless of whether that scene
 * extends `core.Scene` directly or `two-d.Scene2D` - inheritance would have to pick one of
 * those to sit above, composition does not.
 *
 * @example
 * ```ts
 * import { Scene, SceneComponentHost, type SceneComponent } from '@datamoc/mw_games/core';
 *
 * class MapSection implements SceneComponent<DungeonScene> {
 *   readonly name = 'map';
 *   create(scene: DungeonScene): void { console.log('map ready for', scene.floor); }
 *   update(_scene: DungeonScene, dt: number): void { }
 * }
 *
 * class DungeonScene extends Scene {
 *   floor = 1;
 *   private components = new SceneComponentHost<DungeonScene>();
 *
 *   create(): void {
 *     this.components.add(new MapSection(), this);
 *   }
 *   override update(dt: number): void { this.components.update(this, dt); }
 *   protected override teardown(): void { this.components.destroy(this); }
 * }
 * ```
 */
export class SceneComponentHost<TScene extends Scene = Scene> {
	private order: SceneComponent<TScene>[] = [];
	private registry = new Registry<SceneComponent<TScene>>();

	/** registers `component` and immediately runs its `create`, if it has one */
	add(component: SceneComponent<TScene>, scene: TScene): void {
		this.registry.register(component.name, component);
		this.order.push(component);
		component.create?.(scene);
	}

	has(name: string): boolean {
		return this.registry.has(name);
	}

	/** the component registered under `name`; throws if none was */
	get<T extends SceneComponent<TScene> = SceneComponent<TScene>>(name: string): T {
		return this.registry.get(name) as T;
	}

	update(scene: TScene, dt: number): void {
		for (const c of this.order) c.update?.(scene, dt);
	}

	resize(scene: TScene, width: number, height: number): void {
		for (const c of this.order) c.resize?.(scene, width, height);
	}

	onSuspend(scene: TScene): void {
		for (const c of this.order) c.onSuspend?.(scene);
	}

	onResume(scene: TScene, result: unknown): void {
		for (const c of this.order) c.onResume?.(scene, result);
	}

	/** destroys every component in reverse registration order, then forgets them all */
	destroy(scene: TScene): void {
		for (let i = this.order.length - 1; i >= 0; i--) this.order[i].destroy?.(scene);
		this.order = [];
		this.registry = new Registry<SceneComponent<TScene>>();
	}
}
