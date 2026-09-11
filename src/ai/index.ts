import { alphaBetaSearch } from './search.ts';
import type { AlphaBetaGame, AlphaBetaOptions, AlphaBetaResult } from './search.ts';

export { alphaBetaSearch } from './search.ts';
export type {
	AlphaBetaGame,
	AlphaBetaOptions,
	AlphaBetaResult,
	LuaAlphaBetaFunctions,
	LuaSearchValueAdapter,
} from './search.ts';

export { personalScoreView, scoreWith, sideScoreView } from './score.ts';
export {
	Aspects,
	Difficulty,
	Goals,
	HeuristicAI,
	RecruitmentPattern,
	defaultWeigh,
	goalScore,
	keepAwayScore,
} from './Heuristics.ts';
export type {
	AspectValue,
	AspectValues,
	DifficultyLevel,
	Goal,
	GoalKind,
	HeuristicCandidate,
	HeuristicContext,
	HeuristicDecision,
	HeuristicStage,
} from './Heuristics.ts';
export type { ScorePersonality, ScoreSubject, ScoreView } from './score.ts';

/** JSON-shaped values are the only values that cross the AI boundary. */
export type AIValue = null | boolean | number | string | AIValue[] | { readonly [key: string]: AIValue };
export type AIState = Record<string, AIValue>;

export interface AIAction {
	readonly type: string;
	readonly [key: string]: AIValue;
}

export interface AIDecisionInput {
	readonly perception: AIValue;
	readonly state?: AIState;
	readonly signal?: AbortSignal;
	readonly seed?: number;
	readonly maxSteps?: number;
	readonly maxMilliseconds?: number;
}

export interface AIDecisionContext {
	readonly perception: AIValue;
	readonly state: AIState;
	readonly random: () => number;
	readonly checkpoint: () => void;
	emit(name: string, payload?: AIValue): void;
}

export interface AIDecision {
	readonly agent: string;
	readonly action: AIAction | null;
	readonly state: AIState;
	readonly behavior?: string;
	readonly status: 'action' | 'idle' | 'cancelled' | 'budget-exceeded';
	readonly steps: number;
	readonly events: readonly AIEvent[];
}

export interface AIEvent {
	readonly name: string;
	readonly payload?: AIValue;
}

export interface AIDiagnostics {
	readonly onDecision?: (decision: AIDecision) => void;
}

export interface AIBehavior {
	readonly id: string;
	readonly when?: (context: AIDecisionContext) => boolean;
	readonly decide: (context: AIDecisionContext) => AIAction | null;
}

export interface AIAgentDefinition {
	readonly id: string;
	readonly behaviors: readonly AIBehavior[];
	readonly scope?: 'actor' | 'controller';
	readonly algorithm?: 'rules' | 'alpha_beta';
	readonly depth?: number;
	readonly maxNodes?: number;
}

export interface AIStateEnvelope {
	readonly version: 1;
	readonly agents: Readonly<Record<string, AIState>>;
}

export interface AIModule {
	register(agent: AIAgentDefinition): void;
	decide(agent: string, input: AIDecisionInput): AIDecision;
	exportState(): AIStateEnvelope;
	importState(envelope: AIStateEnvelope): void;
	dispose(): void;
}

export interface JavaScriptAIOptions extends AIDiagnostics {
	readonly maxSteps?: number;
	readonly maxMilliseconds?: number;
	readonly seed?: number;
}

const DEFAULT_MAX_STEPS = 10_000;
const DEFAULT_MAX_MILLISECONDS = 16;

/**
 * Renderer-free AI runner for game-owned JavaScript behaviours.
 *
 * Behaviours are checked in declaration order. A matching behaviour may return
 * `null` to yield an idle decision. Long-running behaviours must call
 * `checkpoint()` regularly: JavaScript cannot interrupt a synchronous function
 * that never yields or checks its budget.
 */
/**
 * Runs game-owned JavaScript behaviours without knowing anything about a renderer or game
 * rules.
 *
 * @example
 * ```ts
 * import { JavaScriptAI, AICancelledError, AIBudgetExceededError } from '@datamoc/mw_games/ai';
 *
 * const ai = new JavaScriptAI({ seed: 7 });
 * ai.register({ id: 'guard', behaviors: [{ id: 'wait', decide: () => ({ type: 'wait' }) }] });
 * const decision = ai.decide('guard', { perception: { visible: true } });
 * console.log(decision.action?.type); // 'wait'
 * void AICancelledError;
 * void AIBudgetExceededError;
 * ```
 */
export class JavaScriptAI implements AIModule {
	private readonly agents = new Map<string, AIAgentDefinition>();
	private readonly states = new Map<string, AIState>();
	private readonly options: JavaScriptAIOptions;

	constructor(options: JavaScriptAIOptions = {}) {
		this.options = options;
		validatePositiveInteger(options.maxSteps ?? DEFAULT_MAX_STEPS, 'maxSteps');
		validateNonNegativeFinite(options.maxMilliseconds ?? DEFAULT_MAX_MILLISECONDS, 'maxMilliseconds');
	}

	register(agent: AIAgentDefinition): void {
		if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(agent.id)) throw new Error(`invalid AI agent id: ${agent.id}`);
		if (this.agents.has(agent.id)) throw new Error(`AI agent already registered: ${agent.id}`);
		if (!agent.behaviors.length) throw new Error(`AI agent has no behaviours: ${agent.id}`);
		const ids = new Set<string>();
		for (const behavior of agent.behaviors) {
			if (!behavior.id || ids.has(behavior.id)) throw new Error(`duplicate AI behaviour: ${behavior.id}`);
			ids.add(behavior.id);
		}
		this.agents.set(agent.id, agent);
		this.states.set(agent.id, {});
	}

	decide(agentId: string, input: AIDecisionInput): AIDecision {
		const agent = this.agents.get(agentId);
		if (!agent) throw new Error(`unknown AI agent: ${agentId}`);
		const state = cloneState(input.state ?? this.states.get(agentId) ?? {});
		const maxSteps = input.maxSteps ?? this.options.maxSteps ?? DEFAULT_MAX_STEPS;
		const maxMilliseconds = input.maxMilliseconds ?? this.options.maxMilliseconds ?? DEFAULT_MAX_MILLISECONDS;
		validatePositiveInteger(maxSteps, 'maxSteps');
		validateNonNegativeFinite(maxMilliseconds, 'maxMilliseconds');
		let steps = 0;
		const started = performanceNow();
		const events: AIEvent[] = [];
		const random = seededRandom(input.seed ?? this.options.seed ?? 0x6d7767);
		const checkpoint = (): void => {
			steps++;
			if (input.signal?.aborted) throw new AICancelledError();
			if (steps > maxSteps || performanceNow() - started > maxMilliseconds) throw new AIBudgetExceededError();
		};
		const context: AIDecisionContext = {
			perception: cloneValue(input.perception),
			state,
			random: () => {
				checkpoint();
				return random();
			},
			checkpoint,
			emit(name, payload) {
				if (!name) throw new Error('AI event name must not be empty');
				checkpoint();
				events.push(payload === undefined ? { name } : { name, payload: cloneValue(payload) });
			},
		};

		let action: AIAction | null = null;
		let behaviorId: string | undefined;
		let status: AIDecision['status'] = 'idle';
		try {
			for (const behavior of agent.behaviors) {
				checkpoint();
				if (behavior.when && !behavior.when(context)) continue;
				behaviorId = behavior.id;
				action = validateAction(behavior.decide(context));
				status = action ? 'action' : 'idle';
				break;
			}
		} catch (error) {
			if (error instanceof AICancelledError) status = 'cancelled';
			else if (error instanceof AIBudgetExceededError) status = 'budget-exceeded';
			else throw error;
		}

		const decision: AIDecision = {
			agent: agentId,
			action,
			state: cloneState(state),
			behavior: behaviorId,
			status,
			steps,
			events,
		};
		this.states.set(agentId, cloneState(state));
		this.options.onDecision?.(decision);
		return decision;
	}

	/** Run alpha-beta against a game-owned state adapter for an actor or controller. */
	search<State, Move>(
		game: AlphaBetaGame<State, Move>,
		state: State,
		options: AlphaBetaOptions,
	): AlphaBetaResult<State, Move> {
		return alphaBetaSearch(game, state, options);
	}

	exportState(): AIStateEnvelope {
		return {
			version: 1,
			agents: Object.fromEntries([...this.states].map(([id, state]) => [id, cloneState(state)])),
		};
	}

	importState(envelope: AIStateEnvelope): void {
		if (envelope.version !== 1) throw new Error(`unsupported AI state version: ${envelope.version}`);
		for (const [id, state] of Object.entries(envelope.agents)) {
			if (!this.agents.has(id)) throw new Error(`AI state names unknown agent: ${id}`);
			this.states.set(id, cloneState(state));
		}
	}

	dispose(): void {
		this.agents.clear();
		this.states.clear();
	}
}

/** Raised internally when a cooperative decision observes an aborted signal. */
export class AICancelledError extends Error {
	constructor() {
		super('AI decision cancelled');
		this.name = 'AICancelledError';
	}
}

/** Raised internally when a cooperative decision exceeds its configured budget. */
export class AIBudgetExceededError extends Error {
	constructor() {
		super('AI decision budget exceeded');
		this.name = 'AIBudgetExceededError';
	}
}

function validateAction(action: AIAction | null): AIAction | null {
	if (action === null) return null;
	if (
		!action ||
		typeof action !== 'object' ||
		Array.isArray(action) ||
		typeof action.type !== 'string' ||
		!action.type
	) {
		throw new Error('AI action must be an object with a non-empty string type');
	}
	return cloneValue(action) as AIAction;
}

function cloneState(state: AIState): AIState {
	return cloneValue(state) as AIState;
}

function cloneValue(value: AIValue): AIValue {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(cloneValue);
	return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
}

function seededRandom(seed: number): () => number {
	if (!Number.isInteger(seed)) throw new TypeError('AI seed must be an integer');
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function validatePositiveInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

function validateNonNegativeFinite(value: number, name: string): void {
	if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number`);
}

function performanceNow(): number {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}
