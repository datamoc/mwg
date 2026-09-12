import type { MwlCompiledGame, MwlCompiledNode } from './compiler.ts';
import type {
	AiHook,
	CommandHook,
	Emit,
	GeneratorHook,
	HookWorld,
	MigrationHook,
	ModifierHook,
	PredicateHook,
} from './hooks.ts';
import { decodeSave, encodeSave, type MwlPersistenceOptions } from './persistence.ts';
import { evaluateCondition } from './conditions.ts';
import { evaluateExpression, type MwlExpressionContext } from './expression.ts';
import { booleanAttribute, booleanValue, integerAttribute, numberAttribute, requiredAttribute } from './utils.ts';
import { endLevelCarryover } from './carryover.ts';
import type { MwlCarryover, MwlSideRef } from './carryover.ts';

const required = requiredAttribute;
const integer = (node: MwlCompiledNode, attribute: string, fallback: number): number =>
	integerAttribute(node, attribute, fallback) ?? fallback;

export interface MwlMapStart {
	readonly x: number;
	readonly y: number;
}

export interface MwlMap {
	readonly id: string;
	readonly width: number;
	readonly height: number;
	/** row-major terrain codes, keep markers stripped */
	readonly codes: readonly string[];
	/** side id -> keep/start positions; the id a `<side> <code>` token names, number or not */
	readonly starts: Readonly<Record<string, readonly MwlMapStart[]>>;
}

export type MwlValue = string | number | boolean | MwlValue[] | { [key: string]: MwlValue };

export interface MwlWorld {
	readonly variables: Record<string, MwlValue>;
	readonly units: Record<
		string,
		{
			hp: number;
			x: number;
			y: number;
			alive: boolean;
			type?: string;
			side?: string;
			moves?: number;
			/** the unit's own name, as `[unit] name=` wrote it */
			name?: string;
			/** the unit's role/function: `[unit] role=`, or stamped from `[role]` */
			role?: string;
			/** whether the unit can recruit, i.e. is a leader: `[unit] can_recruit=`, or a side's own leader */
			can_recruit?: boolean;
			/**
			 * whether this unit is the one the `[side]` named as its leader. What `can_recruit` means
			 * to a game, `leader` answers outright, so a consumer does not recompute `sides[id].leader === id`.
			 */
			leader?: boolean;
		}
	>;
	readonly sides: Record<
		string,
		{
			gold: number;
			income: number;
			leader?: string;
			controller?: string;
			recruit?: string;
			/** the team a side belongs to, which is what `sideVisionGroups` reads */
			teamName?: string;
			/** `all`, `shroud` or `none`, as `[side]` wrote it */
			shareVision?: string;
			villageGold?: number;
			heal?: boolean;
			fog?: boolean;
			shroud?: boolean;
			hidden?: boolean;
			flag?: string;
			userTeamName?: string;
		}
	>;
	readonly maps: Record<string, { terrain: string; file?: string }>;
	gold: Record<string, number>;
	turn: number;
	status: 'playing' | 'won' | 'lost';
	/**
	 * What each side's own `[victory]`/`[defeat]` conditions decided, keyed by the side id
	 * `[side]` declared. Only sides whose conditions fired appear here; a side that wrote none
	 * keeps no entry, the same "only what the content made" rule `world.sides` follows. The
	 * scenario-wide `status` is the aggregate: a side that won or lost ends it too.
	 */
	sideStatus?: Record<string, 'playing' | 'won' | 'lost'>;
	/** what `[endlevel]` decided this scenario hands to the next one, until it is applied */
	carryover?: MwlCarryover;
	/** the primary map, when the content declares one */
	map?: MwlMap | null;
	/** the current schedule entry, by id */
	timeOfDay?: string;
	scheduleIndex?: number;
	/** ids of one-shot events that already fired, so a restore keeps them spent */
	firedEvents?: string[];
	pendingDialogue?: { id: string; choices: readonly MwlDialogueChoice[] };

	/**
	 * Village ownership, keyed `"x,y"`: what `[capture_village]` records. The framework owns the
	 * fact of who holds a village; what holding one is worth stays the game's rule (income is
	 * `world.sides[id].villageGold` applied by the game, not minted here).
	 */
	villages?: Record<string, { x: number; y: number; side: string; name?: string }>;
	/** hexes `[clear_shroud]` has uncovered, by side id, as `"x,y"`; the fog itself is a game layer */
	clearedShroud?: Record<string, string[]>;
	/** unit ids `[role]` assigned to a named role, so a later event can say `role=courier` */
	roles?: Record<string, string[]>;
	/** scenario `[object]` placements, as data; what an object does on pickup is the game's */
	objects?: Array<{ x: number; y: number; id?: string; name?: string; image?: string; side?: string }>;
	/** scenario `[story]` entries, as data; rendering them is the story-screen work (item 264) */
	story?: Array<{ text: string; title?: string; image?: string; music?: string }>;
}

/** One `[message]`: the text plus whatever a game needs to show it. */
export interface MwlMessage {
	readonly text: string;
	readonly speaker?: string;
	readonly portrait?: string;
	readonly side?: string;
	/** choices waiting on the player; answer with `answerDialogue` */
	readonly choices?: readonly MwlDialogueChoice[];
	/** identifies the pending dialogue this message's choices belong to */
	readonly dialogueId?: string;
}

/** One offered choice inside a `dialogue`: its label and the event answering runs. */
export interface MwlDialogueChoice {
	readonly text: string;
	readonly event?: string;
	/** inline branch commands, used when a choice does not name a separate event */
	readonly branch?: readonly MwlCompiledNode[];
}

/** The hook implementations a game provides to the runtime. */
export interface MwlHookRegistry {
	readonly predicate?: Readonly<Record<string, PredicateHook>>;
	readonly modifier?: Readonly<Record<string, ModifierHook>>;
	readonly generator?: Readonly<Record<string, GeneratorHook>>;
	readonly command?: Readonly<Record<string, CommandHook>>;
	readonly ai?: Readonly<Record<string, AiHook>>;
	readonly migration?: Readonly<Record<string, MigrationHook>>;
}

export type MwlTraceEvent =
	| {
			readonly type: 'event';
			readonly phase: 'claimed' | 'completed';
			readonly id: string;
			readonly trigger?: string;
	  }
	| { readonly type: 'variable'; readonly name: string; readonly previous?: MwlValue; readonly value: MwlValue }
	| { readonly type: 'error'; readonly message: string; readonly event?: string };

export interface MwlRuntimeOptions {
	readonly world?: MwlWorld;
	/** called for every `[message]` command, with its speaker and portrait */
	readonly onMessage?: (message: MwlMessage) => void;
	/** resolve a `[map] file=` reference to its text */
	readonly resolveMap?: (file: string) => string;
	readonly hooks?: MwlHookRegistry;
	/** opt-in observer for event lifecycle, variable writes and content errors */
	readonly onTrace?: (event: MwlTraceEvent) => void;
	/** schema version and migrations used by save/restore; defaults to version 1 */
	readonly persistence?: MwlPersistenceOptions;
}

export type MwlCommand =
	| { readonly name: 'set_variable'; readonly target: string; readonly value: string | number | boolean }
	| { readonly name: 'modify_gold'; readonly target: string; readonly amount: number }
	| { readonly name: 'move'; readonly target: string; readonly x: number; readonly y: number }
	| { readonly name: 'spawn'; readonly target: string; readonly x: number; readonly y: number; readonly hp: number }
	| { readonly name: 'kill'; readonly target?: string; readonly filter?: Readonly<Record<string, string>> }
	| { readonly name: 'attack'; readonly target: string; readonly amount: number }
	| { readonly name: 'end_turn' }
	/** `side` records which side won or lost in `world.sideStatus`; the scenario status follows */
	| { readonly name: 'win'; readonly side?: string }
	| { readonly name: 'lose'; readonly side?: string }
	| {
			readonly name: 'endlevel';
			readonly result: 'victory' | 'defeat';
			/** whose gold and units are carried; without it, the result is recorded and nothing moves */
			readonly side?: MwlSideRef;
			readonly bonus?: number;
			readonly carryoverPercentage?: number;
			readonly carryoverAdd?: boolean;
			readonly nextScenario?: string | null;
	  };

/**
 * A fresh, empty world: no sides, units, maps or variables, at turn 1 and `playing`.
 *
 * @example
 * ```ts
 * import { createWorld } from '@datamoc/mw_games/mwl';
 *
 * const world = createWorld();
 * console.log(world.turn, world.status); // 1 'playing'
 * ```
 */
export function createWorld(): MwlWorld {
	return {
		variables: {},
		units: {},
		sides: {},
		maps: {},
		gold: {},
		turn: 1,
		status: 'playing',
		sideStatus: {},
		map: null,
		timeOfDay: '',
		scheduleIndex: 0,
	};
}

/**
 * Parse map text: one row per line, comma-separated codes. A token may be
 * `<side> <code>` to mark that side's keep/start, which is how a leader knows
 * where to appear.
 *
 * @example
 * ```ts
 * import { parseTerrain } from '@datamoc/mw_games/mwl';
 *
 * const map = parseTerrain('Gg,Gg\nGg,1 Kh');
 * console.log(map.width, map.starts['1']); // 2 [{ x: 1, y: 1 }]
 * ```
 */
export function parseTerrain(text: string): {
	width: number;
	height: number;
	codes: string[];
	starts: Record<string, { x: number; y: number }[]>;
} {
	const rows = text
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '')
		.map((line) => line.split(',').map((token) => token.trim()));
	const height = rows.length;
	const width = rows.length ? Math.max(...rows.map((row) => row.length)) : 0;
	const codes: string[] = [];
	const starts: Record<string, { x: number; y: number }[]> = {};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const token = rows[y]?.[x] ?? '_off^_usr';
			//`<side> <code>`: the side is the id `[side]` declares, so a named side works here too
			const keep = /^([A-Za-z0-9_][\w.-]*)\s+(\S.*)$/.exec(token);
			if (keep) {
				codes.push(keep[2]);
				(starts[keep[1]] ??= []).push({ x, y });
			} else codes.push(token);
		}
	}
	return { width, height, codes, starts };
}

/** The two reference forms MWL text writes: `$(expression)` and `$name`. */
const expressionReference = /\$\(([^)]*)\)/g;
const variableReference = /\$([A-Za-z_][A-Za-z0-9_.]*)/g;

/**
 * Runtime for compiled MWL content. It never parses source text during play.
 *
 * The framework runtime owns what is game-agnostic: maps, sides, units, turn
 * order, the schedule, objectives, events, and save/load. Game rules that need
 * real data (pathfinding costs, combat formulas) stay in the engine adapter;
 * this runtime's `move` is a bounds and occupancy check, and `attack` applies
 * the amount the content asks for.
 *
 * @example
 * ```ts
 * import { compile, MwlRuntime } from '@datamoc/mw_games/mwl';
 *
 * const runtime = new MwlRuntime(compile('[game]\nschema=0.1\n[/game]'), {
 *   resolveMap: () => 'Gg,Gg\nGg,Gg',
 * });
 * console.log(runtime.world.turn); // 1
 * ```
 */
export class MwlRuntime {
	readonly game: MwlCompiledGame;
	readonly world: MwlWorld;
	private readonly onMessage?: (message: MwlMessage) => void;
	private readonly resolveMap?: (file: string) => string;
	private readonly hooks?: MwlHookRegistry;
	private readonly onTrace?: (event: MwlTraceEvent) => void;
	private readonly persistence: MwlPersistenceOptions;
	private readonly unitTypes = new Map<string, { hitpoints: number; movement: number }>();
	private schedule: string[] = [];
	private pendingDialogue: { id: string; choices: MwlDialogueChoice[] } | null = null;
	private dialogueCounter = 0;

	constructor(game: MwlCompiledGame, options: MwlRuntimeOptions = {}) {
		this.game = game;
		this.world = options.world ?? createWorld();
		this.onMessage = options.onMessage;
		this.resolveMap = options.resolveMap;
		this.hooks = options.hooks;
		this.onTrace = options.onTrace;
		this.persistence = options.persistence ?? { version: 1 };
		this.loadUnitTypes();
		this.loadSchedule();
		this.loadInitialContent();
		this.loadInitialUnits();
		this.loadLeaders();
		//roles filter over the units, so this runs once they and the leaders are in the world
		this.loadScenarioExtras();
	}

	run(trigger: string): void {
		for (const event of this.nodes('event')) {
			if ((event.attributes.on ?? event.attributes.trigger) !== trigger) continue;
			if (!this.eventFiltersMatch(event)) continue;
			if (!this.claimEvent(event)) continue;
			this.executeTracedEvent(event, trigger);
		}
		this.checkObjectives();
	}

	/** Fire one named event through the same filter, claim, and execution path as a trigger. */
	fireEvent(id: string): boolean {
		const event = this.nodes('event').find((candidate) => candidate.attributes.id === id);
		if (!event || !this.eventFiltersMatch(event) || !this.claimEvent(event)) return false;
		this.executeTracedEvent(event, 'fireEvent');
		this.checkObjectives();
		return true;
	}

	/**
	 * Fire the `on=moveto` events for a unit that has just arrived somewhere.
	 * The runtime's own `[move]` command calls this, and so does a game whose
	 * engine moved the unit: write the new position into `world.units` first,
	 * then call this with the unit id.
	 *
	 * An event matches when `x`/`y` (when given) are the unit's position, and
	 * `unit`/`side` (when given) are the unit's. A moveto event fires once by
	 * default; pass `once=false` on the event to let it fire every time.
	 */
	fireMoveto(id: string): void {
		const unit = this.world.units[id];
		if (!unit || !unit.alive) return;
		for (const event of this.nodes('event')) {
			if ((event.attributes.on ?? event.attributes.trigger) !== 'moveto') continue;
			if (event.attributes.x !== undefined && !coordinateMatches(event.attributes.x, unit.x)) continue;
			if (event.attributes.y !== undefined && !coordinateMatches(event.attributes.y, unit.y)) continue;
			if (event.attributes.unit !== undefined && event.attributes.unit !== id) continue;
			if (event.attributes.side !== undefined && event.attributes.side !== unit.side) continue;
			if (!this.eventFiltersMatch(event)) continue;
			if (!this.claimEvent(event)) continue;
			this.executeTracedEvent(event, 'moveto');
		}
		this.checkObjectives();
	}

	/** A `moveto` event is a story beat: it fires once unless told otherwise. */
	private claimEvent(event: MwlCompiledNode): boolean {
		const once =
			event.attributes.once === undefined ? event.attributes.on === 'moveto' : event.attributes.once !== 'false';
		if (!once) return true;
		const key =
			event.attributes.id ??
			`${event.attributes.on ?? event.attributes.trigger ?? 'event'}@${event.location?.line ?? 0}`;
		const fired = (this.world.firedEvents ??= []);
		if (fired.includes(key)) return false;
		fired.push(key);
		return true;
	}

	private eventFiltersMatch(event: MwlCompiledNode): boolean {
		if (!this.conditionMatches(event)) return false;
		if (!this.filterConditionMatches(event)) return false;
		const filter = event.children.find((child) => child.tag === 'filter');
		return !filter || this.filterMatches(filter);
	}

	private executeEvent(event: MwlCompiledNode): void {
		this.runBlock(this.commandChildren(event));
	}

	/**
	 * Runs a sequence of commands, with `say` and `dialogue` taking the message path rather
	 * than `executeNode`. Shared by an event's top level, an `[if]`/`[else]` body and a
	 * dialogue branch, so all three treat a nested pair the same way.
	 */
	private runBlock(children: readonly MwlCompiledNode[]): void {
		for (let index = 0; index < children.length; index++) {
			const child = children[index];
			if (this.isConsumedElse(children, index)) continue;
			if (child.tag === 'say') {
				this.showSay(child);
				continue;
			}
			if (child.tag === 'dialogue') {
				this.showDialogue(child);
				continue;
			}
			this.executeNode(child);
		}
	}

	/**
	 * Whether an `[else]` at `index` is the branch its immediately preceding `[if]` already ran.
	 * A taken `[if]` runs its own body and owns the `[else]`, so the loop skips that `[else]`;
	 * a false `[if]` ran nothing, so the `[else]` is left for the loop to run as its fallback.
	 * A free-standing `[else]` with no `[if]` before it is never consumed.
	 */
	private isConsumedElse(children: readonly MwlCompiledNode[], index: number): boolean {
		const previous = children[index - 1];
		return children[index]?.tag === 'else' && previous?.tag === 'if' && this.nodeConditionMatches(previous);
	}

	private executeTracedEvent(event: MwlCompiledNode, trigger: string): void {
		const id =
			event.attributes.id ??
			`${event.attributes.on ?? event.attributes.trigger ?? 'event'}@${event.location?.line ?? 0}`;
		this.onTrace?.({ type: 'event', phase: 'claimed', id, trigger });
		try {
			this.executeEvent(event);
			this.onTrace?.({ type: 'event', phase: 'completed', id, trigger });
		} catch (error) {
			this.onTrace?.({ type: 'error', message: String(error), event: id });
			throw error;
		}
	}

	/**
	 * Deliver a `dialogue`: its `message`/`say` lines first, then one message
	 * carrying the offered `choice`s. A choice names the event answering runs;
	 * the game answers later with `answerDialogue`, so content keeps any
	 * follow-up commands inside the referenced events rather than after the
	 * dialogue. Choices gated by `variable`/`equals` are skipped unless the
	 * world variable matches.
	 */
	private showDialogue(node: MwlCompiledNode): void {
		let last: { text: string; speaker?: string; portrait?: string; side?: string } | null = null;
		for (const child of node.children) {
			if (child.tag === 'message') {
				this.showMessage(child.attributes);
				last = {
					text: child.attributes.text ?? child.attributes.value ?? '',
					...(child.attributes.speaker === undefined ? {} : { speaker: child.attributes.speaker }),
					...(child.attributes.portrait === undefined ? {} : { portrait: child.attributes.portrait }),
					...(child.attributes.side === undefined || child.attributes.side === ''
						? {}
						: { side: child.attributes.side }),
				};
			} else if (child.tag === 'say') {
				this.showSay(child);
				last = { text: child.attributes.text ?? '', speaker: child.attributes.speaker };
			}
		}
		const choices: MwlDialogueChoice[] = [];
		for (const child of node.children) {
			if (child.tag !== 'choice' || !child.attributes.text) continue;
			if (
				child.attributes.variable !== undefined &&
				!sameValue(this.variableAt(child.attributes.variable), child.attributes.equals)
			)
				continue;
			const branches = child.children.filter((branch) => branch.tag === 'branch');
			if (branches.length) {
				for (const branch of branches) {
					choices.push({
						text: branch.attributes.text ?? child.attributes.text,
						branch: branch.children,
					});
				}
			} else if (child.attributes.event)
				choices.push({ text: child.attributes.text, event: child.attributes.event });
		}
		if (choices.length === 0) return;
		this.dialogueCounter += 1;
		const id = `dialogue-${this.dialogueCounter}`;
		this.pendingDialogue = { id, choices };
		this.world.pendingDialogue = { id, choices };
		this.onMessage?.({
			text: last?.text ?? '',
			...(last?.speaker === undefined ? {} : { speaker: last.speaker }),
			choices,
			dialogueId: id,
		});
	}

	private showSay(node: MwlCompiledNode): void {
		if (!this.onMessage) return;
		this.onMessage({
			text: node.attributes.text ?? '',
			...(node.attributes.speaker === undefined ? {} : { speaker: node.attributes.speaker }),
		});
	}

	/**
	 * Answer a pending dialogue: run the chosen choice's event and clear the
	 * pending state. Returns false when there is no such pending dialogue or
	 * choice; throws when the referenced event does not exist (content error).
	 */
	answerDialogue(dialogueId: string, choiceIndex: number): boolean {
		const pending = this.pendingDialogue;
		if (!pending || pending.id !== dialogueId) return false;
		const choice = pending.choices[choiceIndex];
		if (!choice) return false;
		this.pendingDialogue = null;
		delete this.world.pendingDialogue;
		if (choice.event) {
			const event = this.nodes('event').find((candidate) => candidate.attributes.id === choice.event);
			if (!event) throw new Error(`MWL dialogue choice points at unknown event: ${choice.event}`);
			if (!this.claimEvent(event)) return true;
			this.executeEvent(event);
		} else {
			this.runBlock(choice.branch ?? []);
		}
		this.checkObjectives();
		return true;
	}

	/**
	 * Evaluate `[objectives]` now and return the resulting status. A game whose
	 * own engine resolved the actions (real movement, combat) calls this after
	 * writing the results into `world`; `run` already calls it itself.
	 */
	evaluate(): MwlWorld['status'] {
		this.checkObjectives();
		return this.world.status;
	}

	save(): string {
		return encodeSave(this.world, this.persistence);
	}

	snapshot(): string {
		return JSON.stringify(this.world);
	}

	restore(snapshot: string): void {
		const restored = decodeSave(snapshot, this.persistence);
		Object.assign(this.world.variables, restored.variables);
		Object.assign(this.world.units, restored.units);
		Object.assign(this.world.sides, restored.sides ?? {});
		Object.assign(this.world.maps, restored.maps ?? {});
		Object.assign(this.world.gold, restored.gold ?? {});
		this.world.turn = restored.turn;
		this.world.status = restored.status;
		this.world.sideStatus = { ...(restored.sideStatus ?? {}) };
		this.world.map = restored.map ?? null;
		this.world.timeOfDay = restored.timeOfDay ?? this.schedule[0] ?? '';
		this.world.scheduleIndex = restored.scheduleIndex ?? 0;
		// One-shot events stay spent across a load.
		this.world.firedEvents = [...(restored.firedEvents ?? [])];
		// Scenario data a command may have changed, restored wholesale rather than merged: a load
		// is that save's world, not this scenario's with a few fields over it.
		this.world.villages = restored.villages ? structuredClone(restored.villages) : undefined;
		this.world.clearedShroud = restored.clearedShroud ? structuredClone(restored.clearedShroud) : undefined;
		this.world.roles = restored.roles ? structuredClone(restored.roles) : undefined;
		this.world.objects = restored.objects ? structuredClone(restored.objects) : undefined;
		this.world.story = restored.story ? structuredClone(restored.story) : undefined;
		this.world.pendingDialogue = restored.pendingDialogue;
		this.pendingDialogue = restored.pendingDialogue
			? { id: restored.pendingDialogue.id, choices: [...restored.pendingDialogue.choices] }
			: null;
		const dialogueNumber = restored.pendingDialogue?.id.match(/^dialogue-(\d+)$/);
		if (dialogueNumber) this.dialogueCounter = Math.max(this.dialogueCounter, Number(dialogueNumber[1]));
	}

	private loadUnitTypes(): void {
		for (const node of this.nodes('unit_type')) {
			const id = node.attributes.id;
			if (id)
				this.unitTypes.set(id, {
					hitpoints: integer(node, 'hitpoints', 1),
					movement: integer(node, 'movement', 0),
				});
		}
	}

	private loadSchedule(): void {
		this.schedule = this.nodes('schedule').flatMap((schedule) =>
			schedule.children
				.filter((child) => child.tag === 'time')
				.map((child) => child.attributes.id)
				.filter((id): id is string => Boolean(id)),
		);
		this.world.scheduleIndex = 0;
		this.world.timeOfDay = this.schedule[0] ?? '';
	}

	private loadInitialContent(): void {
		for (const side of this.nodes('side')) {
			const entry: MwlWorld['sides'][string] = {
				gold: integer(side, 'gold', 0),
				income: integer(side, 'income', 0),
			};
			if (side.attributes.leader !== undefined) entry.leader = side.attributes.leader;
			if (side.attributes.controller !== undefined) entry.controller = side.attributes.controller;
			if (side.attributes.recruit !== undefined) entry.recruit = side.attributes.recruit;
			//only what was written, so a world stays as small as the content that made it
			if (side.attributes.team_name !== undefined) entry.teamName = side.attributes.team_name;
			if (side.attributes.user_team_name !== undefined) entry.userTeamName = side.attributes.user_team_name;
			if (side.attributes.share_vision !== undefined) entry.shareVision = side.attributes.share_vision;
			if (side.attributes.flag !== undefined) entry.flag = side.attributes.flag;
			if (side.attributes.village_gold !== undefined) entry.villageGold = integer(side, 'village_gold', 0);
			for (const key of ['heal', 'fog', 'shroud', 'hidden'] as const) {
				const written = side.attributes[key];
				if (written !== undefined) entry[key] = written === 'yes' || written === 'true';
			}
			this.world.sides[required(side, 'id')] = entry;
		}
		for (const map of this.nodes('map')) {
			const id = map.attributes.id ?? map.attributes.name ?? 'map';
			this.world.maps[id] = { terrain: map.attributes.terrain ?? '', file: map.attributes.file };
			if (!this.world.map) this.world.map = this.buildMap(id, map);
		}
	}

	/** Direct children of `[game]` with a tag, as opposed to `nodes` which searches the whole tree. */
	private topLevelNodes(tag: string): MwlCompiledNode[] {
		const game = this.game.roots.find((root) => root.tag === 'game');
		return (game?.children ?? this.game.roots).filter((root) => root.tag === tag);
	}

	/**
	 * Scenario-level data that is not a side, a map or a unit: `[object]` placements, the `[story]`
	 * beats, and the `[role]` table. Kept as plain data on the world - the framework sequences and
	 * serialises it, and the game decides what an object does, what a story beat looks like, and
	 * what a role is for.
	 */
	private loadScenarioExtras(): void {
		for (const object of this.topLevelNodes('object')) {
			const x = integer(object, 'x', 0);
			const y = integer(object, 'y', 0);
			const entry: NonNullable<MwlWorld['objects']>[number] = { x, y };
			if (object.attributes.id !== undefined) entry.id = object.attributes.id;
			if (object.attributes.name !== undefined) entry.name = object.attributes.name;
			if (object.attributes.image !== undefined) entry.image = object.attributes.image;
			if (object.attributes.side !== undefined) entry.side = object.attributes.side;
			(this.world.objects ??= []).push(entry);
		}

		for (const story of this.topLevelNodes('story')) {
			const text = story.attributes.text ?? story.attributes.value;
			if (text === undefined) continue;
			const entry: NonNullable<MwlWorld['story']>[number] = { text };
			if (story.attributes.title !== undefined) entry.title = story.attributes.title;
			if (story.attributes.image !== undefined) entry.image = story.attributes.image;
			if (story.attributes.music !== undefined) entry.music = story.attributes.music;
			(this.world.story ??= []).push(entry);
		}

		for (const role of this.topLevelNodes('role')) {
			const name = role.attributes.role ?? role.attributes.name;
			if (name === undefined) continue;
			//`role`/`name` on this tag name the role being assigned, not a unit to match, so the
			//filter must not read either back as one - the same double duty `[store_unit]`'s
			//`variable`/`name` has
			const filter = withoutAttributes(role.attributes, 'role', 'name');
			const matched = Object.entries(this.world.units).filter(
				([id, unit]) => unit.alive && unitMatchesFilter(unit, id, filter),
			);
			//a unit learns the role it was assigned, so a later `[filter] role=courier` finds it
			for (const [, unit] of matched) unit.role = name;
			(this.world.roles ??= {})[name] = matched.map(([id]) => id);
		}
	}

	private buildMap(id: string, node: MwlCompiledNode): MwlMap | null {
		let text = node.attributes.terrain;
		if (!text && node.attributes.file && this.resolveMap) text = this.resolveMap(node.attributes.file);
		if (!text) return null;
		const parsed = parseTerrain(text);
		for (const start of node.children) {
			if (start.tag !== 'start') continue;
			const side = start.attributes.side;
			const x = optionalInteger(start, 'x');
			const y = optionalInteger(start, 'y');
			if (side !== undefined && x !== undefined && y !== undefined) (parsed.starts[side] ??= []).push({ x, y });
		}
		return { id, ...parsed };
	}

	private loadInitialUnits(): void {
		for (const unit of this.nodes('unit')) {
			const id = required(unit, 'id');
			const entry: MwlWorld['units'][string] = {
				hp: integer(unit, 'hp', 1),
				x: integer(unit, 'x', 0),
				y: integer(unit, 'y', 0),
				alive: true,
			};
			if (unit.attributes.type !== undefined) {
				entry.type = unit.attributes.type;
				const stats = this.unitTypes.get(unit.attributes.type);
				if (stats) entry.moves = stats.movement;
			}
			if (unit.attributes.side !== undefined) entry.side = unit.attributes.side;
			if (unit.attributes.name !== undefined) entry.name = unit.attributes.name;
			if (unit.attributes.role !== undefined) entry.role = unit.attributes.role;
			const can_recruit = booleanAttribute(unit, 'can_recruit');
			if (can_recruit !== undefined) entry.can_recruit = can_recruit;
			this.world.units[id] = entry;
		}
	}

	private loadLeaders(): void {
		for (const side of this.nodes('side')) {
			const leader = side.attributes.leader;
			if (!leader) continue;
			const sideId = side.attributes.id;
			if (!sideId) continue;
			const starts = this.world.map?.starts[sideId];
			if (!starts?.length) continue;
			const stats = this.unitTypes.get(leader);
			for (const start of starts) {
				if (this.unitAt(start.x, start.y)) continue;
				const id = `${leader} ${sideId} (${start.x},${start.y})`;
				this.world.units[id] = {
					hp: stats?.hitpoints ?? 1,
					x: start.x,
					y: start.y,
					alive: true,
					type: leader,
					side: sideId,
					moves: stats?.movement ?? 0,
					can_recruit: true,
					leader: true,
				};
			}
		}
	}

	private unitAt(x: number, y: number): MwlWorld['units'][string] | undefined {
		return Object.values(this.world.units).find((unit) => unit.alive && unit.x === x && unit.y === y);
	}

	private executeNode(node: MwlCompiledNode): void {
		const name = node.tag === 'command' ? node.attributes.name : node.tag;
		if (!name) throw new Error('MWL command is missing name');
		switch (name) {
			case 'message': {
				this.showMessage(node.attributes);
				break;
			}
			case 'spawn':
				this.spawnUnit(
					node.attributes.type ?? '',
					node.attributes.side,
					integer(node, 'x', 0),
					integer(node, 'y', 0),
					node.attributes.id ?? node.attributes.target,
					node.attributes.hp === undefined ? undefined : integer(node, 'hp', 1),
				);
				break;
			case 'move':
				this.applyMove(
					node.attributes.unit ?? required(node, 'target'),
					integer(node, 'x', 0),
					integer(node, 'y', 0),
				);
				break;
			case 'kill': {
				//a named unit that is not there is a content error; a filter that matches nobody is not,
				//which is what WML's own `[kill]` does. An empty filter matches every unit, there as
				//here, which is worth knowing before writing one.
				const named = node.attributes.unit ?? node.attributes.target;
				if (named === undefined) killMatching(this.world, node.attributes);
				else this.killUnit(named);
				break;
			}
			case 'fire_event': {
				const id = node.attributes.id ?? node.attributes.name;
				if (!id) throw new Error('[fire_event] requires id');
				this.fireEvent(id);
				break;
			}
			case 'store_unit': {
				const variable = node.attributes.variable ?? node.attributes.name ?? required(node, 'variable');
				this.setVariableAt(
					variable,
					this.matchingUnits(node, ['variable', 'name']).map(([id, unit]) => ({ id, ...unitSnapshot(unit) })),
				);
				break;
			}
			case 'unstore_unit': {
				const variable = required(node, 'variable');
				for (const entry of this.storedUnits(variable)) this.restoreUnit(entry, {});
				break;
			}
			case 'recall': {
				const stored = this.storedUnits(required(node, 'variable'));
				const wanted = node.attributes.id ?? node.attributes.unit;
				const entry = wanted === undefined ? stored[0] : stored.find((candidate) => candidate.id === wanted);
				if (!entry)
					throw new Error(`[recall] found no stored unit${wanted === undefined ? '' : ` named ${wanted}`}`);
				const placement: { x?: number; y?: number; side?: string } = {};
				if (node.attributes.x !== undefined) placement.x = integer(node, 'x', 0);
				if (node.attributes.y !== undefined) placement.y = integer(node, 'y', 0);
				if (node.attributes.side !== undefined) placement.side = node.attributes.side;
				this.restoreUnit(entry, placement);
				break;
			}
			case 'modify_unit': {
				//WML separates which units (`[filter]`) from what changes (`[set]`); a bare
				//`[modify_unit] hp=5` with no `[set]` changes every unit it matches
				const changes = node.children.find((child) => child.tag === 'set')?.attributes ?? node.attributes;
				for (const [, unit] of this.matchingUnits(node)) applyUnitChanges(unit, changes);
				break;
			}
			case 'heal_unit': {
				const amount = optionalInteger(node, 'amount');
				const absolute = optionalInteger(node, 'hp');
				if (amount === undefined && absolute === undefined)
					throw new Error('[heal_unit] requires amount or hp');
				for (const [, unit] of this.matchingUnits(node)) unit.hp = absolute ?? unit.hp + (amount ?? 0);
				break;
			}
			case 'set_terrain':
				this.setTerrain(integer(node, 'x', 0), integer(node, 'y', 0), required(node, 'terrain'));
				break;
			case 'capture_village': {
				const x = integer(node, 'x', 0);
				const y = integer(node, 'y', 0);
				const entry: NonNullable<MwlWorld['villages']>[string] = { x, y, side: required(node, 'side') };
				if (node.attributes.name !== undefined) entry.name = node.attributes.name;
				(this.world.villages ??= {})[`${x},${y}`] = entry;
				break;
			}
			case 'clear_shroud': {
				const side = required(node, 'side');
				const x = integer(node, 'x', 0);
				const y = integer(node, 'y', 0);
				const radius = integer(node, 'radius', 1);
				const cleared = new Set(this.world.clearedShroud?.[side] ?? []);
				for (let dy = -radius; dy <= radius; dy++)
					for (let dx = -radius; dx <= radius; dx++) cleared.add(`${x + dx},${y + dy}`);
				(this.world.clearedShroud ??= {})[side] = [...cleared];
				break;
			}
			case 'role': {
				const name = node.attributes.role ?? node.attributes.name;
				if (!name) throw new Error('[role] requires role');
				//`role`/`name` here name the role being assigned, not a unit to match, so the filter
				//must not read either back as one - the same exclusion the scenario-level role uses
				const matched = this.matchingUnits(node, ['role', 'name']);
				for (const [, unit] of matched) unit.role = name;
				(this.world.roles ??= {})[name] = matched.map(([id]) => id);
				break;
			}
			case 'attack':
				this.attack(
					node.attributes.defender ?? node.attributes.target ?? required(node, 'target'),
					integer(node, 'amount', 0),
				);
				break;
			case 'modify_gold':
				this.addGold(
					node.attributes.side ?? required(node, 'target'),
					integer(node, 'delta', integer(node, 'amount', 0)),
				);
				break;
			case 'gold':
				this.addGold(required(node, 'side'), integer(node, 'delta', integer(node, 'amount', 0)));
				break;
			case 'set_variable': {
				// `name`/`target` is a path written out, `path` is one content builds from
				// variables. Only the second goes through expansion: a `$` in `name` is not
				// a reference today, and reading it as one would change what content means.
				const computed = node.attributes.path;
				this.setVariable(
					computed === undefined
						? node.tag === 'command'
							? required(node, 'target')
							: required(node, 'name')
						: this.expandPath(computed),
					node.attributes.value ?? '',
					node.attributes.mode,
				);
				break;
			}
			case 'while': {
				const limit = integer(node, 'max_iterations', 1000);
				if (limit < 1 || limit > 100_000)
					throw new Error('MWL while max_iterations must be between 1 and 100000');
				for (let iteration = 0; iteration < limit && this.nodeConditionMatches(node); iteration++)
					this.runBlock(this.commandChildren(node));
				break;
			}
			case 'foreach': {
				const source = this.variableAt(required(node, 'variable'));
				const entries = Array.isArray(source)
					? source.map((value, index) => [String(index), value] as const)
					: typeof source === 'string'
						? source
								.split(',')
								.map((value, index) => [String(index), value.trim()] as const)
								.filter(([, value]) => value !== '')
						: source && typeof source === 'object'
							? Object.entries(source)
							: [];
				const item = node.attributes.item ?? 'item';
				const indexName = node.attributes.index ?? 'index';
				for (let index = 0; index < entries.length; index++) {
					this.setVariableAt(item, entries[index][1]);
					this.setVariableAt(indexName, index);
					this.runBlock(this.commandChildren(node));
				}
				break;
			}
			case 'switch': {
				const value = this.variableAt(required(node, 'variable'));
				const selected = node.children.find(
					(child) =>
						child.tag === 'case' &&
						child.attributes.equals !== undefined &&
						sameValue(value, child.attributes.equals),
				);
				const fallback = node.children.find((child) => child.tag === 'default');
				this.runBlock((selected ?? fallback)?.children ?? []);
				break;
			}
			case 'end_turn':
				this.endTurn();
				break;
			case 'win':
				this.markSideResult(node.attributes.side, 'won');
				this.world.status = 'won';
				break;
			case 'lose':
				this.markSideResult(node.attributes.side, 'lost');
				this.world.status = 'lost';
				break;
			case 'endlevel': {
				const result = node.attributes.result === 'defeat' ? ('defeat' as const) : ('victory' as const);
				this.world.status = result === 'defeat' ? 'lost' : 'won';
				this.world.carryover = endLevelCarryover(this.world, endLevelSide(this.world, node.attributes.side), {
					result,
					bonus: integerAttribute(node, 'bonus'),
					carryoverPercentage: numberAttribute(node, 'carryover_percentage'),
					carryoverAdd: booleanAttribute(node, 'carryover_add'),
					nextScenario: node.attributes.next_scenario ?? null,
				});
				break;
			}
			case 'if': {
				//an immediately following [else] is this branch's other half, not a separate
				//command: the condition picks one body, and runBlock skips the [else] itself
				const fallback = node.children.find((child) => child.tag === 'else');
				const taken = this.nodeConditionMatches(node) ? node : fallback;
				this.runBlock(taken ? this.commandChildren(taken) : []);
				break;
			}
			case 'else':
				//reachable at top level for a free-standing [else]; a paired one is run by its [if]
				this.runBlock(this.commandChildren(node));
				break;
			case 'hook':
				this.runHook(node);
				break;
			default:
				throw new Error(`unknown MWL command: ${name}`);
		}
	}

	/**
	 * A node's children that are commands to run, dropping the condition children the schema
	 * allows a branch to carry. A `[condition]` is read by the branch itself, never executed:
	 * `[if]`/`[while]` evaluate one through `nodeConditionMatches`, where running it as a command
	 * would be an unknown tag.
	 */
	private commandChildren(node: MwlCompiledNode): MwlCompiledNode[] {
		return node.children.filter(
			(child) => child.tag !== 'condition' && child.tag !== 'filter' && child.tag !== 'filter_condition',
		);
	}

	private runHook(node: MwlCompiledNode): void {
		const reference = node.attributes.name ?? '';
		const hook = this.hooks?.command?.[reference];
		if (!hook) throw new Error(`MWL hook ${reference} is not implemented`);
		const { name: _name, ...context } = node.attributes;
		hook(this.worldView(), this.emit(), context);
	}

	private applyMove(id: string, x: number, y: number): void {
		const unit = this.world.units[id];
		if (!unit || !unit.alive) throw new Error(`MWL unit is not alive: ${id}`);
		const map = this.world.map ?? null;
		if (map) {
			if (x < 0 || y < 0 || x >= map.width || y >= map.height)
				throw new Error(`MWL move out of bounds: ${x},${y}`);
			const occupant = this.unitAt(x, y);
			if (occupant && occupant !== unit) throw new Error(`MWL move onto an occupied cell: ${x},${y}`);
		}
		if (typeof unit.moves === 'number') {
			if (unit.moves <= 0) throw new Error(`MWL unit has no moves left: ${id}`);
			unit.moves -= 1;
		}
		unit.x = x;
		unit.y = y;
		this.fireMoveto(id);
	}

	/** Deliver a `[message]` to the game, with speaker and portrait when given. */
	private showMessage(attributes: Readonly<Record<string, string>>): void {
		if (!this.onMessage) return;
		const message: MwlMessage = {
			text: this.interpolate(attributes.text ?? attributes.value ?? ''),
			...(attributes.speaker === undefined ? {} : { speaker: attributes.speaker }),
			...(attributes.portrait === undefined ? {} : { portrait: attributes.portrait }),
			...(attributes.side === undefined || attributes.side === '' ? {} : { side: attributes.side }),
		};
		this.onMessage(message);
	}

	/**
	 * Substitute `$name` and `$(expression)` references in message text from
	 * the world variables (numbers evaluate, missing reads as empty), the
	 * same interpolation WML authors expect in story and dialogue strings.
	 */
	private interpolate(text: string): string {
		const numeric = this.numericVariables();
		const expanded = text.replace(expressionReference, (_whole, expression: string) => {
			try {
				return String(evaluateExpression(expression, numeric));
			} catch {
				return '';
			}
		});
		return expanded.replace(variableReference, (_whole, name: string) => {
			const value = this.variableAt(name);
			return value === undefined || typeof value === 'boolean' ? '' : String(value);
		});
	}

	/**
	 * Expands the references a computed variable path is built from, so content can write
	 * `zombies[$index].allow_recruit` or `$target` (a variable holding a path) the way an author
	 * expects. Unlike a message, a reference here may not resolve to nothing: an empty segment
	 * would name a different variable than the one the content meant.
	 */
	private expandPath(path: string): string {
		const expanded = path.replace(expressionReference, (_whole, expression: string) =>
			String(evaluateExpression(expression, this.numericVariables())),
		);
		return expanded.replace(variableReference, (_whole, name: string) => {
			const value = this.variableAt(name);
			if (value === undefined) throw new Error(`MWL variable path reference "$${name}" names no variable`);
			if (typeof value === 'boolean' || typeof value === 'object')
				throw new Error(`MWL variable path reference "$${name}" is not a name or number`);
			return String(value);
		});
	}

	private setVariable(name: string, raw: string, mode?: string): void {
		// `mode` is content declaring what its own text means. A compiler target always
		// knows, so it never has to rely on the shape-guessing below: a literal containing
		// `+` or `(` stays text, and a literal that spells a numeric variable's name stays
		// text rather than reading that variable.
		if (mode === 'literal') {
			this.setVariableAt(name, raw);
			return;
		}
		if (mode === 'number') {
			const value = Number(raw);
			if (raw.trim() === '' || !Number.isFinite(value))
				throw new Error(`MWL set_variable mode="number" needs a number, got "${raw}"`);
			this.setVariableAt(name, value);
			return;
		}
		if (mode === 'expression') {
			this.setVariableAt(name, evaluateExpression(raw, this.numericVariables()));
			return;
		}
		if (mode !== undefined) throw new Error(`unknown MWL set_variable mode "${mode}"`);

		const numeric = Number(raw);
		if (raw.trim() !== '' && Number.isFinite(numeric)) {
			this.setVariableAt(name, numeric);
			return;
		}
		// A bare `$name` copies another variable (missing reads as empty),
		// so content can alias changing values without arithmetic.
		const reference = /^\$([A-Za-z_][A-Za-z0-9_.]*)$/.exec(raw.trim());
		if (reference) {
			const value = this.variableAt(reference[1]);
			this.setVariableAt(name, value === undefined ? '' : value);
			return;
		}
		const context = this.numericVariables();
		if (/[+*/^()]|\s-\s/.test(raw) || Object.prototype.hasOwnProperty.call(context, raw.trim())) {
			this.setVariableAt(name, evaluateExpression(raw, context));
			return;
		}
		this.setVariableAt(name, raw);
	}

	/** The numeric half of the world variables: the context every MWL expression evaluates in. */
	private numericVariables(): MwlExpressionContext {
		return Object.fromEntries(
			Object.entries(this.world.variables).filter(
				(entry): entry is [string, number] => typeof entry[1] === 'number',
			),
		);
	}

	private variableAt(path: string): MwlValue | undefined {
		return variableAtPath(this.world.variables, path);
	}

	private setVariableAt(path: string, value: MwlValue): void {
		const previous = this.variableAt(path);
		setVariableAtPath(this.world.variables, path, value);
		this.onTrace?.({ type: 'variable', name: path, ...(previous === undefined ? {} : { previous }), value });
	}

	private spawnUnit(type: string, side: string | undefined, x: number, y: number, id?: string, hp?: number): void {
		const stats = type ? this.unitTypes.get(type) : undefined;
		const key = id ?? `${type || 'unit'}#${side ?? ''}@${x},${y}`;
		this.world.units[key] = {
			hp: hp ?? stats?.hitpoints ?? 1,
			x,
			y,
			alive: true,
			...(type ? { type } : {}),
			...(side === undefined ? {} : { side }),
			...(stats ? { moves: stats.movement } : {}),
		};
	}

	private killUnit(id: string): void {
		const unit = this.world.units[id];
		if (!unit || !unit.alive) throw new Error(`MWL unit is not alive: ${id}`);
		unit.alive = false;
	}

	/**
	 * Live units a command's filter selects: its `[filter]` child when it has one, otherwise its
	 * own attributes, read by the same `unitMatchesFilter` an event filter and `[kill]` use. An
	 * empty filter matches every live unit, the rule `[kill]` already documents.
	 */
	private matchingUnits(
		node: MwlCompiledNode,
		exclude: readonly string[] = [],
	): Array<[string, MwlWorld['units'][string]]> {
		const filter = node.children.find((child) => child.tag === 'filter');
		//a `[filter]` child is a real unit filter and keeps every attribute; the node's own
		//attributes are the fallback, minus whatever they mean to this command instead of a unit
		const attributes = filter ? filter.attributes : withoutAttributes(node.attributes, ...exclude);
		return Object.entries(this.world.units).filter(
			([id, unit]) => unit.alive && unitMatchesFilter(unit, id, attributes),
		);
	}

	/** The unit snapshots `[store_unit]` wrote into a world variable, or a named content error. */
	private storedUnits(variable: string): Array<Record<string, MwlValue>> {
		const stored = this.variableAt(variable);
		if (!Array.isArray(stored))
			throw new Error(`MWL variable ${variable} is not a stored unit list; store one first`);
		return stored.filter(
			(entry): entry is Record<string, MwlValue> => !!entry && typeof entry === 'object' && !Array.isArray(entry),
		);
	}

	/** Writes a stored snapshot back into the world, applying any placement overrides. */
	private restoreUnit(entry: Record<string, MwlValue>, placement: { x?: number; y?: number; side?: string }): void {
		const id = typeof entry.id === 'string' ? entry.id : undefined;
		if (!id) throw new Error('a stored unit snapshot is missing its id');
		const unit: MwlWorld['units'][string] = {
			hp: typeof entry.hp === 'number' ? entry.hp : 1,
			x: placement.x ?? (typeof entry.x === 'number' ? entry.x : 0),
			y: placement.y ?? (typeof entry.y === 'number' ? entry.y : 0),
			alive: entry.alive !== false,
		};
		if (typeof entry.type === 'string') unit.type = entry.type;
		const side = placement.side ?? (typeof entry.side === 'string' ? entry.side : undefined);
		if (side !== undefined) unit.side = side;
		if (typeof entry.moves === 'number') unit.moves = entry.moves;
		if (typeof entry.name === 'string') unit.name = entry.name;
		if (typeof entry.role === 'string') unit.role = entry.role;
		if (typeof entry.can_recruit === 'boolean') unit.can_recruit = entry.can_recruit;
		if (typeof entry.leader === 'boolean') unit.leader = entry.leader;
		this.world.units[id] = unit;
	}

	/** Changes one cell of the primary map, keeping the parsed grid and its size in step. */
	private setTerrain(x: number, y: number, terrain: string): void {
		const map = this.world.map;
		if (!map) throw new Error('[set_terrain] needs a loaded map');
		if (x < 0 || y < 0 || x >= map.width || y >= map.height)
			throw new Error(`[set_terrain] is outside the map: ${x},${y}`);
		const codes = [...map.codes];
		codes[y * map.width + x] = terrain;
		this.world.map = { ...map, codes };
	}

	private addGold(side: string, delta: number): void {
		this.world.gold[side] = (this.world.gold[side] ?? 0) + delta;
	}

	private endTurn(): void {
		this.world.turn += 1;
		this.advanceSchedule();
		this.resetMoves();
		this.run('turn');
		this.checkTimeOver();
	}

	/**
	 * Wesnoth's "time over", as a framework native: once the scenario's `turn_limit` has passed,
	 * `time_over` becomes a variable content can test and an event trigger it can answer. The
	 * framework reports it rather than ending anything, because a turn limit is usually a defeat and
	 * occasionally the whole point of the scenario ("hold out until then"), so what it means is
	 * content's business - `[endlevel]` is right there for it. Fired once, and derived from the turn
	 * counter rather than kept in step with it.
	 */
	private checkTimeOver(): void {
		const limit = integerAttribute(this.game.roots[0], 'turn_limit');
		if (limit === undefined || this.world.turn <= limit || this.world.variables.time_over === 'yes') return;
		this.world.variables.time_over = 'yes';
		this.run('time_over');
	}

	private advanceSchedule(): void {
		if (!this.schedule.length) return;
		const index = ((this.world.scheduleIndex ?? 0) + 1) % this.schedule.length;
		this.world.scheduleIndex = index;
		this.world.timeOfDay = this.schedule[index];
	}

	private resetMoves(): void {
		for (const unit of Object.values(this.world.units)) {
			if (!unit.alive) continue;
			const stats = unit.type ? this.unitTypes.get(unit.type) : undefined;
			if (stats) unit.moves = stats.movement;
		}
	}

	private filterMatches(node: MwlCompiledNode): boolean {
		return Object.entries(this.world.units).some(
			([id, unit]) => unit.alive && unitMatchesFilter(unit, id, node.attributes),
		);
	}

	/**
	 * Every `condition` child must match (conjunction). Each child names a
	 * world variable and states one comparison: `equals` (the default, numeric
	 * aware), `not_equals`, comma-list `in`/`not_in`, or the numeric
	 * `less_than`/`greater_than`/`less_than_or_equal_to`/
	 * `greater_than_or_equal_to` (false when either side is not a number).
	 */
	private conditionMatches(node: MwlCompiledNode): boolean {
		return node.children
			.filter((child) => child.tag === 'condition')
			.every((condition) => {
				if (condition.attributes.condition === 'hook') {
					const hookName = condition.attributes.hook;
					const predicateName = hookName?.startsWith('predicate:')
						? hookName.slice('predicate:'.length)
						: undefined;
					const predicate = predicateName ? this.hooks?.predicate?.[predicateName] : undefined;
					if (!predicate) throw new Error(`MWL predicate ${predicateName ?? '<missing>'} is not implemented`);
					const { condition: _condition, hook: _hook, ...context } = condition.attributes;
					return Boolean(predicate(this.worldView(), context));
				}
				return variableMatches(
					this.variableAt(condition.attributes.variable),
					condition.attributes,
					resolveVariable(this.world.variables),
				);
			});
	}

	private nodeConditionMatches(node: MwlCompiledNode): boolean {
		if (node.attributes.test !== undefined)
			return evaluateCondition(node.attributes.test, primitiveVariables(this.world.variables));
		return this.conditionMatches(node);
	}

	/**
	 * A `filter_condition` child holds `variable` comparisons (same operators
	 * as `condition`) and `have_unit` existence checks (an alive unit matching
	 * the given id/type/side/x/y, reusing the `filter` semantics). All must
	 * hold for the event to fire.
	 */
	private filterConditionMatches(node: MwlCompiledNode): boolean {
		const wrapper = node.children.find((child) => child.tag === 'filter_condition');
		if (!wrapper) return true;
		return wrapper.children.every((child) => {
			if (child.tag === 'variable') {
				const name = child.attributes.name;
				if (name === undefined) return false;
				return variableMatches(this.variableAt(name), child.attributes, resolveVariable(this.world.variables));
			}
			if (child.tag === 'predicate') {
				const name = child.attributes.name;
				const predicate = name ? this.hooks?.predicate?.[name] : undefined;
				if (!predicate) throw new Error(`MWL predicate ${name ?? '<missing>'} is not implemented`);
				const { name: _name, ...context } = child.attributes;
				return Boolean(predicate(this.worldView(), context));
			}
			// `have_unit` names the world key with `id` where a `filter`
			// would say `unit`; everything else matches `filter` semantics.
			if (child.tag === 'have_unit')
				return Object.entries(this.world.units).some(
					([id, unit]) =>
						unit.alive &&
						(child.attributes.id === undefined || id === child.attributes.id) &&
						unitMatchesFilter(unit, id, child.attributes),
				);
			return true;
		});
	}

	/**
	 * Whether one objective's condition holds. `defaultSide` is the side whose own
	 * `[victory]`/`[defeat]` node this is, so a condition that names no side (a side losing
	 * when its own units are gone) reads as that side rather than as nobody.
	 */
	private conditionMet(node: MwlCompiledNode, defaultSide?: string): boolean {
		const condition = node.attributes.condition ?? '';
		const side = node.attributes.side ?? defaultSide;
		switch (condition) {
			case 'units_dead': {
				const target = node.attributes.side_filter ?? side;
				if (target === undefined) return false;
				return !Object.values(this.world.units).some((unit) => unit.alive && unit.side === target);
			}
			case 'turns_elapsed': {
				const turns = optionalInteger(node, 'turns');
				return turns !== undefined && this.world.turn >= turns;
			}
			case 'gold_at_least': {
				const gold = optionalInteger(node, 'gold');
				const goldSide = node.attributes.side ?? defaultSide;
				return gold !== undefined && goldSide !== undefined && (this.world.gold[goldSide] ?? 0) >= gold;
			}
			case 'unit_at': {
				const x = optionalInteger(node, 'x');
				const y = optionalInteger(node, 'y');
				const targetSide = node.attributes.side_filter ?? side;
				return Object.values(this.world.units).some(
					(unit) =>
						unit.alive &&
						(targetSide === undefined || unit.side === targetSide) &&
						(node.attributes.type === undefined || unit.type === node.attributes.type) &&
						unit.x === x &&
						unit.y === y,
				);
			}
			case 'hook': {
				const reference = node.attributes.hook ?? '';
				const hook = this.hooks?.predicate?.[reference];
				if (!hook) throw new Error(`MWL hook ${reference} is not implemented`);
				// The predicate receives the objective's other attributes as its
				// context, so content can parameterize an engine predicate.
				const { hook: _hook, condition: _condition, ...context } = node.attributes;
				return Boolean(hook(this.worldView(), context));
			}
			default:
				return false;
		}
	}

	/**
	 * Evaluates the scenario-wide `[objectives]` conditions first, exactly as before, then each
	 * side's own `[victory]`/`[defeat]` children. The scenario ends on the first side whose own
	 * condition fires, recording that side in `world.sideStatus`; a side's victory outranks
	 * another side's defeat when both fire in the same evaluation, which is the same precedence
	 * the scenario-wide pair has always had. A side condition with no `side`/`side_filter` reads
	 * as that side's own, so "this side loses when it has no units left" is written without
	 * repeating the id.
	 */
	private checkObjectives(): void {
		if (this.world.status !== 'playing') return;

		// a `[victory]`/`[defeat]` under a `[side]` is that side's own, never the scenario's
		const sideConditions = new Set<MwlCompiledNode>();
		const sides = this.nodes('side');
		for (const side of sides) {
			for (const child of side.children) {
				if (child.tag === 'victory' || child.tag === 'defeat') sideConditions.add(child);
			}
		}

		if (this.nodes('victory').some((node) => !sideConditions.has(node) && this.conditionMet(node))) {
			this.world.status = 'won';
			return;
		}
		if (this.nodes('defeat').some((node) => !sideConditions.has(node) && this.conditionMet(node))) {
			this.world.status = 'lost';
			return;
		}

		let sideWon = false;
		let sideLost = false;
		for (const side of sides) {
			const id = side.attributes.id;
			if (!id || (this.world.sideStatus?.[id] ?? 'playing') !== 'playing') continue;
			if (side.children.some((child) => child.tag === 'victory' && this.conditionMet(child, id))) {
				this.markSideResult(id, 'won');
				sideWon = true;
			} else if (side.children.some((child) => child.tag === 'defeat' && this.conditionMet(child, id))) {
				this.markSideResult(id, 'lost');
				sideLost = true;
			}
		}

		if (sideWon) this.world.status = 'won';
		else if (sideLost) this.world.status = 'lost';
	}

	/** Records one side's own result; the scenario status is set by whichever side fired first. */
	private markSideResult(side: string | undefined, result: 'won' | 'lost'): void {
		if (side === undefined || side === '') return;
		(this.world.sideStatus ??= {})[side] = result;
	}

	private worldView(): HookWorld {
		return {
			variables: this.world.variables,
			units: this.world.units,
			sides: this.world.sides,
			turn: this.world.turn,
		};
	}

	private emit(): Emit {
		return {
			move: (unit, x, y) => this.applyMove(unit, x, y),
			attack: (_attacker, _defender, _weapon) => {
				throw new Error(
					'MWL hook attack is not available in the framework runtime; the engine adapter owns combat',
				);
			},
			spawn: (type, side, x, y) => this.spawnUnit(type, side, x, y),
			kill: (unit) => this.killUnit(unit),
			gold: (side, delta) => this.addGold(side, delta),
			setVariable: (name, value) => {
				setVariableAtPath(this.world.variables, name, value);
			},
			message: (speaker, text) => this.onMessage?.({ text, ...(speaker ? { speaker } : {}) }),
			endTurn: () => this.endTurn(),
			win: (side) => {
				this.markSideResult(side, 'won');
				this.world.status = 'won';
			},
			lose: (side) => {
				this.markSideResult(side, 'lost');
				this.world.status = 'lost';
			},
		};
	}

	private attack(target: string, amount: number): void {
		const unit = this.world.units[target];
		if (!unit || !unit.alive) throw new Error(`MWL unit is not alive: ${target}`);
		unit.hp = Math.max(0, unit.hp - amount);
		if (unit.hp === 0) unit.alive = false;
	}

	private nodes(tag: string): MwlCompiledNode[] {
		const result: MwlCompiledNode[] = [];
		const visit = (node: MwlCompiledNode): void => {
			if (node.tag === tag) result.push(node);
			node.children.forEach(visit);
		};
		this.game.roots.forEach(visit);
		return result;
	}
}

/**
 * Applies one already-validated `MwlCommand` to a world, without a runtime around it.
 *
 * @example
 * ```ts
 * import { createWorld, execute } from '@datamoc/mw_games/mwl';
 *
 * const world = createWorld();
 * execute(world, { name: 'set_variable', target: 'gold', value: 50 });
 * console.log(world.variables.gold); // 50
 * ```
 */
export function execute(world: MwlWorld, command: MwlCommand): void {
	if (world.status !== 'playing' && command.name !== 'win' && command.name !== 'lose') return;
	switch (command.name) {
		case 'set_variable':
			setVariableAtPath(world.variables, command.target, command.value);
			break;
		case 'modify_gold':
			world.gold[command.target] = (world.gold[command.target] ?? 0) + command.amount;
			break;
		case 'move': {
			const unit = requireUnit(world, command.target);
			unit.x = command.x;
			unit.y = command.y;
			break;
		}
		case 'spawn':
			world.units[command.target] = { hp: command.hp, x: command.x, y: command.y, alive: true };
			break;
		case 'kill':
			if (command.target !== undefined) requireUnit(world, command.target).alive = false;
			else killMatching(world, command.filter ?? {});
			break;
		case 'end_turn':
			world.turn++;
			break;
		case 'win':
			if (command.side !== undefined && command.side !== '') (world.sideStatus ??= {})[command.side] = 'won';
			world.status = 'won';
			break;
		case 'lose':
			if (command.side !== undefined && command.side !== '') (world.sideStatus ??= {})[command.side] = 'lost';
			world.status = 'lost';
			break;
		case 'endlevel':
			world.status = command.result === 'defeat' ? 'lost' : 'won';
			world.carryover = endLevelCarryover(world, command.side ?? null, command);
			break;
	}
}

/**
 * Which side an `[endlevel]` carries: the one it names, or the human-controlled side when it names
 * none. `null` when there is no such side, which is not an error - a scenario can end with nobody
 * to carry.
 */
function endLevelSide(world: MwlWorld, named: string | undefined): MwlSideRef | null {
	const id = named ?? Object.entries(world.sides).find(([, side]) => side.controller === 'human')?.[0];
	if (!id || !(id in world.sides)) return null;
	return { id };
}

/**
 * The sides a scenario's content says see together, as groups ready for `FactionFog.share`.
 *
 * Wesnoth groups sides into teams with `[side] team_name`, and `share_vision` says whether a side
 * shares what it sees with its team. `none` does not; `all` and `shroud` are treated alike here
 * because `FactionFog` shares sight and memory as one thing rather than keeping them apart, and a
 * fog that separated them would be the place to tell the two apart. A side with no `team_name`
 * shares with nobody, and a team of one is not returned, since sharing with nobody is what it
 * already does.
 *
 * @example
 * ```ts
 * import { sideVisionGroups, type MwlWorld } from '@datamoc/mw_games/mwl';
 *
 * declare const world: MwlWorld;
 *
 * // sides 1 and 2 both wrote team_name=north, and side 3 asked for share_vision=none
 * console.log(sideVisionGroups(world)); // [['1', '2']]
 * ```
 */
export function sideVisionGroups(world: MwlWorld): readonly (readonly string[])[] {
	const teams = new Map<string, string[]>();
	for (const [id, side] of Object.entries(world.sides)) {
		if (!side.teamName || side.shareVision === 'none') continue;
		const group = teams.get(side.teamName);
		if (group) group.push(id);
		else teams.set(side.teamName, [id]);
	}
	return [...teams.values()].filter((group) => group.length > 1);
}

function requireUnit(world: MwlWorld, id: string): { hp: number; x: number; y: number; alive: boolean } {
	const unit = world.units[id];
	if (!unit || !unit.alive) throw new Error(`MWL unit is not alive: ${id}`);
	return unit;
}

/** Kills every alive unit a `[kill]` filter matches, and says how many it killed. */
function killMatching(world: MwlWorld, attributes: Readonly<Record<string, string>>): number {
	let killed = 0;
	for (const [id, unit] of Object.entries(world.units)) {
		if (!unit.alive || !unitMatchesFilter(unit, id, attributes)) continue;
		unit.alive = false;
		killed++;
	}
	return killed;
}

/** One unit as `[store_unit]` writes it: only the fields it has, so a variable stays small. */
function unitSnapshot(unit: MwlWorld['units'][string]): Record<string, MwlValue> {
	const snapshot: Record<string, MwlValue> = { hp: unit.hp, x: unit.x, y: unit.y, alive: unit.alive };
	if (unit.type !== undefined) snapshot.type = unit.type;
	if (unit.side !== undefined) snapshot.side = unit.side;
	if (unit.moves !== undefined) snapshot.moves = unit.moves;
	if (unit.name !== undefined) snapshot.name = unit.name;
	if (unit.role !== undefined) snapshot.role = unit.role;
	if (unit.can_recruit !== undefined) snapshot.can_recruit = unit.can_recruit;
	if (unit.leader !== undefined) snapshot.leader = unit.leader;
	return snapshot;
}

/** Applies `[modify_unit]`'s chosen attributes to one unit, ignoring anything it did not name. */
function applyUnitChanges(unit: MwlWorld['units'][string], changes: Readonly<Record<string, string>>): void {
	const hp = finiteNumber(changes.hp);
	if (hp !== undefined) unit.hp = hp;
	const moves = finiteNumber(changes.moves);
	if (moves !== undefined) unit.moves = moves;
	if (changes.type !== undefined) unit.type = changes.type;
	if (changes.side !== undefined) unit.side = changes.side;
	const alive = booleanValue(changes.alive);
	if (alive !== undefined) unit.alive = alive;
	if (changes.name !== undefined) unit.name = changes.name;
	if (changes.role !== undefined) unit.role = changes.role;
	const canRecruit = booleanValue(changes.can_recruit);
	if (canRecruit !== undefined) unit.can_recruit = canRecruit;
}

function finiteNumber(value: string | undefined): number | undefined {
	if (value === undefined || value === '') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalInteger(node: MwlCompiledNode, attribute: string): number | undefined {
	const value = node.attributes[attribute];
	if (value === undefined || value === '') return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * One variable comparison for `condition`/`variable` nodes. `equals` keeps
 * the historical numeric-aware match; the rest are strict about shape:
 * lists split on commas, comparisons coerce both sides with `Number` and
 * fail on anything non-numeric.
 */
function variableMatches(
	value: MwlValue | undefined,
	attributes: Readonly<Record<string, string>>,
	resolve: (reference: string) => MwlValue | undefined,
): boolean {
	const expected = (text: string): string | number | boolean | undefined => {
		if (!text.startsWith('$')) return text;
		const resolved = resolve(text.slice(1));
		return typeof resolved === 'string' || typeof resolved === 'number' || typeof resolved === 'boolean'
			? resolved
			: undefined;
	};
	if (attributes.equals !== undefined) return sameValue(value, expected(attributes.equals));
	if (attributes.not_equals !== undefined) return !sameValue(value, expected(attributes.not_equals));
	if (attributes.in !== undefined) {
		const options = attributes.in.split(',').map((entry) => entry.trim());
		return options.some((option) => sameValue(value, option));
	}
	if (attributes.not_in !== undefined) {
		const options = attributes.not_in.split(',').map((entry) => entry.trim());
		return !options.some((option) => sameValue(value, option));
	}
	const actual = typeof value === 'number' ? value : Number(value);
	const wanted = (name: string): number => Number(attributes[name]);
	if (
		attributes.less_than !== undefined ||
		attributes.greater_than !== undefined ||
		attributes.less_than_or_equal_to !== undefined ||
		attributes.greater_than_or_equal_to !== undefined
	) {
		if (typeof value === 'boolean' || !Number.isFinite(actual)) return false;
		if (attributes.less_than !== undefined && !(actual < wanted('less_than'))) return false;
		if (attributes.greater_than !== undefined && !(actual > wanted('greater_than'))) return false;
		if (attributes.less_than_or_equal_to !== undefined && !(actual <= wanted('less_than_or_equal_to')))
			return false;
		if (attributes.greater_than_or_equal_to !== undefined && !(actual >= wanted('greater_than_or_equal_to')))
			return false;
		return true;
	}
	return value !== undefined;
}

/**
 * One alive unit against `filter`/`have_unit` attributes: side, type (with
 * comma-list `not_type` exclusion), the unit's own name and role, whether it
 * can recruit, whether it is its side's leader, world key (`unit`, or `id`
 * on `have_unit`), and coordinates all have to match when present.
 */
function unitMatchesFilter(
	unit: {
		alive: boolean;
		type?: string;
		side?: string;
		x: number;
		y: number;
		name?: string;
		role?: string;
		can_recruit?: boolean;
		leader?: boolean;
	},
	id: string,
	attributes: Readonly<Record<string, string>>,
): boolean {
	const excluded = (attributes.not_type ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	const wantedCanRecruit = booleanValue(attributes.can_recruit);
	const wantedLeader = booleanValue(attributes.leader);
	const key = attributes.unit ?? attributes.id;
	return (
		(key === undefined || id === key) &&
		(attributes.side === undefined || unit.side === attributes.side) &&
		(attributes.type === undefined || unit.type === attributes.type) &&
		(excluded.length === 0 || !excluded.includes(unit.type ?? '')) &&
		(attributes.name === undefined || unit.name === attributes.name) &&
		(attributes.role === undefined || unit.role === attributes.role) &&
		(wantedCanRecruit === undefined || (unit.can_recruit ?? false) === wantedCanRecruit) &&
		(wantedLeader === undefined || (unit.leader ?? false) === wantedLeader) &&
		(attributes.x === undefined || coordinateMatches(attributes.x, unit.x)) &&
		(attributes.y === undefined || coordinateMatches(attributes.y, unit.y))
	);
}

/** a copy of `attributes` without the given keys, for a command whose own attribute names are not a unit filter */
function withoutAttributes(
	attributes: Readonly<Record<string, string>>,
	...excluded: readonly string[]
): Record<string, string> {
	if (excluded.length === 0) return { ...attributes };
	const copy = { ...attributes };
	for (const key of excluded) delete copy[key];
	return copy;
}

function sameValue(value: MwlValue | undefined, expected: string | number | boolean | undefined): boolean {
	if (value === undefined || expected === undefined) return value === expected;
	if (typeof expected !== 'string') return value === expected;
	const numeric = Number(expected);
	return typeof value === 'number' && expected.trim() !== '' && Number.isFinite(numeric)
		? value === numeric
		: value === expected;
}

function primitiveVariables(variables: Readonly<Record<string, MwlValue>>): Record<string, string | number | boolean> {
	return Object.fromEntries(
		Object.entries(variables).filter(
			(entry): entry is [string, string | number | boolean] =>
				typeof entry[1] === 'string' || typeof entry[1] === 'number' || typeof entry[1] === 'boolean',
		),
	);
}

/**
 * One step of a variable path: a named key, or a numeric index into an array
 * (`a[0].b`). `index` is undefined when the brackets hold something that is
 * not a whole number, so a caller that writes can refuse it rather than create
 * a literal `a[x]` key the matching read would never find.
 */
type VariablePathPart = string | { readonly index: number | undefined };
type IndexedPathPart = { readonly index: number };

/** `a.b[0].c` -> `['a', 'b', { index: 0 }, 'c']`. */
function variablePathParts(path: string): VariablePathPart[] {
	return path
		.split('.')
		.flatMap<VariablePathPart>((segment) => {
			const name = /^([^[\]]*)((?:\[[^\]]*\])*)$/.exec(segment);
			if (!name) return [segment];
			const parts: VariablePathPart[] = name[1] === '' ? [] : [name[1]];
			for (const bracket of name[2].matchAll(/\[([^\]]*)\]/g)) {
				const index = Number(bracket[1]);
				parts.push({ index: /^\d+$/.test(bracket[1].trim()) ? index : undefined });
			}
			return parts;
		})
		.filter((part) => typeof part !== 'string' || part !== '');
}

/** The path parts of a write, with any bracketed index that is not a whole number refused by name. */
function validVariablePathParts(path: string): Array<string | IndexedPathPart> {
	const parts = variablePathParts(path);
	if (parts.some((part) => typeof part !== 'string' && part.index === undefined))
		throw new Error(`invalid variable path: ${path}`);
	return parts as Array<string | IndexedPathPart>;
}

function isIndexedStep(step: string | IndexedPathPart): step is IndexedPathPart {
	return typeof step !== 'string';
}

/**
 * The one write of a variable path, so `execute()`, the hook host and the runtime's own
 * `set_variable` all place a value at the same node a read walks to. A step after an index
 * grows an array, so `a[0]`/`a[1]` build a real list rather than an object with numbered keys.
 */
function setVariableAtPath(variables: Record<string, MwlValue>, path: string, value: MwlValue): void {
	const parts = validVariablePathParts(path);
	const key = (step: string | IndexedPathPart): string | number => (typeof step === 'string' ? step : step.index);
	let current = variables as Record<string, MwlValue> | MwlValue[];
	for (let index = 0; index < parts.length - 1; index++) {
		const step = key(parts[index]);
		const child = (current as Record<string | number, MwlValue>)[step];
		if (!child || typeof child !== 'object') {
			(current as Record<string | number, MwlValue>)[step] = isIndexedStep(parts[index + 1]) ? [] : {};
		}
		current = (current as Record<string | number, MwlValue>)[step] as Record<string, MwlValue> | MwlValue[];
	}
	(current as Record<string | number, MwlValue>)[key(parts[parts.length - 1])] = value;
}

/** The one read of a variable path, used by every reader that takes a name. */
function variableAtPath(variables: Readonly<Record<string, MwlValue>>, path: string): MwlValue | undefined {
	let value: MwlValue | undefined = variables;
	for (const part of variablePathParts(path)) {
		if (typeof part === 'string') {
			if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
			value = value[part];
		} else {
			if (!Array.isArray(value) || part.index === undefined) return undefined;
			value = value[part.index];
		}
	}
	return value;
}

/** Resolves a `$name` reference (a path, not only a top-level key) from a variable tree. */
function resolveVariable(variables: Readonly<Record<string, MwlValue>>): (reference: string) => MwlValue | undefined {
	return (reference) => variableAtPath(variables, reference);
}

/**
 * Whether a coordinate satisfies a filter value: a whole number, an `A-B` range, or a
 * comma-separated list of either (`x=10-99,13-99`). Wesnoth spells both a moveto event's
 * position and a unit filter's `x`/`y` this way, so a plain `Number()` comparison would
 * drop every event or filter a real scenario gates on a coordinate range.
 */
function coordinateMatches(specification: string, coordinate: number): boolean {
	return specification.split(',').some((part) => {
		const value = part.trim();
		const range = value.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
		if (range) {
			const from = Number(range[1]);
			const to = Number(range[2]);
			return coordinate >= Math.min(from, to) && coordinate <= Math.max(from, to);
		}
		return /^-?\d+$/.test(value) && Number(value) === coordinate;
	});
}
