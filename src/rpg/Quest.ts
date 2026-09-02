import type { GameState } from './GameState.ts';
import { conditionHolds, type EventCondition } from './Event.ts';

/**
 * One step of a quest: complete once its condition holds, or once its counter reaches a
 * target - "kill 5 rats: 3/5" is a counter stage, "talked to the shopkeeper" a condition
 * one, read off the same `GameState` switches/variables `EventRunner`'s `activePage`
 * conditions already do. A stage with neither is a pure milestone, complete the instant it
 * becomes current - the shape a quest's very first or very last stage often wants.
 */
export interface QuestStage {
	condition?: EventCondition;
	counter?: { variable: string; target: number };

	/** shown in a quest log's progress readout; `mwg` never reads this itself */
	description?: string;
}

export interface QuestDefinition {
	id: string;
	stages: QuestStage[];

	/** quest ids that must already be complete before this one can start */
	requires?: string[];
}

export type QuestStatus = 'unavailable' | 'available' | 'active' | 'complete';

/**
 * Tracks which stage every known quest is on, against `GameState`'s existing switches and
 * variables - not a storage mechanism of its own. A quest's *definition* (its stages, its
 * prerequisites) is static game content, supplied once, the same way the dungeon example's
 * `ITEMS` table is; only which stage each quest has reached is what gets saved.
 */
export class QuestLog {
	private definitions = new Map<string, QuestDefinition>();

	/** the stage index a started quest is on; absent means not yet started */
	private stageIndex = new Map<string, number>();

	define(quest: QuestDefinition): void {
		this.definitions.set(quest.id, quest);
	}

	/** whether every prerequisite is already complete, so the quest could be started */
	canStart(id: string): boolean {
		const quest = this.require(id);
		return (quest.requires ?? []).every((r) => this.status(r) === 'complete');
	}

	/** begins a quest; throws if a prerequisite is not yet complete */
	start(id: string): void {
		if (!this.canStart(id)) throw new Error(`quest "${id}" cannot start yet - a prerequisite is incomplete`);
		this.stageIndex.set(id, 0);
	}

	status(id: string): QuestStatus {
		const quest = this.require(id);
		const index = this.stageIndex.get(id);
		if (index === undefined) return this.canStart(id) ? 'available' : 'unavailable';
		return index >= quest.stages.length ? 'complete' : 'active';
	}

	/** the stage a quest is currently on; `null` once complete or before it has started */
	currentStage(id: string): QuestStage | null {
		if (this.status(id) !== 'active') return null;
		return this.require(id).stages[this.stageIndex.get(id)!];
	}

	/** progress, 0 to 1, towards the current stage's counter; `null` for a condition stage */
	progress(id: string, state: GameState): number | null {
		const stage = this.currentStage(id);
		if (!stage?.counter) return null;
		return Math.min(1, state.variable(stage.counter.variable) / stage.counter.target);
	}

	/**
	 * Moves a quest on if its current stage's condition or counter is now satisfied.
	 *
	 * A game calls this after anything that might have finished a stage - an event, a kill,
	 * picking up an item - the same way `EventRunner` re-checks `activePage` rather than
	 * being told directly when to move on. A single call advances at most one stage, even if
	 * the next one would also already be satisfied; call it again (a fresh turn, a fresh
	 * check) to walk through several at once.
	 *
	 * @returns true if a stage (or the whole quest) completed this call
	 */
	advance(id: string, state: GameState): boolean {
		const stage = this.currentStage(id);
		if (!stage) return false;

		const done = stage.condition
			? conditionHolds(stage.condition, state)
			: stage.counter
				? state.variable(stage.counter.variable) >= stage.counter.target
				: true;
		if (!done) return false;

		this.stageIndex.set(id, this.stageIndex.get(id)! + 1);
		return true;
	}

	private require(id: string): QuestDefinition {
		const quest = this.definitions.get(id);
		if (!quest) throw new Error(`no such quest: "${id}"`);
		return quest;
	}

	toJSON(): { stageIndex: [string, number][] } {
		return { stageIndex: [...this.stageIndex] };
	}

	/** rebuilds a log from save data - `definitions` are supplied fresh, the same as `ITEMS` */
	static fromJSON(definitions: QuestDefinition[], data: { stageIndex: [string, number][] }): QuestLog {
		const log = new QuestLog();
		for (const quest of definitions) log.define(quest);
		for (const [id, index] of data.stageIndex) log.stageIndex.set(id, index);
		return log;
	}
}
