export { MwlSyntaxError, isGettext, parse, parseValue, preprocess } from './grammar.ts';
export type { MwlDiagnostic, MwlLocation, MwlNode, MwlPreprocessOptions } from './grammar.ts';
export { parseMapFile } from './MapFile.ts';
export type { MwlMapFile } from './MapFile.ts';
export {
	attributeTypeDescription,
	coerceTableValue,
	isMwlId,
	MWL_SCHEMA_01,
	MWL_SCHEMA_10,
	parseTableColumns,
	schema01,
	schema10,
	validAttributeValue,
	validate,
} from './schema.ts';
export type { MwlAttributeType, MwlTableColumn, MwlTagSchema, MwlValueType } from './schema.ts';
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
	validateHookAttributes,
	validateHookReferences,
} from './hooks.ts';
export type {
	AiHook,
	CommandHook,
	Emit,
	GeneratorHook,
	HookContext,
	HookRandom,
	HookReference,
	HookType,
	HookTypeMap,
	HookWorld,
	BuiltinHookType,
	MwlDomainHook,
	MwlDomainHookDeclaration,
	MwlDomainHookRegistry,
	MwlSaveableHookState,
	MwlHookDeclaration,
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
	MwlRuntimeAction,
	MwlTraceEvent,
	MwlValue,
	MwlWorld,
} from './runtime.ts';
export { carryoverIntoScenario, endLevelCarryover, MWL_DEFAULT_CARRYOVER_PERCENTAGE } from './carryover.ts';
export type { MwlCarryover, MwlEndLevel, MwlSideRef } from './carryover.ts';
export { campaignChain } from './campaign.ts';
export type { MwlCampaignChain, MwlScenarioRunner } from './campaign.ts';
export { contentCatalog } from './content.ts';
export { nodesToObjects } from './objects.ts';
export type { MwlObject } from './objects.ts';
export { emitTableTypes, typedRows } from './tables.ts';
export type { EmitTableTypesOptions, MwlColumnValueType, MwlTypedRow } from './tables.ts';
export type { MwlCampaignDefinition, MwlScenarioLink } from './content.ts';
export type {
	MwlContentCatalog,
	MwlEffectDefinition,
	MwlAiDefinition,
	MwlBehaviorDefinition,
	MwlEvolutionDefinition,
	MwlItemDefinition,
	MwlLootDefinition,
	MwlMonsterDefinition,
	MwlMoveDefinition,
	MwlStatusDefinition,
	MwlTableDefinition,
	MwlTurnClockDefinition,
	MwlTypeMatchupDefinition,
} from './content.ts';
export { evaluateExpression, parseExpression } from './expression.ts';
export type { MwlExpression, MwlExpressionContext } from './expression.ts';
export { composeEffects, effectToModifier, inventoryItem, itemDefinition } from './actors.ts';
export type { MwlActorItem, MwlEquipment } from './actors.ts';
export { validateCatalog, validateCatalogNodes } from './catalog.ts';
export type { MwlTableReference, MwlValidationOptions } from './catalog.ts';
export { decodeSave, decodeSaveEnvelope, encodeSave, validateWorld } from './persistence.ts';
export type { MwlMigration, MwlPersistenceOptions, MwlSaveEnvelope } from './persistence.ts';
export { contentReport, loadContent } from './report.ts';
export type { MwlContentDiagnostic, MwlContentLoadReport, MwlContentReport } from './report.ts';
export { readAttributes, readChildren, readTableIndex, readTableMap, tableKey } from './readers.ts';
export type {
	MwlFieldSpec,
	MwlReadResult,
	MwlReaderType,
	MwlTableKey,
	MwlTableKeyPart,
	MwlTableMapOptions,
} from './readers.ts';
export { createExpressionScriptHost } from './scripts.ts';
export type { ScriptContext, ScriptEmit, ScriptHost, ScriptValue } from './scripts.ts';
export { evaluateCondition } from './conditions.ts';
export type { MwlConditionContext, MwlConditionHelper, MwlConditionOptions, MwlConditionValue } from './conditions.ts';
export { checkConditionSyntax } from './conditions.ts';
export {
	checkPackagePath,
	decodePackage,
	DEFAULT_PACKAGE_LIMITS,
	encodePackage,
	PackageError,
	PackageFormatError,
	PackageIntegrityError,
	PackageLimitError,
	PackagePathError,
	sha256Hex,
} from './package-container.ts';
export type { DecodedPackage, PackageDirectoryEntry, PackageFile, PackageLimits } from './package-container.ts';
export {
	compareVersions,
	KNOWN_PACKAGE_CAPABILITIES,
	PACKAGE_ASSET_KINDS,
	PACKAGE_MEDIA_KINDS,
	PACKAGE_SCRIPT_ACTIONS,
	PACKAGE_TAGS,
	parsePackageDocument,
	satisfiesVersionRange,
} from './package-document.ts';
export type {
	PackageAction,
	PackageAnimation,
	PackageAsset,
	PackageAssetKind,
	PackageCharacter,
	PackageDocument,
	PackageImport,
	PackageMeta,
	PackageMusic,
	PackageRequires,
	PackageScript,
	PackageSoundEffect,
	PackageValue,
} from './package-document.ts';
export {
	checkPackagePolicy,
	compilePackages,
	generateCredits,
	loadPackage,
	mergePackage,
	packageContent,
	PackageConflictError,
	packageRef,
	parsePackageRef,
	requestedCapabilities,
} from './package.ts';
export type { LoadedPackage, PackageContent, PackagePolicy, PackageSet } from './package.ts';
export { detectRomImage, registerRomDigest } from './package-rom.ts';
export type { RomDetection } from './package-rom.ts';
export { verifyPackage } from './package-verify.ts';
export type { PackageReport, VerifyPackageOptions } from './package-verify.ts';
