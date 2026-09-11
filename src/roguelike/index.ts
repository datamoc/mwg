export { Level, WALL, FLOOR, rectCenter, rectsOverlap } from './Level.ts';
export type { TerrainKind, Rect, LevelShape } from './Level.ts';

export { generateDungeon, generateDungeonGraph, findFreeCell, furthestRoom, DUNGEON_KINDS } from './generate.ts';
export type { DungeonOptions, DungeonGenerationHooks, RoomEdge, DungeonResult } from './generate.ts';

export { hallBuilder, eligibleBuilders, pickBuilder } from './RoomBuilders.ts';
export type { RoomBuilder } from './RoomBuilders.ts';

export { FeatureLayer } from './Features.ts';
export type { CellFeatureDef } from './Features.ts';

export { rollRoster } from './ContentRoll.ts';
export type { RosterEntry, RareEntry, RollOutcome, RollTraceEntry, ContentRollResult } from './ContentRoll.ts';

export { compareDungeonArtifacts, checkDeterminism } from './DungeonParity.ts';
export type { DungeonArtifacts, DungeonParityStage, DungeonMismatch } from './DungeonParity.ts';

export { FieldOfView } from './FieldOfView.ts';
export type { HeightSight } from './FieldOfView.ts';

export { Elevation } from './Elevation.ts';

export { Pathfinder, neighbourOffsets } from './Pathfinder.ts';
export type { Step, PathOptions } from './Pathfinder.ts';

export { Scheduler } from './Scheduler.ts';
export type { Actor, SchedulerSnapshot } from './Scheduler.ts';

export { decideMonsterAI } from './MonsterAI.ts';
export type { AIState, AIDecision, MonsterAIOptions, Disposition } from './MonsterAI.ts';

export { Secrets } from './Secrets.ts';

export { Doors } from './Doors.ts';

export {
	chebyshevDistance,
	traceLine,
	hasLineOfSight,
	canTarget,
	resolveArea,
	resolveAreaOnLevel,
	hexConeCells,
} from './Targeting.ts';
export type { AreaShape, TargetingOptions } from './Targeting.ts';
export { coneCells, chainTargets, knockbackPath, rangeMultiplier, areaFalloffMultiplier } from './Targeting.ts';
export type { RangeBand } from './Targeting.ts';

export { BossPhases, AbilityCycle } from './Boss.ts';

export { CombatHooks } from './Combat.ts';
export type { CombatEvent, CombatHook, DamageContext } from './Combat.ts';

export { Stealth } from './Stealth.ts';
export type { StealthOptions } from './Stealth.ts';

export { TriggerTracker } from './TriggerTracker.ts';

export { MultiStageAbility } from './MultiStageAbility.ts';
export type { AbilityStage } from './MultiStageAbility.ts';

export { MultiTurnBeam } from './MultiTurnBeam.ts';
export type { BeamDamageContext, BeamStep, MultiTurnBeamOptions, MultiTurnBeamSave } from './MultiTurnBeam.ts';

export { candidateCells, cellsNear, selectDistinctCells } from './Placement.ts';
export type { PlacementFilter, PlacementResult, PlacementTraceEntry } from './Placement.ts';
