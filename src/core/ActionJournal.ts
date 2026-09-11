/** One deterministic action and the framework/game events it produced. */
export interface ActionJournalEntry<Action, Event> {
	readonly sequence: number;
	readonly action: Action;
	readonly events: readonly Event[];
}

/**
 * A serializable, append-only action log for replay, undo checkpoints, synchronization and
 * debugging. It does not interpret actions or events: the game decides how to reapply an
 * action, while the journal preserves the exact order and resulting event batch.
 *
 * @example
 * ```ts
 * import { ActionJournal } from '@datamoc/mw_games/core';
 *
 * const journal = new ActionJournal<string, { type: string }>();
 * journal.append('open-door', [{ type: 'door-opened' }]);
 * const checkpoint = journal.mark();
 * // An undo system can restore its state and replay journal.since(checkpoint).
 * ```
 */
export class ActionJournal<Action, Event> {
	private entries: ActionJournalEntry<Action, Event>[] = [];
	private nextSequence = 0;

	append(action: Action, events: readonly Event[] = []): ActionJournalEntry<Action, Event> {
		const entry = { sequence: this.nextSequence++, action, events: structuredClone([...events]) };
		this.entries.push(entry);
		return structuredClone(entry);
	}

	get size(): number {
		return this.entries.length;
	}

	get all(): readonly ActionJournalEntry<Action, Event>[] {
		return structuredClone(this.entries);
	}

	/** Returns a sequence number that can be used as an undo or sync checkpoint. */
	mark(): number {
		return this.nextSequence;
	}

	since(sequence: number): ActionJournalEntry<Action, Event>[] {
		return structuredClone(this.entries.filter((entry) => entry.sequence >= sequence));
	}

	/** Drops entries at and after a checkpoint, as an undo operation would. */
	truncate(sequence: number): void {
		this.entries = this.entries.filter((entry) => entry.sequence < sequence);
		this.nextSequence = sequence;
	}

	toJSON(): ActionJournalEntry<Action, Event>[] {
		return this.all as ActionJournalEntry<Action, Event>[];
	}

	static fromJSON<Action, Event>(
		entries: readonly ActionJournalEntry<Action, Event>[],
	): ActionJournal<Action, Event> {
		const journal = new ActionJournal<Action, Event>();
		let expected = 0;
		for (const entry of entries) {
			if (!Number.isSafeInteger(entry.sequence) || entry.sequence !== expected)
				throw new Error('action journal sequences must be contiguous from zero');
			journal.entries.push(
				structuredClone({ sequence: entry.sequence, action: entry.action, events: [...entry.events] }),
			);
			expected++;
		}
		journal.nextSequence = expected;
		return journal;
	}
}
