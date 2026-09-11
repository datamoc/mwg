import type { Level } from './Level.ts';
import { resolveAreaOnLevel } from './Targeting.ts';
import type { Step } from './Pathfinder.ts';

export interface BeamDamageContext {
	cell: Step;
	step: number;
	/** the number of cells remaining after this one, counting only fronts already resolved */
	remaining: number;
}

/**
 * What ends a beam cell, as one explicit choice rather than a combination of flags:
 *
 * - `'terrain'` (the default): outside the map or opaque terrain stops it, the ordinary beam.
 * - `'none'`: it passes through terrain; only `isBlocked` (when given) can stop it.
 * - a function: the game decides, terrain ignored.
 */
export type BeamBlocker = 'terrain' | 'none' | ((cell: Step, context: BeamDamageContext) => boolean);

export interface MultiTurnBeamOptions<T> {
	level: Level;
	from: Step;
	target: Step;
	damage: number | ((target: T, context: BeamDamageContext) => number);
	/** Finds live targets at the cell when that cell is reached. */
	targetsAt?: (cell: Step) => readonly T[];
	/** Applies the resolved damage. The game owns health, resistances and effects. */
	applyDamage?: (target: T, amount: number, context: BeamDamageContext) => void;
	/** An extra game rule on top of `blocker`, e.g. "a wall of fire melts the beam". */
	isBlocked?: (cell: Step, context: BeamDamageContext) => boolean;
	/** The explicit blocker policy; defaults to `'terrain'`, matching a plain beam. */
	blocker?: BeamBlocker;
	/** @deprecated use `blocker: 'none'`; kept so existing content keeps its meaning */
	stopAtOpaque?: boolean;
	/**
	 * Opt-in per-turn fronts instead of a straight line. Given the cells the previous turn
	 * actually reached (the origin alone at turn 0) and the turn number, it returns the cells
	 * this turn affects; an empty list ends the beam. A cone widens, a burst stops moving, a
	 * forked front splits, and a moving front is whatever the game returns each turn - none of
	 * which the framework has to understand, only sequence and save.
	 */
	fronts?: (previous: readonly Step[], turn: number) => readonly Step[];
	/** Names the shape this beam is, saved so a reload resumes the same one; defaults to `'line'`/`'fronts'`. */
	shape?: string;
	/** Called for every cell the front actually reaches, before targets are resolved. */
	onCell?: (cell: Step, context: BeamDamageContext) => void;
}

export interface BeamStep<T> {
	status: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';
	/** the first cell this turn reached, or null when the front was empty or fully blocked */
	cell: Step | null;
	/** every cell this turn reached, in front order */
	cells: readonly Step[];
	step: number;
	remaining: number;
	targets: readonly T[];
	damage: number;
}

export interface MultiTurnBeamSave {
	state: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';
	/** every front resolved so far, oldest first; `fronts[index]` is the next to resolve */
	fronts: Step[][];
	index: number;
	/** the shape the beam was built with, so a reload resumes the same one */
	shape: string;
	/** @deprecated a save written before fronts landed: one cell per turn */
	path?: Step[];
}

/**
 * Advances a beam one front per turn.
 *
 * The framework owns traversal and timing. A game supplies target lookup and damage application,
 * so this stays useful for hit points, shields, status effects and any other combat model. The
 * default shape is a straight line captured at construction time; `fronts` opts into a per-turn
 * front resolver, which is what expresses a cone, a burst, a fork or a moving front without any
 * of those rules living here. Blockers and targets are checked when each cell is reached, so
 * `advance` is deterministic when those callbacks are.
 *
 * @example
 * ```ts
 * import { Level, FLOOR, WALL, MultiTurnBeam } from '@datamoc/mw_games/roguelike';
 *
 * const level = new Level(8, 1, [WALL, FLOOR], 1);
 * const beam = new MultiTurnBeam({ level, from: { x: 0, y: 0 }, target: { x: 3, y: 0 }, damage: 4 });
 * beam.start();
 * beam.advance(); // reaches x=1; call again on the next turn
 * ```
 */
export class MultiTurnBeam<T = unknown> {
	private options: MultiTurnBeamOptions<T>;
	private fronts: Step[][];
	private index = 0;
	private state: MultiTurnBeamSave['state'] = 'idle';
	private shape: string;

	constructor(options: MultiTurnBeamOptions<T>) {
		if (typeof options.damage !== 'function' && !Number.isFinite(options.damage)) {
			throw new Error('beam damage must be a finite number or a function');
		}
		if (typeof options.damage === 'number' && options.damage < 0) {
			throw new Error('beam damage must be non-negative');
		}
		this.options = options;
		this.shape = options.shape ?? (options.fronts ? 'fronts' : 'line');
		if (options.fronts) {
			const first = options.fronts([{ ...options.from }], 0);
			this.fronts = first.length ? [first.map((cell) => ({ ...cell }))] : [];
		} else {
			this.fronts = resolveAreaOnLevel(options.level, options.from, options.target, { kind: 'line' })
				.slice(1)
				.map((cell) => [{ ...cell }]);
		}
	}

	get active(): boolean {
		return this.state === 'active';
	}

	get done(): boolean {
		return this.state === 'done' || this.state === 'blocked' || this.state === 'cancelled';
	}

	/** The shape this beam was built with, for a save or a UI label. */
	get beamShape(): string {
		return this.shape;
	}

	/** Every cell of every resolved front, in order - the straight path of a line beam. */
	get currentPath(): readonly Step[] {
		return this.fronts.flat().map((cell) => ({ ...cell }));
	}

	start(): boolean {
		if (this.state !== 'idle') return false;
		this.state = this.fronts.length === 0 ? 'done' : 'active';
		return true;
	}

	/** Resolves and applies one beam front. Call once per game turn. */
	advance(): BeamStep<T> {
		if (this.state !== 'active') return this.inactiveStep();

		const front = this.fronts[this.index] ?? [];
		const remaining = Math.max(0, this.fronts.length - this.index - 1);
		const cells: Step[] = [];
		const targets: T[] = [];
		let damage = 0;

		for (const raw of front) {
			const context: BeamDamageContext = { cell: { ...raw }, step: this.index, remaining };
			if (this.blocked(raw, context)) continue;

			cells.push({ ...raw });
			this.options.onCell?.({ ...raw }, context);
			for (const target of this.options.targetsAt?.(raw) ?? []) {
				const amount =
					typeof this.options.damage === 'function' ? this.options.damage(target, context) : this.options.damage;
				if (!Number.isFinite(amount) || amount < 0)
					throw new Error('beam damage callback must return a non-negative finite number');
				damage += amount;
				targets.push(target);
				this.options.applyDamage?.(target, amount, context);
			}
		}

		const step = this.index;
		this.index++;

		//a per-turn resolver extends the beam from what this front actually reached; a blocked
		//cell does not propagate, and no cells at all ends the show
		if (this.options.fronts && cells.length > 0) {
			const next = this.options.fronts(cells.map((cell) => ({ ...cell })), this.index);
			if (next.length) this.fronts.push(next.map((cell) => ({ ...cell })));
		}

		if (cells.length === 0) this.state = 'blocked';
		else if (this.index >= this.fronts.length) this.state = 'done';

		return {
			status: cells.length === 0 ? 'blocked' : this.state,
			cell: cells[0] ? { ...cells[0] } : null,
			cells: cells.map((cell) => ({ ...cell })),
			step,
			remaining,
			targets: [...targets],
			damage,
		};
	}

	cancel(): void {
		if (this.state === 'active' || this.state === 'idle') this.state = 'cancelled';
	}

	toJSON(): MultiTurnBeamSave {
		return {
			state: this.state,
			fronts: this.fronts.map((front) => front.map((cell) => ({ ...cell }))),
			index: this.index,
			shape: this.shape,
		};
	}

	static fromJSON<T>(
		options: Omit<MultiTurnBeamOptions<T>, 'from' | 'target'>,
		data: MultiTurnBeamSave,
	): MultiTurnBeam<T> {
		const shape = data.shape ?? (options.fronts ? 'fronts' : 'line');
		if (options.shape !== undefined && options.shape !== shape)
			throw new Error(`beam save is shape "${shape}", not "${options.shape}"`);

		const beam = Object.create(MultiTurnBeam.prototype) as MultiTurnBeam<T>;
		beam.options = options as MultiTurnBeamOptions<T>;
		beam.shape = shape;
		//a save written before fronts landed stored one cell per turn as `path`
		beam.fronts = data.fronts
			? data.fronts.map((front) => front.map((cell) => ({ ...cell })))
			: (data.path ?? []).map((cell) => [{ ...cell }]);
		beam.index = data.index;
		beam.state = data.state;
		return beam;
	}

	private blocked(cell: Step, context: BeamDamageContext): boolean {
		const blocker = this.options.blocker ?? (this.options.stopAtOpaque === false ? 'none' : 'terrain');
		let blockedByPolicy = false;
		if (blocker === 'terrain') {
			blockedByPolicy = !this.options.level.inside(cell.x, cell.y) || !this.options.level.transparent(cell.x, cell.y);
		} else if (blocker !== 'none') {
			blockedByPolicy = blocker({ ...cell }, context) === true;
		}
		return blockedByPolicy || this.options.isBlocked?.({ ...cell }, context) === true;
	}

	private inactiveStep(): BeamStep<T> {
		return {
			status: this.state,
			cell: null,
			cells: [],
			step: this.index,
			remaining: Math.max(0, this.fronts.length - this.index),
			targets: [],
			damage: 0,
		};
	}
}
