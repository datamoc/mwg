import { GridMover, type Direction4 } from './GridMover.ts';

const DIRECTIONS: readonly Direction4[] = ['up', 'down', 'left', 'right'];

const DELTA: Record<Direction4, { dx: number; dy: number }> = {
	up: { dx: 0, dy: -1 },
	down: { dx: 0, dy: 1 },
	left: { dx: -1, dy: 0 },
	right: { dx: 1, dy: 0 },
};

/** what a quarter or half turn from each facing lands on */
const TURNED: Record<Direction4, { around: Direction4; left90: Direction4; right90: Direction4 }> = {
	up: { around: 'down', left90: 'left', right90: 'right' },
	down: { around: 'up', left90: 'right', right90: 'left' },
	left: { around: 'right', left90: 'down', right90: 'up' },
	right: { around: 'left', left90: 'up', right90: 'down' },
};

/**
 * One step of a `MoveRoute`, run in order against a `GridMover`. Unlike `GridMover.moveBy`
 * itself, a route step does not always know its own `dx`/`dy` up front - `random`, `toward`
 * and `away` resolve a direction only when the runner actually reaches that step, against
 * wherever the mover and (for `toward`/`away`) the target happen to be at that moment.
 */
export type MoveRouteStep =
	| { dir: Direction4 }
	| { dir: 'random' }
	/** one tile along (or against) the way the mover currently faces */
	| { dir: 'forward' | 'backward' }
	| ({ dir: 'toward' | 'away' } & RouteTarget)
	/** a step of any size and direction, diagonals included; `canMove` is asked with the same `dx`/`dy` */
	| { step: { dx: number; dy: number } }
	| { turn: Direction4 | 'random' }
	/** a quarter or half turn from the way the mover currently faces */
	| { turn: 'around' | 'left90' | 'right90' }
	| ({ turn: 'toward' | 'away' } & RouteTarget)
	| { jump: { dx: number; dy: number } }
	| { wait: number };

/**
 * Where a `toward`/`away` step aims: fixed tile coordinates, or a function asked when the step
 * is reached, for a target that keeps moving (a player, another event).
 */
export type RouteTarget = { x: number; y: number } | { target: () => { x: number; y: number } };

export interface MoveRoute {
	steps: readonly MoveRouteStep[];

	/** loops back to the first step once the last one finishes, rather than stopping there */
	repeat?: boolean;

	/**
	 * when a directional step's target tile is refused by `canMove`, move on to the next step
	 * immediately rather than retrying the same step every tick until it opens up
	 */
	skippable?: boolean;
}

export interface MoveRouteOptions {
	/** asked before every directional/jump step, the same contract `GridMover` itself expects of its caller */
	canMove?: (dx: number, dy: number) => boolean;

	/** source of randomness for `random` steps; defaults to `Math.random` */
	random?: () => number;
}

/**
 * Drives a `GridMover` through a `MoveRoute` over successive `update(dt)` calls - the piece
 * `GridMover`'s own one-step-at-a-time `moveBy`/`turnTo` deliberately leaves out (see its own
 * doc comment: whether a step is passable is the caller's question, not the mover's). Works
 * against any `GridMover`, not only the player's - an NPC's wandering or patrol route is the
 * same shape as a scripted cutscene walk.
 *
 * @example
 * ```ts
 * import { GridMover, MoveRouteRunner, type MoveRoute } from '@datamoc/mw_games/rpg';
 * import type { MovableSprite } from '@datamoc/mw_games/rpg';
 *
 * declare const npcSprite: MovableSprite;
 * declare function tilePassable(x: number, y: number): boolean;
 *
 * const mover = new GridMover(npcSprite, 3, 3, { tileWidth: 32, tileHeight: 32 });
 * const patrol: MoveRoute = {
 *   steps: [{ dir: 'right' }, { dir: 'right' }, { wait: 1 }, { dir: 'left' }, { dir: 'left' }],
 *   repeat: true,
 * };
 * const route = new MoveRouteRunner(mover, patrol, {
 *   canMove: (dx, dy) => tilePassable(mover.x + dx, mover.y + dy),
 * });
 *
 * // in the game loop:
 * mover.update(1 / 60);
 * route.update(1 / 60);
 * ```
 */
export class MoveRouteRunner {
	private mover: GridMover;
	private route: MoveRoute;
	private options: MoveRouteOptions;
	private index = 0;
	private waiting = 0;

	constructor(mover: GridMover, route: MoveRoute, options: MoveRouteOptions = {}) {
		this.mover = mover;
		this.route = route;
		this.options = options;
	}

	/** true once a non-repeating route has run every step */
	get done(): boolean {
		return !this.route.repeat && this.index >= this.route.steps.length;
	}

	update(dt: number): void {
		if (this.mover.isMoving || this.done) return;

		if (this.waiting > 0) {
			this.waiting = Math.max(0, this.waiting - dt);
			if (this.waiting > 0) return;
		}

		if (this.index >= this.route.steps.length) {
			this.index = 0;
		}

		const step = this.route.steps[this.index];
		const advanced = this.runStep(step);
		if (advanced || this.route.skippable) this.index++;
	}

	/** @returns whether the step actually moved/turned/waited, so the runner can decide to skip it */
	private runStep(step: MoveRouteStep): boolean {
		if ('turn' in step) {
			const { dx, dy } = this.resolveTurn(step);
			this.mover.turnTo(dx, dy);
			return true;
		}

		if ('wait' in step) {
			this.waiting = step.wait;
			return true;
		}

		if ('jump' in step) {
			return this.attempt(step.jump.dx, step.jump.dy, (dx, dy) => this.mover.jumpBy(dx, dy));
		}

		if ('step' in step) {
			return this.attempt(step.step.dx, step.step.dy, (dx, dy) => this.mover.moveBy(dx, dy));
		}

		const { dx, dy } = this.resolveDirection(step);
		return this.attempt(dx, dy, (dx, dy) => this.mover.moveBy(dx, dy));
	}

	private resolveDirection(
		step: { dir: Direction4 | 'random' | 'forward' | 'backward' } | ({ dir: 'toward' | 'away' } & RouteTarget),
	): { dx: number; dy: number } {
		if (step.dir === 'random') return DELTA[this.pickDirection()];
		if (step.dir === 'forward') return DELTA[this.mover.facing];
		if (step.dir === 'backward') return DELTA[TURNED[this.mover.facing].around];
		if (step.dir === 'toward' || step.dir === 'away') return this.resolveAim(step.dir, step as RouteTarget);
		return DELTA[step.dir];
	}

	private resolveTurn(
		step:
			| { turn: Direction4 | 'random' | 'around' | 'left90' | 'right90' }
			| ({ turn: 'toward' | 'away' } & RouteTarget),
	): { dx: number; dy: number } {
		if (step.turn === 'random') return DELTA[this.pickDirection()];
		if (step.turn === 'around' || step.turn === 'left90' || step.turn === 'right90') {
			return DELTA[TURNED[this.mover.facing][step.turn]];
		}
		if (step.turn === 'toward' || step.turn === 'away') {
			const aim = this.resolveAim(step.turn, step as RouteTarget);
			return aim.dx === 0 && aim.dy === 0 ? DELTA[this.mover.facing] : aim;
		}
		return DELTA[step.turn];
	}

	/** one tile along the larger axis towards (or away from) a target, from where the mover stands now */
	private resolveAim(way: 'toward' | 'away', aim: RouteTarget): { dx: number; dy: number } {
		const at = 'target' in aim ? aim.target() : aim;
		const sign = way === 'toward' ? 1 : -1;
		const ddx = at.x - this.mover.x;
		const ddy = at.y - this.mover.y;
		//the larger axis first, matching the direction a step would actually close (or open)
		return Math.abs(ddx) >= Math.abs(ddy)
			? { dx: sign * Math.sign(ddx) || 0, dy: 0 }
			: { dx: 0, dy: sign * Math.sign(ddy) || 0 };
	}

	private attempt(dx: number, dy: number, move: (dx: number, dy: number) => boolean): boolean {
		if (dx === 0 && dy === 0) return true;
		if (this.options.canMove && !this.options.canMove(dx, dy)) return false;
		return move(dx, dy);
	}

	private pickDirection(): Direction4 {
		const random = this.options.random ?? Math.random;
		return DIRECTIONS[Math.floor(random() * DIRECTIONS.length)]!;
	}
}
