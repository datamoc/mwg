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
	/** side number -> keep/start positions */
	readonly starts: Readonly<Record<number, readonly MwlMapStart[]>>;
}

export interface MwlWorld {
	readonly variables: Record<string, string | number | boolean>;
	readonly units: Record<
		string,
		{ hp: number; x: number; y: number; alive: boolean; type?: string; side?: number; moves?: number }
	>;
	readonly sides: Record<
		string,
		{ gold: number; income: number; leader?: string; controller?: string; recruit?: string }
	>;
	readonly maps: Record<string, { terrain: string; file?: string }>;
	gold: Record<string, number>;
	turn: number;
	status: 'playing' | 'won' | 'lost';
	/** the primary map, when the content declares one */
	map?: MwlMap | null;
	/** the current schedule entry, by id */
	timeOfDay?: string;
	scheduleIndex?: number;
	/** ids of one-shot events that already fired, so a restore keeps them spent */
	firedEvents?: string[];
}

/** One `[message]`: the text plus whatever a game needs to show it. */
export interface MwlMessage {
	readonly text: string;
	readonly speaker?: string;
	readonly portrait?: string;
	readonly side?: number;
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

export interface MwlRuntimeOptions {
	readonly world?: MwlWorld;
	/** called for every `[message]` command, with its speaker and portrait */
	readonly onMessage?: (message: MwlMessage) => void;
	/** resolve a `[map] file=` reference to its text */
	readonly resolveMap?: (file: string) => string;
	readonly hooks?: MwlHookRegistry;
	/** schema version and migrations used by save/restore; defaults to version 1 */
	readonly persistence?: MwlPersistenceOptions;
}

export type MwlCommand =
	| { readonly name: 'set_variable'; readonly target: string; readonly value: string | number | boolean }
	| { readonly name: 'modify_gold'; readonly target: string; readonly amount: number }
	| { readonly name: 'move'; readonly target: string; readonly x: number; readonly y: number }
	| { readonly name: 'spawn'; readonly target: string; readonly x: number; readonly y: number; readonly hp: number }
	| { readonly name: 'kill'; readonly target: string }
	| { readonly name: 'attack'; readonly target: string; readonly amount: number }
	| { readonly name: 'end_turn' }
	| { readonly name: 'win' }
	| { readonly name: 'lose' };

export function createWorld(): MwlWorld {
	return {
		variables: {},
		units: {},
		sides: {},
		maps: {},
		gold: {},
		turn: 1,
		status: 'playing',
		map: null,
		timeOfDay: '',
		scheduleIndex: 0,
	};
}

/**
 * Parse map text: one row per line, comma-separated codes. A token may be
 * `<side> <code>` to mark that side's keep/start, which is how a leader knows
 * where to appear.
 */
export function parseTerrain(text: string): {
	width: number;
	height: number;
	codes: string[];
	starts: Record<number, { x: number; y: number }[]>;
} {
	const rows = text
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '')
		.map((line) => line.split(',').map((token) => token.trim()));
	const height = rows.length;
	const width = rows.length ? Math.max(...rows.map((row) => row.length)) : 0;
	const codes: string[] = [];
	const starts: Record<number, { x: number; y: number }[]> = {};
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const token = rows[y]?.[x] ?? '_off^_usr';
			const keep = /^([0-9]+)\s+(.+)$/.exec(token);
			if (keep) {
				codes.push(keep[2]);
				(starts[Number(keep[1])] ??= []).push({ x, y });
			} else codes.push(token);
		}
	}
	return { width, height, codes, starts };
}

/**
 * Runtime for compiled MWL content. It never parses source text during play.
 *
 * The framework runtime owns what is game-agnostic: maps, sides, units, turn
 * order, the schedule, objectives, events, and save/load. Game rules that need
 * real data (pathfinding costs, combat formulas) stay in the engine adapter;
 * this runtime's `move` is a bounds and occupancy check, and `attack` applies
 * the amount the content asks for.
 */
export class MwlRuntime {
	readonly game: MwlCompiledGame;
	readonly world: MwlWorld;
	private readonly onMessage?: (message: MwlMessage) => void;
	private readonly resolveMap?: (file: string) => string;
	private readonly hooks?: MwlHookRegistry;
	private readonly persistence: MwlPersistenceOptions;
	private readonly unitTypes = new Map<string, { hitpoints: number; movement: number }>();
	private schedule: string[] = [];

	constructor(game: MwlCompiledGame, options: MwlRuntimeOptions = {}) {
		this.game = game;
		this.world = options.world ?? createWorld();
		this.onMessage = options.onMessage;
		this.resolveMap = options.resolveMap;
		this.hooks = options.hooks;
		this.persistence = options.persistence ?? { version: 1 };
		this.loadUnitTypes();
		this.loadSchedule();
		this.loadInitialContent();
		this.loadInitialUnits();
		this.loadLeaders();
	}

	run(trigger: string): void {
		for (const event of this.nodes('event')) {
			if ((event.attributes.on ?? event.attributes.trigger) !== trigger) continue;
			if (!this.eventFiltersMatch(event)) continue;
			if (!this.claimEvent(event)) continue;
			this.executeEvent(event);
		}
		this.checkObjectives();
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
			if (event.attributes.x !== undefined && integer(event, 'x', Number.NaN) !== unit.x) continue;
			if (event.attributes.y !== undefined && integer(event, 'y', Number.NaN) !== unit.y) continue;
			if (event.attributes.unit !== undefined && event.attributes.unit !== id) continue;
			if (event.attributes.side !== undefined && integer(event, 'side', Number.NaN) !== unit.side) continue;
			if (!this.eventFiltersMatch(event)) continue;
			if (!this.claimEvent(event)) continue;
			this.executeEvent(event);
		}
		this.checkObjectives();
	}

	/** A `moveto` event is a story beat: it fires once unless told otherwise. */
	private claimEvent(event: MwlCompiledNode): boolean {
		const once = event.attributes.once === undefined ? event.attributes.on === 'moveto' : event.attributes.once !== 'false';
		if (!once) return true;
		const key = event.attributes.id ?? `${event.attributes.on ?? event.attributes.trigger ?? 'event'}@${event.location?.line ?? 0}`;
		const fired = (this.world.firedEvents ??= []);
		if (fired.includes(key)) return false;
		fired.push(key);
		return true;
	}

	private eventFiltersMatch(event: MwlCompiledNode): boolean {
		const condition = event.children.find((child) => child.tag === 'condition');
		if (condition && this.world.variables[condition.attributes.variable] !== condition.attributes.equals) return false;
		const filter = event.children.find((child) => child.tag === 'filter');
		return !filter || this.filterMatches(filter);
	}

	private executeEvent(event: MwlCompiledNode): void {
		for (const command of event.children.filter(
			(child) => child.tag !== 'condition' && child.tag !== 'filter' && child.tag !== 'dialogue' && child.tag !== 'say',
		))
			this.executeNode(command);
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
		this.world.map = restored.map ?? null;
		this.world.timeOfDay = restored.timeOfDay ?? this.schedule[0] ?? '';
		this.world.scheduleIndex = restored.scheduleIndex ?? 0;
		// One-shot events stay spent across a load.
		this.world.firedEvents = [...(restored.firedEvents ?? [])];
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
			this.world.sides[required(side, 'id')] = entry;
		}
		for (const map of this.nodes('map')) {
			const id = map.attributes.id ?? map.attributes.name ?? 'map';
			this.world.maps[id] = { terrain: map.attributes.terrain ?? '', file: map.attributes.file };
			if (!this.world.map) this.world.map = this.buildMap(id, map);
		}
	}

	private buildMap(id: string, node: MwlCompiledNode): MwlMap | null {
		let text = node.attributes.terrain;
		if (!text && node.attributes.file && this.resolveMap) text = this.resolveMap(node.attributes.file);
		if (!text) return null;
		const parsed = parseTerrain(text);
		for (const start of node.children) {
			if (start.tag !== 'start') continue;
			const side = optionalInteger(start, 'side');
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
			if (unit.attributes.side !== undefined) entry.side = integer(unit, 'side', 0);
			this.world.units[id] = entry;
		}
	}

	private loadLeaders(): void {
		for (const side of this.nodes('side')) {
			const leader = side.attributes.leader;
			if (!leader) continue;
			const sideNumber = optionalInteger(side, 'id');
			if (sideNumber === undefined) continue;
			const starts = this.world.map?.starts[sideNumber];
			if (!starts?.length) continue;
			const stats = this.unitTypes.get(leader);
			for (const start of starts) {
				if (this.unitAt(start.x, start.y)) continue;
				const id = `${leader} ${sideNumber} (${start.x},${start.y})`;
				this.world.units[id] = {
					hp: stats?.hitpoints ?? 1,
					x: start.x,
					y: start.y,
					alive: true,
					type: leader,
					side: sideNumber,
					moves: stats?.movement ?? 0,
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
					node.attributes.side === undefined ? undefined : integer(node, 'side', 0),
					integer(node, 'x', 0),
					integer(node, 'y', 0),
					node.attributes.id ?? node.attributes.target,
					node.attributes.hp === undefined ? undefined : integer(node, 'hp', 1),
				);
				break;
			case 'move':
				this.applyMove(node.attributes.unit ?? required(node, 'target'), integer(node, 'x', 0), integer(node, 'y', 0));
				break;
			case 'kill':
				this.killUnit(node.attributes.unit ?? required(node, 'target'));
				break;
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
			case 'set_variable':
				this.world.variables[node.tag === 'command' ? required(node, 'target') : required(node, 'name')] =
					node.attributes.value ?? '';
				break;
			case 'end_turn':
				this.endTurn();
				break;
			case 'win':
				this.world.status = 'won';
				break;
			case 'lose':
				this.world.status = 'lost';
				break;
			case 'if':
				if (!this.conditionMatches(node)) break;
				for (const child of node.children) this.executeNode(child);
				break;
			case 'else':
				for (const child of node.children) this.executeNode(child);
				break;
			case 'hook':
				this.runHook(node);
				break;
			default:
				throw new Error(`unknown MWL command: ${name}`);
		}
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
			if (x < 0 || y < 0 || x >= map.width || y >= map.height) throw new Error(`MWL move out of bounds: ${x},${y}`);
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
		const side = Number.parseInt(attributes.side ?? '', 10);
		const message: MwlMessage = {
			text: attributes.text ?? attributes.value ?? '',
			...(attributes.speaker === undefined ? {} : { speaker: attributes.speaker }),
			...(attributes.portrait === undefined ? {} : { portrait: attributes.portrait }),
			...(Number.isFinite(side) ? { side } : {}),
		};
		this.onMessage(message);
	}

	private spawnUnit(type: string, side: number | undefined, x: number, y: number, id?: string, hp?: number): void {
		const stats = type ? this.unitTypes.get(type) : undefined;
		const key = id ?? `${type || 'unit'}#${side ?? 0}@${x},${y}`;
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

	private addGold(side: string, delta: number): void {
		this.world.gold[side] = (this.world.gold[side] ?? 0) + delta;
	}

	private endTurn(): void {
		this.world.turn += 1;
		this.advanceSchedule();
		this.resetMoves();
		this.run('turn');
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
		const candidates = Object.values(this.world.units).filter((unit) => unit.alive);
		return candidates.some(
			(unit) =>
				(node.attributes.side === undefined || unit.side === Number(node.attributes.side)) &&
				(node.attributes.type === undefined || unit.type === node.attributes.type) &&
				(node.attributes.x === undefined || unit.x === Number(node.attributes.x)) &&
				(node.attributes.y === undefined || unit.y === Number(node.attributes.y)),
		);
	}

	private conditionMatches(node: MwlCompiledNode): boolean {
		const condition = node.children.find((child) => child.tag === 'condition');
		return !condition || this.world.variables[condition.attributes.variable] === condition.attributes.equals;
	}

	private conditionMet(node: MwlCompiledNode): boolean {
		const condition = node.attributes.condition ?? '';
		const side = optionalInteger(node, 'side');
		switch (condition) {
			case 'units_dead': {
				const target = optionalInteger(node, 'side_filter') ?? side;
				if (target === undefined) return false;
				return !Object.values(this.world.units).some((unit) => unit.alive && unit.side === target);
			}
			case 'turns_elapsed': {
				const turns = optionalInteger(node, 'turns');
				return turns !== undefined && this.world.turn >= turns;
			}
			case 'gold_at_least': {
				const gold = optionalInteger(node, 'gold');
				return (
					gold !== undefined &&
					node.attributes.side !== undefined &&
					(this.world.gold[node.attributes.side] ?? 0) >= gold
				);
			}
			case 'unit_at': {
				const x = optionalInteger(node, 'x');
				const y = optionalInteger(node, 'y');
				return Object.values(this.world.units).some(
					(unit) =>
						unit.alive &&
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

	private checkObjectives(): void {
		if (this.world.status !== 'playing') return;
		if (this.nodes('victory').some((node) => this.conditionMet(node))) {
			this.world.status = 'won';
			return;
		}
		if (this.nodes('defeat').some((node) => this.conditionMet(node))) this.world.status = 'lost';
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
				throw new Error('MWL hook attack is not available in the framework runtime; the engine adapter owns combat');
			},
			spawn: (type, side, x, y) => this.spawnUnit(type, side, x, y),
			kill: (unit) => this.killUnit(unit),
			gold: (side, delta) => this.addGold(String(side), delta),
			setVariable: (name, value) => {
				this.world.variables[name] = value;
			},
			message: (speaker, text) => this.onMessage?.({ text, ...(speaker ? { speaker } : {}) }),
			endTurn: () => this.endTurn(),
			win: (_side) => {
				this.world.status = 'won';
			},
			lose: (_side) => {
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

export function execute(world: MwlWorld, command: MwlCommand): void {
	if (world.status !== 'playing' && command.name !== 'win' && command.name !== 'lose') return;
	switch (command.name) {
		case 'set_variable':
			world.variables[command.target] = command.value;
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
			requireUnit(world, command.target).alive = false;
			break;
		case 'end_turn':
			world.turn++;
			break;
		case 'win':
			world.status = 'won';
			break;
		case 'lose':
			world.status = 'lost';
			break;
	}
}

function requireUnit(world: MwlWorld, id: string): { hp: number; x: number; y: number; alive: boolean } {
	const unit = world.units[id];
	if (!unit || !unit.alive) throw new Error(`MWL unit is not alive: ${id}`);
	return unit;
}

function required(node: MwlCompiledNode, attribute: string): string {
	const value = node.attributes[attribute];
	if (!value) throw new Error(`MWL ${node.tag} is missing ${attribute}`);
	return value;
}

function integer(node: MwlCompiledNode, attribute: string, fallback: number): number {
	const value = node.attributes[attribute];
	return value === undefined ? fallback : Number.parseInt(value, 10);
}

function optionalInteger(node: MwlCompiledNode, attribute: string): number | undefined {
	const value = node.attributes[attribute];
	if (value === undefined || value === '') return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}
