/**
 * A scene control API for tests (roadmap 408): named steps a game opts into, driven by name.
 *
 * A game's own scene flow - enter a scenario, finish a turn, advance a dialogue - is private
 * to the game, and that is the point of this seam: instead of the framework reaching into a
 * game, the game registers the steps it wants a test or a headless Chrome to be able to
 * drive, by name, on a `SceneControls`. The game decides what a step does; the controls only
 * promise that a registered name runs its step and an unknown name is refused by name.
 *
 * Kept off the root barrel with the rest of `src/testing`: nothing here reaches a shipped
 * game unless a test imports it.
 *
 * @example
 * ```ts
 * import { createSceneControls } from '@datamoc/mw_games/testing';
 *
 * const controls = createSceneControls();
 * const enterScenario = (name: string) => {}; // the game's own private scene flow
 * controls.register('enterScenario', () => enterScenario('the-freelands'));
 * controls.register('finishTurn', () => {});
 * ```
 */

export type SceneStep = () => void | Promise<void>;

export interface SceneControls {
	/** one step by name; a duplicate name is refused rather than overwritten */
	register(step: string, run: SceneStep): void;
	/** whether a step is registered */
	has(step: string): boolean;
	/** every registered name, in registration order */
	steps(): string[];
	/** run one step, refusing an unknown name; awaits a step that returns a promise */
	run(step: string): Promise<void>;
}

export function createSceneControls(): SceneControls {
	const registry = new Map<string, SceneStep>();
	const order: string[] = [];
	return {
		register(step, run) {
			if (!step) throw new Error('a scene control step needs a name');
			if (registry.has(step)) throw new Error(`scene control step already registered: ${step}`);
			registry.set(step, run);
			order.push(step);
		},
		has(step) {
			return registry.has(step);
		},
		steps() {
			return [...order];
		},
		async run(step) {
			const run2 = registry.get(step);
			if (!run2) throw new Error(`scene control step is not registered: ${step}`);
			await run2();
		},
	};
}
