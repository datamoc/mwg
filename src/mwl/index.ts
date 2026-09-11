export { MwlSyntaxError, isGettext, parse, parseValue, preprocess } from './grammar.ts';
export type { MwlDiagnostic, MwlLocation, MwlNode, MwlPreprocessOptions } from './grammar.ts';
export { parseMapFile } from './MapFile.ts';
export type { MwlMapFile } from './MapFile.ts';
export { coerceTableValue, parseTableColumns, schema01, validate } from './schema.ts';
export type { MwlTableColumn, MwlTagSchema, MwlValueType } from './schema.ts';
export {
	compile,
	compileAndEmitSources,
	compileNodes,
	compileSources,
	emitArtifacts,
	emitModule,
	extractCatalog,
} from './compiler.ts';
export type {
	MwlArtifact,
	MwlCatalog,
	MwlCatalogOptions,
	MwlCompileOptions,
	MwlCompiledGame,
	MwlCompiledNode,
	MwlEmitOptions,
	MwlSourceFile,
} from './compiler.ts';
export {
	collectHookReferences,
	emitHooksDeclaration,
	hookTypes,
	parseHookReference,
	validateHookReferences,
} from './hooks.ts';
export type {
	AiHook,
	CommandHook,
	Emit,
	GeneratorHook,
	HookContext,
	HookReference,
	HookType,
	HookTypeMap,
	HookWorld,
	MigrationHook,
	ModifierHook,
	PredicateHook,
} from './hooks.ts';
export { createWorld, execute, MwlRuntime, parseTerrain, sideVisionGroups } from './runtime.ts';
export type {
	MwlCommand,
	MwlDialogueChoice,
	MwlHookRegistry,
	MwlMap,
	MwlMapStart,
	MwlMessage,
	MwlRuntimeOptions,
	MwlTraceEvent,
	MwlWorld,
} from './runtime.ts';
export { carryoverIntoScenario, endLevelCarryover, MWL_DEFAULT_CARRYOVER_PERCENTAGE } from './carryover.ts';
export type { MwlCarryover, MwlEndLevel, MwlSideRef } from './carryover.ts';
export { campaignChain } from './campaign.ts';
export type { MwlCampaignChain, MwlScenarioRunner } from './campaign.ts';
export { contentCatalog } from './content.ts';
export type { MwlCampaignDefinition, MwlScenarioLink } from './content.ts';
export type {
	MwlContentCatalog,
	MwlEffectDefinition,
	MwlAiDefinition,
	MwlBehaviorDefinition,
	MwlItemDefinition,
	MwlLootDefinition,
	MwlMonsterDefinition,
	MwlStatusDefinition,
	MwlTableDefinition,
	MwlTurnClockDefinition,
} from './content.ts';
export { evaluateExpression, parseExpression } from './expression.ts';
export type { MwlExpression, MwlExpressionContext } from './expression.ts';
export { composeEffects, effectToModifier, inventoryItem, itemDefinition } from './actors.ts';
export type { MwlActorItem, MwlEquipment } from './actors.ts';
export { validateCatalog, validateCatalogNodes } from './catalog.ts';
export type { MwlValidationOptions } from './catalog.ts';
export { decodeSave, encodeSave, validateWorld } from './persistence.ts';
export type { MwlMigration, MwlPersistenceOptions, MwlSaveEnvelope } from './persistence.ts';
export { contentReport, loadContent } from './report.ts';
export type { MwlContentDiagnostic, MwlContentLoadReport, MwlContentReport } from './report.ts';
export { readAttributes, readChildren } from './readers.ts';
export type { MwlFieldSpec, MwlReadResult, MwlReaderType } from './readers.ts';
export { createExpressionScriptHost } from './scripts.ts';
export type { ScriptContext, ScriptEmit, ScriptHost, ScriptValue } from './scripts.ts';
export { evaluateCondition } from './conditions.ts';
export type { MwlConditionContext, MwlConditionHelper, MwlConditionOptions, MwlConditionValue } from './conditions.ts';
