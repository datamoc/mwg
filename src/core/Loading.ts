import { Signal } from './Signal.ts';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'cancelled';

export interface LoadTaskContext {
	/** reports a task-local fraction, from 0 to 1 */
	report(fraction: number): void;
	/** becomes true after `cancel()`; a task should stop at its next safe boundary */
	readonly cancelled: boolean;
}

export interface LoadTask {
	id: string;
	weight?: number;
	run(context: LoadTaskContext): Promise<void> | void;
}

export interface LoadSnapshot {
	status: LoadStatus;
	completed: number;
	total: number;
	current: string | null;
	error: unknown | null;
}

/**
 * Runs named, weighted asynchronous work while exposing truthful loading progress.
 *
 * Tasks run in order, which makes dependency ordering explicit and leaves a game free to
 * start independent work concurrently inside one task. A task that cannot measure itself
 * simply never calls `report`, so consumers can display an indeterminate current stage
 * instead of inventing a percentage.
 */
export class LoadQueue {
	readonly changed = new Signal<LoadSnapshot>();

	private readonly tasks: LoadTask[] = [];
	private readonly progress = new Map<string, number>();
	private status_: LoadStatus = 'idle';
	private current_: string | null = null;
	private error_: unknown | null = null;
	private cancelled = false;

	add(task: LoadTask): this {
		if (!task.id) throw new Error('load task needs an id');
		if (this.tasks.some((candidate) => candidate.id === task.id)) throw new Error(`duplicate load task "${task.id}"`);
		if (task.weight !== undefined && !(task.weight > 0)) throw new Error('load task weight must be positive');
		if (this.status_ === 'loading') throw new Error('cannot add a task while loading');
		this.tasks.push(task);
		this.progress.set(task.id, 0);
		this.emit();
		return this;
	}

	get snapshot(): LoadSnapshot {
		const total = this.tasks.reduce((sum, task) => sum + (task.weight ?? 1), 0);
		const complete = this.tasks.reduce((sum, task) => sum + (task.weight ?? 1) * (this.progress.get(task.id) ?? 0), 0);
		return { status: this.status_, completed: complete, total, current: this.current_, error: this.error_ };
	}

	/** starts queued work and resolves only after every task succeeds */
	async start(): Promise<void> {
		if (this.status_ === 'loading') throw new Error('load queue is already running');
		this.status_ = 'loading';
		this.cancelled = false;
		this.error_ = null;
		this.emit();
		try {
			for (const task of this.tasks) {
				if (this.cancelled) break;
				this.current_ = task.id;
				this.emit();
				const queue = this;
				await task.run({
					get cancelled() {
						return queue.cancelled;
					},
					report: (fraction) => this.report(task.id, fraction),
				});
				if (!this.cancelled) this.report(task.id, 1);
			}
			this.current_ = null;
			this.status_ = this.cancelled ? 'cancelled' : 'ready';
			this.emit();
		} catch (error) {
			this.current_ = null;
			this.error_ = error;
			this.status_ = 'failed';
			this.emit();
			throw error;
		}
	}

	/** asks the current task to stop; cancellation is cooperative */
	cancel(): void {
		if (this.status_ === 'loading') this.cancelled = true;
	}

	/** clears failure/cancellation state and task progress for a new attempt */
	retry(): void {
		if (this.status_ === 'loading') throw new Error('cannot retry while loading');
		this.status_ = 'idle';
		this.current_ = null;
		this.error_ = null;
		this.cancelled = false;
		for (const task of this.tasks) this.progress.set(task.id, 0);
		this.emit();
	}

	private report(id: string, fraction: number): void {
		if (!Number.isFinite(fraction)) throw new Error('load progress must be finite');
		this.progress.set(id, Math.max(0, Math.min(1, fraction)));
		this.emit();
	}

	private emit(): void {
		this.changed.dispatch(this.snapshot);
	}
}
