import type { TrainingFactory } from '../../src/simulation/index.ts';

export interface Courier {
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	deliveries: number;
}
export interface CourierState {
	tick: number;
	agents: Courier[];
}
export interface CourierConfig {
	agents: number;
	size: number;
	horizon: number;
}

/**
 * Generated courier task. This factory is self-contained because workers receive
 * its source. The playable scene and trainer both dispatch through these rules.
 */
export const courierEnvironment: TrainingFactory<CourierConfig, CourierState, readonly (number | null)[], number> = (
	{ TrainingEnvironment },
	config,
) => {
	if (
		!Number.isInteger(config.agents) ||
		config.agents < 1 ||
		config.agents > 256 ||
		!Number.isInteger(config.size) ||
		config.size < 2 ||
		config.size > 128
	)
		throw new RangeError('courier configuration requires 1..256 agents and size 2..128');
	return new TrainingEnvironment(
		{
			observationVersion: 'courier-v1',
			initial: (random) => ({
				tick: 0,
				agents: Array.from({ length: config.agents }, () => ({
					x: random.int(config.size),
					y: random.int(config.size),
					targetX: random.int(config.size),
					targetY: random.int(config.size),
					deliveries: 0,
				})),
			}),
			observe: (state) =>
				state.agents.map((agent) => ({
					input: [(agent.targetX - agent.x) / config.size, (agent.targetY - agent.y) / config.size],
					mask: [agent.x > 0, agent.x < config.size - 1, agent.y > 0, agent.y < config.size - 1],
				})),
			command: (_state, actions) => actions,
			rule: (state, actions, random) => {
				for (let i = 0; i < state.agents.length; i++) {
					const agent = state.agents[i];
					if (actions[i] === 0) agent.x--;
					else if (actions[i] === 1) agent.x++;
					else if (actions[i] === 2) agent.y--;
					else if (actions[i] === 3) agent.y++;
					if (agent.x === agent.targetX && agent.y === agent.targetY) {
						agent.deliveries++;
						agent.targetX = random.int(config.size);
						agent.targetY = random.int(config.size);
					}
				}
				state.tick++;
				return { state, events: [], status: state.tick >= config.horizon ? 'finished' : 'ready' };
			},
			rewards: (before, _command, outcome) =>
				outcome.state.agents.map((agent, i) => agent.deliveries - before.agents[i].deliveries),
		},
		{ maxSteps: config.horizon },
	);
};
