import { Aspects, HeuristicAI, JavaScriptAI, NeuralPolicy } from '../../src/ai/index.ts';
import type { NeuralModel } from '../../src/ai/index.ts';
import { Generator } from '../../src/core/Random.ts';
import type { MazeState } from './game.ts';
import { createMazeGame } from './game.ts';

export type GhostMode = 'random' | 'chase' | 'heuristic' | 'neural';
export type PlayerMode = 'human' | 'random' | 'heuristic' | 'neural';

/** The selectors use framework runners; the game owns perception and each action's meaning. */
export class MazeControllers {
	private random: Generator;
	private policy: NeuralPolicy;
	private heuristic = new HeuristicAI<number>({ stages: [{ id: 'path-and-risk' }] });
	private aspects = new Aspects({ progress: 4, danger: -6, reward: 3, inertia: 0.08 });
	private rules = new JavaScriptAI({ seed: 395 });

	constructor(privateGame: ReturnType<typeof createMazeGame>, model: NeuralModel, seed = 395) {
		this.game = privateGame;
		this.random = new Generator(seed);
		this.policy = new NeuralPolicy(model);
		if (model.observationVersion !== 'maze-chase-v1') throw new TypeError('maze model schema does not match');
		this.rules.register({
			id: 'chaser',
			behaviors: [
				{
					id: 'direct-chase',
					decide: (context) => {
						const perception = context.perception as { legal: number[]; distance: number[]; flee: boolean };
						let action = perception.legal[0];
						for (const candidate of perception.legal)
							if (
								perception.flee
									? perception.distance[candidate] > perception.distance[action]
									: perception.distance[candidate] < perception.distance[action]
							)
								action = candidate;
						return action === undefined ? null : { type: 'move', direction: action };
					},
				},
			],
		});
	}
	private readonly game: ReturnType<typeof createMazeGame>;

	choose(state: MazeState, mode: GhostMode | PlayerMode, ghostIndex?: number): number | null {
		if (mode === 'human') return null;
		const observation = this.game.observe(state, ghostIndex);
		const legal = observation.mask!.flatMap((allowed, action) => (allowed ? [action] : []));
		if (!legal.length) return null;
		if (mode === 'random') return legal[this.random.int(legal.length)];
		if (mode === 'neural') return this.policy.selectAction(observation);
		if (mode === 'chase') {
			const square = state.ghosts[ghostIndex!].square;
			const distance = Array.from({ length: 4 }, (_, action) => {
				const next = this.game.neighbour(square, action);
				return (
					Math.abs((next % this.game.width) - (state.player % this.game.width)) +
					Math.abs(Math.floor(next / this.game.width) - Math.floor(state.player / this.game.width))
				);
			});
			return (
				(this.rules.decide('chaser', { perception: { legal, distance, flee: state.powered > 0 } }).action
					?.direction as number | undefined) ?? null
			);
		}
		return (
			this.heuristic.decide(
				legal.map((action) => ({
					id: String(action),
					action,
					factors: {
						progress: observation.input[action * 4],
						danger: observation.input[action * 4 + 1],
						reward: observation.input[action * 4 + 2],
						inertia: observation.input[action * 4 + 3],
					},
				})),
				{ aspects: this.aspects },
			)?.candidate.action ?? null
		);
	}
}
