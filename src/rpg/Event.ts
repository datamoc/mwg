import type { GameState } from './GameState.ts';
import type { EventCommand } from './EventRunner.ts';

/** when a page's commands run */
export type EventTrigger = 'action' | 'touch' | 'autorun' | 'parallel';

export type EventCondition = { switch: string; equals: boolean } | { variable: string; atLeast: number };

export interface EventPage {
	/** every condition must hold for this page to be selected */
	conditions?: EventCondition[];
	trigger: EventTrigger;
	commands: EventCommand[];

	/** the frame shown on the map for this page; omit for no graphic */
	frame?: number | string;
}

export interface MapEvent {
	id: string;
	x: number;
	y: number;
	pages: EventPage[];
}

export function conditionHolds(condition: EventCondition, state: GameState): boolean {
	if ('switch' in condition) return state.switch(condition.switch) === condition.equals;
	return state.variable(condition.variable) >= condition.atLeast;
}

/**
 * The last page whose conditions all hold - the same convention RPG Maker uses, so an event
 * is authored as an ordered list running from "default behaviour" to "most specific", and
 * whichever specific case currently applies overrides the general one before it.
 */
export function activePage(event: MapEvent, state: GameState): EventPage | undefined {
	let match: EventPage | undefined;
	for (const page of event.pages) {
		if ((page.conditions ?? []).every((c) => conditionHolds(c, state))) match = page;
	}
	return match;
}
