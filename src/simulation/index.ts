export { advanceToInput } from './Turns.ts';
export type { ScheduledTurns, TurnRules, TurnResult } from './Turns.ts';
export { runScenario } from './Scenario.ts';
export type { SimulationStatus, SimulationStep, SimulationRule, Scenario, ScenarioResult } from './Scenario.ts';
export { Campaign } from './Campaign.ts';
export type { CampaignOutcome, CampaignLevel, CampaignLevelResult, CampaignSnapshot } from './Campaign.ts';
export { runHeadlessScenario } from './Harness.ts';
export type { HeadlessScenario, HeadlessScenarioResult } from './Harness.ts';
export { SimulationRuntime } from './Runtime.ts';
export type { SimulationContext, SimulationOutcome, SimulationRuntimeRule, SimulationSnapshot } from './Runtime.ts';
export { EventPresentation } from './EventPresentation.ts';
export type { EventPresentationOptions } from './EventPresentation.ts';
export { CampaignSave } from './CampaignSave.ts';
export type { CampaignSaveState, CampaignSaveParts } from './CampaignSave.ts';

/**
 * Re-exported from `roguelike` (its own home - it also drives FOV/pathfinding turn order
 * with nothing to do with simulation state or events): `SimulationRuntime` already needs one
 * on every construction, so a game building a simulation-first game need not import a second
 * module just to get the class its own runtime is built around.
 */
export { Scheduler } from '../roguelike/Scheduler.ts';
export type { Actor, SchedulerSnapshot } from '../roguelike/Scheduler.ts';
