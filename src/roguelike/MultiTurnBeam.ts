import type { Level } from './Level.ts';
import { resolveAreaOnLevel } from './Targeting.ts';
import type { Step } from './Pathfinder.ts';

export interface BeamDamageContext {
	cell: Step;
	step: number;
	/** the number of cells remaining after this one */
	remaining: number;
}

export interface MultiTurnBeamOptions<T> {
	level: Level;
	from: Step;
	target: Step;
	damage: number | ((target: T, context: BeamDamageContext) => number);
	/** Finds live targets at the cell when that cell is reached. */
	targetsAt?: (cell: Step) => readonly T[];
	/** Applies the resolved damage. The game owns health, resistances and effects. */
	applyDamage?: (target: T, amount: number, context: BeamDamageContext) => void;
	/** A dynamic blocker can stop a beam after it has started. */
	isBlocked?: (cell: Step, context: BeamDamageContext) => boolean;
	/** Whether the beam stops at opaque terrain. Defaults to true. */
	stopAtOpaque?: boolean;
}

export interface BeamStep<T> {
	status: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';
	cell: Step | null;
	step: number;
	remaining: number;
	targets: readonly T[];
	damage: number;
}

export interface MultiTurnBeamSave {
	path: Step[];
	index: number;
	state: 'idle' | 'active' | 'done' | 'blocked' | 'cancelled';
}

/**
 * Advances a straight beam one cell per turn.
 *
 * The framework owns traversal and timing. A game supplies target lookup and damage
 * application, so this stays useful for hit points, shields, status effects and any other
 * combat model. The path is captured at construction time, while blockers and targets are
 * checked when each cell is reached. `advance` is deterministic when those callbacks are.
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
	private path: Step[];
	private index = 0;
	private state: MultiTurnBeamSave['state'] = 'idle';

	constructor(options: MultiTurnBeamOptions<T>) {
		if (typeof options.damage !== 'function' && !Number.isFinite(options.damage)) {
			throw new Error('beam damage must be a finite number or a function');
		}
		if (typeof options.damage === 'number' && options.damage < 0) {
			throw new Error('beam damage must be non-negative');
		}
		this.options = options;
		this.path = resolveAreaOnLevel(options.level, options.from, options.target, { kind: 'line' }).slice(1);
	}

	get active(): boolean {
		return this.state === 'active';
	}

	get done(): boolean {
		return this.state === 'done' || this.state === 'blocked' || this.state === 'cancelled';
	}

	get currentPath(): readonly Step[] {
		return this.path;
	}

	start(): boolean {
		if (this.state !== 'idle') return false;
		this.state = this.path.length === 0 ? 'done' : 'active';
		return true;
	}

	/** Resolves and applies one beam cell. Call once per game turn. */
	advance(): BeamStep<T> {
		if (this.state !== 'active') {
			return {
				status: this.state,
				cell: null,
				step: this.index,
				remaining: Math.max(0, this.path.length - this.index),
				targets: [],
				damage: 0,
			};
		}

		const cell = this.path[this.index];
		const context: BeamDamageContext = {
			cell: { ...cell },
			step: this.index,
			remaining: this.path.length - this.index - 1,
		};
		const blocked =
			!this.options.level.inside(cell.x, cell.y) ||
			(this.options.stopAtOpaque !== false && !this.options.level.transparent(cell.x, cell.y)) ||
			this.options.isBlocked?.(cell, context) === true;
		if (blocked) {
			this.state = 'blocked';
			return {
				status: 'blocked',
				cell: { ...cell },
				step: this.index,
				remaining: context.remaining,
				targets: [],
				damage: 0,
			};
		}

		const targets = this.options.targetsAt?.(cell) ?? [];
		let damage = 0;
		for (const target of targets) {
			const amount =
				typeof this.options.damage === 'function' ? this.options.damage(target, context) : this.options.damage;
			if (!Number.isFinite(amount) || amount < 0)
				throw new Error('beam damage callback must return a non-negative finite number');
			damage += amount;
			this.options.applyDamage?.(target, amount, context);
		}

		this.index++;
		if (this.index >= this.path.length) this.state = 'done';
		return {
			status: this.state === 'done' ? 'done' : 'active',
			cell: { ...cell },
			step: context.step,
			remaining: context.remaining,
			targets: [...targets],
			damage,
		};
	}

	cancel(): void {
		if (this.state === 'active' || this.state === 'idle') this.state = 'cancelled';
	}

	toJSON(): MultiTurnBeamSave {
		return { path: this.path.map((cell) => ({ ...cell })), index: this.index, state: this.state };
	}

	static fromJSON<T>(
		options: Omit<MultiTurnBeamOptions<T>, 'from' | 'target'>,
		data: MultiTurnBeamSave,
	): MultiTurnBeam<T> {
		const beam = Object.create(MultiTurnBeam.prototype) as MultiTurnBeam<T>;
		beam.options = options as MultiTurnBeamOptions<T>;
		beam.path = data.path.map((cell) => ({ ...cell }));
		beam.index = data.index;
		beam.state = data.state;
		return beam;
	}
}
