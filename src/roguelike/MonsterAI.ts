import * as Random from '../core/Random.ts';
import type { Level } from './Level.ts';
import { FieldOfView } from './FieldOfView.ts';
import { neighbourOffsets, type PathOptions, type Pathfinder, type Step } from './Pathfinder.ts';

export type AIState = 'wander' | 'hunt' | 'flee';

/** hostile hunts on sight, same as ever; neutral/peaceful only wander until `provoked` */
export type Disposition = 'hostile' | 'neutral' | 'peaceful';

export interface AIDecision {
	state: AIState;
	/** where to move this turn; null when there is nowhere sensible to go */
	step: Step | null;
}

export interface MonsterAIOptions extends PathOptions {
	/** how far the monster can see, in cells - its own sight range, not the player's */
	sightRadius?: number;

	/** HP fraction (0 to 1) at or below which a visible target is fled rather than hunted */
	fleeBelow?: number;

	/** defaults to 'hostile' - always hunts on sight, exactly like every monster used to */
	disposition?: Disposition;

	/**
	 * true once this monster has been attacked (or otherwise provoked) - overrides a
	 * neutral/peaceful disposition back to hunting, permanently, the same as `hostile`. A
	 * game tracks this per monster and sets it the moment it lands the provoking hit; this
	 * function stores no state of its own between calls, same as `hpFraction`.
	 */
	provoked?: boolean;
}

/**
 * One monster's turn: wander when the target is outside its own sight, hunt when it can see
 * the target and is healthy, flee when it can see the target and its own HP has dropped to
 * `fleeBelow` or lower. Built entirely from `FieldOfView` and `Pathfinder` - both already
 * shipped - so this is what turns them into an actual decision, rather than a game
 * hand-rolling the same wander/hunt/flee branch on its own.
 *
 * A fresh `FieldOfView` per call is deliberate: a monster's sight is its own, not the
 * player's, and computing a small-radius shadowcast once per monster per turn is cheap at
 * the monster counts a level actually has. `mwg` does not decide what a monster does with
 * the result - a game's own turn loop calls this once per monster and acts on the `step`
 * (or doesn't, for wander's "nowhere in particular").
 */
export function decideMonsterAI(
	level: Level,
	pathfinder: Pathfinder,
	self: Step,
	hpFraction: number,
	target: Step,
	options: MonsterAIOptions = {}
): AIDecision {
	const sightRadius = options.sightRadius ?? 6;
	const fleeBelow = options.fleeBelow ?? 0;
	const hunts = (options.disposition ?? 'hostile') === 'hostile' || options.provoked === true;

	if (!hunts) {
		return { state: 'wander', step: wanderStep(level, self, options) };
	}

	const fov = new FieldOfView(level);
	fov.update(self.x, self.y, sightRadius);

	if (!fov.isVisible(target.x, target.y)) {
		return { state: 'wander', step: wanderStep(level, self, options) };
	}

	if (hpFraction <= fleeBelow) {
		return { state: 'flee', step: fleeStep(level, self, target, options) };
	}

	return { state: 'hunt', step: pathfinder.step(self, target, options) };
}

/** a random open neighbour, or null when boxed in - wandering needs no path, just a step */
function wanderStep(level: Level, self: Step, options: PathOptions): Step | null {
	const open = openNeighbours(level, self, options);
	return open.length > 0 ? Random.element(open)! : null;
}

/** the open neighbour furthest from the target - moving away needs no path either */
function fleeStep(level: Level, self: Step, target: Step, options: PathOptions): Step | null {
	const open = openNeighbours(level, self, options);
	let best: Step | null = null;
	let bestDistance = distanceSquared(self, target);

	for (const step of open) {
		const distance = distanceSquared(step, target);
		if (distance > bestDistance) {
			bestDistance = distance;
			best = step;
		}
	}
	return best;
}

function openNeighbours(level: Level, self: Step, options: PathOptions): Step[] {
	const blocked = options.blocked;
	const out: Step[] = [];

	for (const [dx, dy] of neighbourOffsets(options.topology ?? 8)) {
		const step = { x: self.x + dx, y: self.y + dy };
		if (!level.passable(step.x, step.y)) continue;
		if (blocked?.has(level.index(step.x, step.y))) continue;
		out.push(step);
	}
	return out;
}

function distanceSquared(a: Step, b: Step): number {
	return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
