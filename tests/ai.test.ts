import assert from 'node:assert/strict';
import test from 'node:test';
import { JavaScriptAI, type AIAction } from '../src/ai/index.ts';
import { LuaAI } from '../src/ai/lua.ts';

test('JavaScriptAI selects a behaviour, uses seeded randomness, and persists state', () => {
	const seen: string[] = [];
	const ai = new JavaScriptAI({ seed: 12, onDecision: (decision) => seen.push(decision.status) });
	ai.register({
		id: 'guard',
		behaviors: [
			{
				id: 'watch',
				when: ({ perception }) => (perception as { readonly enemy?: boolean }).enemy === true,
				decide: ({ state, random }) => {
					state.alerts = Number(state.alerts ?? 0) + 1;
					return { type: 'turn', direction: random() < 0.5 ? 'left' : 'right' };
				},
			},
			{ id: 'idle', decide: () => null },
		],
	});
	const first = ai.decide('guard', { perception: { enemy: true } });
	const second = ai.decide('guard', { perception: { enemy: true }, seed: 12 });
	assert.equal(first.status, 'action');
	assert.deepEqual(first.action, second.action);
	assert.equal(second.state.alerts, 2);
	assert.deepEqual(ai.exportState().agents.guard, { alerts: 2 });
	assert.deepEqual(seen, ['action', 'action']);
});

test('JavaScriptAI reports cooperative budget exhaustion and cancellation', () => {
	const ai = new JavaScriptAI({ maxMilliseconds: 1 });
	ai.register({
		id: 'loop',
		behaviors: [
			{
				id: 'work',
				decide: ({ checkpoint }) => {
					for (;;) checkpoint();
				},
			},
		],
	});
	assert.equal(ai.decide('loop', { perception: null, maxSteps: 3 }).status, 'budget-exceeded');
	const controller = new AbortController();
	controller.abort();
	assert.equal(ai.decide('loop', { perception: null, signal: controller.signal }).status, 'cancelled');
});

test('JavaScriptAI imports only known serialisable agent state', () => {
	const ai = new JavaScriptAI();
	ai.register({ id: 'scout', behaviors: [{ id: 'idle', decide: () => null }] });
	ai.importState({ version: 1, agents: { scout: { route: ['north'] } } });
	assert.deepEqual(ai.exportState().agents.scout, { route: ['north'] });
	assert.throws(() => ai.importState({ version: 1, agents: { missing: {} } }), /unknown agent/);
});

test('alphaBetaSearch chooses the minimax move and reports pruning', () => {
	type State = { id: string; player: number };
	const children: Record<string, readonly string[]> = {
		root: ['a', 'b'],
		a: ['a1', 'a2'],
		b: ['b1', 'b2'],
	};
	const scores: Record<string, number> = { a1: 3, a2: 4, b1: 2, b2: 1 };
	const game = {
		currentPlayer: (state: State) => state.player,
		moves: (state: State) => children[state.id]?.map((id) => id) ?? [],
		apply: (state: State, move: string) => ({ id: move, player: state.player === 1 ? 2 : 1 }),
		isTerminal: (state: State) => scores[state.id] !== undefined,
		evaluate: (state: State) => scores[state.id] ?? 0,
	};
	const ai = new JavaScriptAI();
	const result = ai.search(game, { id: 'root', player: 1 }, { depth: 2 });
	assert.equal(result.status, 'complete');
	assert.equal(result.move, 'a');
	assert.ok(result.cutoffs > 0);
});

test('LuaAI runs the shared decision contract and keeps state explicit', () => {
	const ai = new LuaAI({ seed: 3 });
	ai.register({
		id: 'scout',
		source: `function decide(perception, state)
			state.turns = (state.turns or 0) + 1
			return { action = { type = "move", x = perception.x + 1 }, state = state,
				events = { { name = "thought", payload = { turns = state.turns } } } }
		end`,
	});
	const decision = ai.decide('scout', { perception: { x: 4 } });
	assert.equal(decision.status, 'action');
	assert.deepEqual(decision.action, { type: 'move', x: 5 } satisfies AIAction);
	assert.deepEqual(decision.state, { turns: 1 });
	assert.deepEqual(decision.events, [{ name: 'thought', payload: { turns: 1 } }]);
	ai.dispose();
});

test('LuaAI turns the Fengari instruction limit into a bounded decision', () => {
	const ai = new LuaAI({ maxSteps: 1_000 });
	ai.register({ id: 'stuck', source: 'function decide() while true do end end' });
	assert.equal(ai.decide('stuck', { perception: null }).status, 'budget-exceeded');
	ai.dispose();
});

test('LuaAI can drive alpha-beta through named Lua game operations', () => {
	const ai = new LuaAI({ maxSteps: 10_000 });
	ai.register({
		id: 'master',
		source: `function current_player(state) return state.player end
			function legal_moves(state) if state.ply < 2 then return { 1, 2 } else return {} end end
			function apply_move(state, move)
				return { ply = state.ply + 1, value = state.value + (state.player == 1 and move or -move), player = (state.player == 1 and 2 or 1) }
			end
			function is_terminal(state) return state.ply >= 2 end
			function evaluate(state, perspective) return state.value end`,
		search: {
			player: 'current_player',
			moves: 'legal_moves',
			apply: 'apply_move',
			terminal: 'is_terminal',
			evaluate: 'evaluate',
		},
	});
	const result = ai.search('master', { ply: 0, value: 0, player: 1 }, { depth: 2 });
	assert.equal(result.status, 'complete');
	assert.equal(result.move, 2);
	ai.dispose();
});
