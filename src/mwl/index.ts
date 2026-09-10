export { MwlSyntaxError, isGettext, parse, parseValue, preprocess } from './grammar.ts';
export type { MwlDiagnostic, MwlLocation, MwlNode, MwlPreprocessOptions } from './grammar.ts';
export { schema01, validate } from './schema.ts';
export type { MwlTagSchema, MwlValueType } from './schema.ts';
export { compile, compileNodes, compileSources, emitModule, extractCatalog } from './compiler.ts';
export type { MwlCatalog, MwlCatalogOptions, MwlCompileOptions, MwlCompiledGame, MwlCompiledNode, MwlSourceFile } from './compiler.ts';
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
export { createWorld, execute, MwlRuntime, parseTerrain } from './runtime.ts';
export type { MwlCommand, MwlHookRegistry, MwlMap, MwlMapStart, MwlMessage, MwlRuntimeOptions, MwlWorld } from './runtime.ts';
export { contentCatalog } from './content.ts';
export type {
	MwlContentCatalog,
	MwlEffectDefinition,
	MwlAiDefinition,
	MwlBehaviorDefinition,
	MwlItemDefinition,
	MwlLootDefinition,
	MwlMonsterDefinition,
	MwlStatusDefinition,
	MwlTurnClockDefinition,
} from './content.ts';
export { evaluateExpression, parseExpression } from './expression.ts';
export type { MwlExpression, MwlExpressionContext } from './expression.ts';
export { effectToModifier, inventoryItem, itemDefinition } from './actors.ts';
export type { MwlActorItem, MwlEquipment } from './actors.ts';
export { validateCatalog, validateCatalogNodes } from './catalog.ts';
export type { MwlValidationOptions } from './catalog.ts';
export { decodeSave, encodeSave, validateWorld } from './persistence.ts';
export type { MwlMigration, MwlPersistenceOptions, MwlSaveEnvelope } from './persistence.ts';
