import { createFengariScriptHost, type FengariScriptHostOptions } from '../mwl/fengari.ts';
import type { ScriptHost } from '../mwl/scripts.ts';
import { type AIDecision, type AIDecisionInput, type AIStateEnvelope } from './index.ts';
import { alphaBetaSearch, type AlphaBetaOptions, type AlphaBetaResult, type LuaAlphaBetaFunctions } from './search.ts';

export interface LuaAIAgentDefinition {
	readonly id: string;
	readonly source: string;
	readonly functionName?: string;
	readonly search?: LuaAlphaBetaFunctions;
}

export interface LuaAIOptions extends FengariScriptHostOptions {
	readonly host?: ScriptHost;
	readonly maxSteps?: number;
	readonly maxMilliseconds?: number;
	readonly seed?: number;
	readonly onDecision?: (decision: AIDecision) => void;
}

/**
 * Optional Lua provider with the same decision shape as `JavaScriptAI`.
 *
 * A Lua function receives `(perception, state)` and returns either an action
 * table or `{ action = action_table, state = state_table, events = {...} }`.
 * The host is supplied so games can choose their own VM policy and tests can
 * inject a fake without loading Fengari.
 */
export class LuaAI {
	private readonly host: ScriptHost;
	private readonly agents = new Map<string, LuaAIAgentDefinition>();
	private readonly states = new Map<string, Record<string, import('./index.ts').AIValue>>();
	private readonly options: LuaAIOptions;
	private readonly loaded = new Set<string>();

	constructor(options: LuaAIOptions = {}) {
		this.options = options;
		this.host =
			options.host ??
			createFengariScriptHost({
				instructionLimit: options.maxSteps ?? options.instructionLimit,
				seed: options.seed,
			});
	}

	register(agent: LuaAIAgentDefinition): void {
		if (this.agents.has(agent.id)) throw new Error(`Lua AI agent already registered: ${agent.id}`);
		if (!agent.source.trim()) throw new Error(`Lua AI agent has empty source: ${agent.id}`);
		this.agents.set(agent.id, agent);
		this.states.set(agent.id, {});
	}

	decide(agentId: string, input: AIDecisionInput): AIDecision {
		const agent = this.agents.get(agentId);
		if (!agent) throw new Error(`unknown Lua AI agent: ${agentId}`);
		if (input.signal?.aborted) {
			return {
				agent: agentId,
				action: null,
				state: this.states.get(agentId) ?? {},
				status: 'cancelled',
				steps: 0,
				events: [],
			};
		}
		if (!this.loaded.has(agentId)) {
			this.host.execute(agent.source);
			this.loaded.add(agentId);
		}
		const functionName = agent.functionName ?? 'decide';
		const state = input.state ?? this.states.get(agentId) ?? {};
		try {
			const result = this.host.call(functionName, [input.perception, state], {
				mwg_seed: input.seed ?? this.options.seed ?? 0x6d7767,
			});
			const normalized = normalizeResult(agentId, result, state);
			this.states.set(agentId, normalized.state);
			const decision: AIDecision = {
				agent: agentId,
				action: normalized.action,
				state: normalized.state,
				status: normalized.action ? 'action' : 'idle',
				steps: 1,
				events: normalized.events,
			};
			this.options.onDecision?.(decision);
			return decision;
		} catch (error) {
			if (/instruction limit exceeded/i.test(String(error))) {
				const decision: AIDecision = {
					agent: agentId,
					action: null,
					state: state as Record<string, import('./index.ts').AIValue>,
					status: 'budget-exceeded',
					steps: input.maxSteps ?? this.options.maxSteps ?? 0,
					events: [],
				};
				this.options.onDecision?.(decision);
				return decision;
			}
			throw error;
		}
	}

	/**
	 * Search a game whose state and operations are exposed by named Lua functions.
	 * Defaults are `current_player`, `legal_moves`, `apply_move`, `is_terminal` and
	 * `evaluate`, each receiving the state and, for `apply_move`, the move as arguments.
	 */
	search(
		agentId: string,
		state: import('./index.ts').AIValue,
		options: AlphaBetaOptions,
	): AlphaBetaResult<import('./index.ts').AIValue, import('./index.ts').AIValue> {
		const agent = this.agents.get(agentId);
		if (!agent) throw new Error(`unknown Lua AI agent: ${agentId}`);
		if (!this.loaded.has(agentId)) {
			this.host.execute(agent.source);
			this.loaded.add(agentId);
		}
		const names = {
			player: agent.search?.player ?? 'current_player',
			moves: agent.search?.moves ?? 'legal_moves',
			apply: agent.search?.apply ?? 'apply_move',
			terminal: agent.search?.terminal ?? 'is_terminal',
			evaluate: agent.search?.evaluate ?? 'evaluate',
		};
		const call = (name: string, args: import('./index.ts').AIValue[]): import('./index.ts').AIValue =>
			this.host.call(name, args, { mwg_seed: this.options.seed ?? 0x6d7767 });
		return alphaBetaSearch(
			{
				currentPlayer: (current) => toNumber(call(names.player, [current]), `Lua AI ${agentId} player`),
				moves: (current) => toMoves(call(names.moves, [current]), agentId),
				apply: (current, move) => call(names.apply, [current, move]),
				isTerminal: (current) => toBoolean(call(names.terminal, [current]), `Lua AI ${agentId} terminal`),
				evaluate: (current, perspective) =>
					toNumber(call(names.evaluate, [current, perspective]), `Lua AI ${agentId} evaluation`),
			},
			state,
			options,
		);
	}

	exportState(): AIStateEnvelope {
		return { version: 1, agents: Object.fromEntries([...this.states].map(([id, state]) => [id, clone(state)])) };
	}

	importState(envelope: AIStateEnvelope): void {
		if (envelope.version !== 1) throw new Error(`unsupported AI state version: ${envelope.version}`);
		for (const [id, state] of Object.entries(envelope.agents)) {
			if (!this.agents.has(id)) throw new Error(`AI state names unknown agent: ${id}`);
			this.states.set(id, clone(state));
		}
	}

	dispose(): void {
		this.host.dispose();
		this.agents.clear();
		this.states.clear();
		this.loaded.clear();
	}
}

function normalizeResult(
	agent: string,
	result: import('./index.ts').AIValue,
	initialState: Record<string, import('./index.ts').AIValue>,
): {
	action: import('./index.ts').AIAction | null;
	state: Record<string, import('./index.ts').AIValue>;
	events: readonly import('./index.ts').AIEvent[];
} {
	if (result === null) return { action: null, state: clone(initialState), events: [] };
	if (typeof result !== 'object' || Array.isArray(result))
		throw new Error(`Lua AI ${agent} must return an action table`);
	const value = result as Record<string, import('./index.ts').AIValue>;
	const hasEnvelope = 'action' in value || 'state' in value || 'events' in value;
	const action = (hasEnvelope ? value.action : value) as import('./index.ts').AIAction | null | undefined;
	if (
		action !== null &&
		action !== undefined &&
		(typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string')
	) {
		throw new Error(`Lua AI ${agent} returned an invalid action`);
	}
	const events =
		hasEnvelope && value.events && typeof value.events === 'object'
			? tableEntries(value.events).map((entry) => {
					if (
						typeof entry !== 'object' ||
						entry === null ||
						Array.isArray(entry) ||
						typeof entry.name !== 'string'
					) {
						throw new Error(`Lua AI ${agent} returned an invalid event`);
					}
					return entry as unknown as import('./index.ts').AIEvent;
				})
			: [];
	const state =
		hasEnvelope && value.state && typeof value.state === 'object' && !Array.isArray(value.state)
			? (value.state as Record<string, import('./index.ts').AIValue>)
			: initialState;
	return { action: action ?? null, state: clone(state), events };
}

function tableEntries(value: import('./index.ts').AIValue): import('./index.ts').AIValue[] {
	if (Array.isArray(value)) return value;
	if (value === null || typeof value !== 'object') return [];
	return Object.keys(value)
		.filter((key) => /^\d+$/.test(key))
		.sort((a, b) => Number(a) - Number(b))
		.map((key) => value[key]);
}

function toMoves(value: import('./index.ts').AIValue, agent: string): readonly import('./index.ts').AIValue[] {
	const moves = tableEntries(value);
	if (value !== null && typeof value !== 'object') throw new Error(`Lua AI ${agent} legal moves must be a table`);
	return moves;
}

function toBoolean(value: import('./index.ts').AIValue, name: string): boolean {
	if (typeof value !== 'boolean') throw new Error(`${name} must return a boolean`);
	return value;
}

function toNumber(value: import('./index.ts').AIValue, name: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must return a finite number`);
	return value;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

export function createLuaAI(options: LuaAIOptions = {}): LuaAI {
	return new LuaAI(options);
}

export type { AIAgentDefinition, AIDecision, AIDecisionInput, AIStateEnvelope } from './index.ts';
