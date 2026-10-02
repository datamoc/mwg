import type { Generator } from '../../src/core/Random.ts';
import type { SimulationRule } from '../../src/simulation/index.ts';
import type { NeuralObservation } from '../../src/ai/index.ts';

export interface MazeGhost {
	square: number;
	direction: number;
	home: number;
	sleep: number;
}
export interface MazeState {
	player: number;
	home: number;
	direction: number;
	ghosts: MazeGhost[];
	dots: number[];
	powers: number[];
	score: number;
	lives: number;
	tick: number;
	powered: number;
	grace: number;
	status: 'playing' | 'won' | 'lost';
}
export interface MazeCommand {
	player: number | null;
	ghosts: readonly (number | null)[];
}
export type MazeEvent = 'dot' | 'power' | 'ghost' | 'death' | 'win';

/** Original lattice maze and rules. Shared by browser play, Node training and tests. */
export function createMazeGame() {
	const width = 21,
		height = 19;
	const floors = new Set<number>();
	for (let y = 1; y < height - 1; y++)
		for (let x = 1; x < width - 1; x++) if (x % 4 === 1 || y % 4 === 1) floors.add(y * width + x);
	const start = 17 * width + 9;
	const homes = [9 * width + 9, 9 * width + 5, 9 * width + 13, 5 * width + 9];
	const offsets = [-width, 1, width, -1];
	const mask = (square: number): boolean[] => offsets.map((offset) => floors.has(square + offset));
	const neighbour = (square: number, direction: number | null): number => {
		if (
			direction === null ||
			!Number.isInteger(direction) ||
			direction < 0 ||
			direction > 3 ||
			!mask(square)[direction]
		)
			return square;
		return square + offsets[direction];
	};
	const distances = (targets: readonly number[]): Map<number, number> => {
		const distance = new Map<number, number>();
		const queue: number[] = [];
		for (const target of targets)
			if (floors.has(target) && !distance.has(target)) {
				distance.set(target, 0);
				queue.push(target);
			}
		for (let i = 0; i < queue.length; i++) {
			const current = queue[i];
			for (const offset of offsets) {
				const next = current + offset;
				if (!floors.has(next) || distance.has(next)) continue;
				distance.set(next, distance.get(current)! + 1);
				queue.push(next);
			}
		}
		return distance;
	};
	const initial = (random?: Generator): MazeState => {
		const player = random ? 17 * width + 1 + random.int(19) : start;
		return {
			player,
			home: player,
			direction: 3,
			ghosts: homes.map((home) => ({ square: home, home, direction: 0, sleep: 0 })),
			dots: [...floors].filter((square) => square !== player),
			powers: [width + 1, width + 17, 17 * width + 1, 17 * width + 17],
			score: 0,
			lives: 3,
			tick: 0,
			powered: 0,
			grace: 0,
			status: 'playing',
		};
	};
	const observe = (state: MazeState, ghostIndex?: number): NeuralObservation => {
		const ghost = ghostIndex === undefined ? null : state.ghosts[ghostIndex];
		const square = ghost?.square ?? state.player;
		const direction = ghost?.direction ?? state.direction;
		const legal = mask(square);
		if (ghost && !state.powered) {
			const reverse = (direction + 2) % 4;
			if (legal.some((allowed, i) => allowed && i !== reverse)) legal[reverse] = false;
		}
		const target = distances(ghost ? [state.player] : state.dots);
		const danger =
			ghost || state.powered || state.grace
				? new Map<number, number>()
				: distances(state.ghosts.filter((actor) => !actor.sleep).map((actor) => actor.square));
		const currentDistance = target.get(square) ?? 0;
		const input: number[] = [];
		for (let action = 0; action < 4; action++) {
			const next = neighbour(square, action);
			const nextDistance = target.get(next) ?? currentDistance;
			const progress =
				(state.powered && ghost ? nextDistance - currentDistance : currentDistance - nextDistance) + 1;
			input.push(
				Math.max(0, Math.min(1, progress / 2)),
				Math.max(0, (5 - (danger.get(next) ?? 5)) / 5),
				ghost ? 0 : state.powers.includes(next) ? 1 : state.dots.includes(next) ? 0.5 : 0,
				action === direction ? 1 : 0,
			);
		}
		return { input, mask: legal };
	};
	const rule: SimulationRule<MazeState, MazeCommand, MazeEvent, Generator> = (state, command) => {
		const events: MazeEvent[] = [];
		if (state.status !== 'playing') return { state, events, status: 'finished' };
		const beforePlayer = state.player;
		const beforeGhosts = state.ghosts.map((ghost) => ghost.square);
		state.tick++;
		state.powered = Math.max(0, state.powered - 1);
		state.grace = Math.max(0, state.grace - 1);
		if (command.player !== null && neighbour(state.player, command.player) !== state.player)
			state.direction = command.player;
		state.player = neighbour(state.player, state.direction);
		const dot = state.dots.indexOf(state.player);
		if (dot >= 0) {
			state.dots.splice(dot, 1);
			state.score += 10;
			events.push('dot');
		}
		const power = state.powers.indexOf(state.player);
		if (power >= 0) {
			state.powers.splice(power, 1);
			state.powered = 60;
			state.score += 40;
			events.push('power');
		}
		for (let i = 0; i < state.ghosts.length; i++) {
			const ghost = state.ghosts[i];
			if (ghost.sleep) {
				ghost.sleep--;
				continue;
			}
			if (state.tick % 2 === 0) {
				const action = command.ghosts[i];
				if (action !== undefined && action !== null && neighbour(ghost.square, action) !== ghost.square)
					ghost.direction = action;
				ghost.square = neighbour(ghost.square, ghost.direction);
			}
			const collided =
				ghost.square === state.player || (ghost.square === beforePlayer && beforeGhosts[i] === state.player);
			if (!collided) continue;
			if (state.powered) {
				ghost.square = ghost.home;
				ghost.sleep = 12;
				state.score += 200;
				events.push('ghost');
			} else if (!state.grace) {
				state.lives--;
				state.player = state.home;
				state.direction = 3;
				state.grace = 24;
				for (const actor of state.ghosts) {
					actor.square = actor.home;
					actor.sleep = 0;
					actor.direction = 0;
				}
				if (!state.lives) state.status = 'lost';
				events.push('death');
				break;
			}
		}
		if (!state.dots.length && state.status === 'playing') {
			state.status = 'won';
			events.push('win');
		}
		return { state, events, status: state.status === 'playing' ? 'ready' : 'finished' };
	};
	return { width, height, floors, initial, mask, neighbour, distances, observe, rule };
}

/** Scores used by the heuristic and as supervised labels for this example's small policy. */
export function expertScores(observation: NeuralObservation): number[] {
	return Array.from({ length: 4 }, (_, action) => {
		const at = action * 4;
		return (
			observation.input[at] * 4 -
			observation.input[at + 1] * 6 +
			observation.input[at + 2] * 3 +
			observation.input[at + 3] * 0.08
		);
	});
}
