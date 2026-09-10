export { advanceToInput } from './Turns.ts';
export type { ScheduledTurns, TurnRules, TurnResult } from './Turns.ts';
export { runScenario } from './Scenario.ts';
export type { SimulationStatus, SimulationStep, SimulationRule, Scenario, ScenarioResult } from './Scenario.ts';
export { SimulationRuntime } from './Runtime.ts';
export type { SimulationContext, SimulationOutcome, SimulationRuntimeRule, SimulationSnapshot } from './Runtime.ts';

/**
 * Re-exported from `roguelike` (its own home - it also drives FOV/pathfinding turn order
 * with nothing to do with simulation state or events): `SimulationRuntime` already needs one
 * on every construction, so a game building a simulation-first game need not import a second
 * module just to get the class its own runtime is built around.
 */
export { Scheduler } from '../roguelike/Scheduler.ts';
export type { Actor, SchedulerSnapshot } from '../roguelike/Scheduler.ts';
