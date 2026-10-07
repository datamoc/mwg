export { ColorTransformBatcher, packColorAdd, packTintAdd, NO_COLOR_ADD } from './ColorTransformBatcher.ts';
export type { HasColorAdd } from './ColorTransformBatcher.ts';

export { TintedSprite, registerColorTransform } from './TintedSprite.ts';
export {
	applyAllImageModifiers,
	applyImageModifiers,
	applyTextureModifiers,
	blendMatrix,
	blendPixels,
	channelScaleMatrix,
	channelSwapMatrix,
	colorShiftMatrix,
	croppedTexture,
	imageModifier,
	maskPixels,
	parseColorPairs,
	parseImagePath,
	parsePaletteLists,
	parseRotateMode,
	rotatePixels,
	spriteColorMatrix,
} from './ImageModifiers.ts';
export type {
	ChannelSource,
	ImageModifier,
	ImageTextureProbe,
	ParsedImagePath,
	RotateMode,
	RotatedPixels,
} from './ImageModifiers.ts';
export { AnimatedSprite, Animation } from './AnimatedSprite.ts';
export type { AnimationFrame, AnimationFrameInput, AnimationOptions } from './AnimatedSprite.ts';
export { SpriteGroup, isOnScreen } from './SpriteGroup.ts';
export type { SpriteGroupMember } from './SpriteGroup.ts';
export { SpriteSheet } from './SpriteSheet.ts';
export { Camera, createCamera, snapZoom } from './Camera.ts';
export type { CameraOptions } from './Camera.ts';
export { Viewport, splitScreenHalves } from './Viewport.ts';
export type { ViewportOptions } from './Viewport.ts';
export { createColorBlindnessFilter, COLOR_BLINDNESS_MATRICES } from './ColorBlindness.ts';
export type { ColorBlindnessType } from './ColorBlindness.ts';

export { Minimap, newlyRevealed, minimapCellCenter } from './Minimap.ts';
export type { MinimapMarker, MinimapOptions } from './Minimap.ts';
export { TileMap, EMPTY, tileFrame, tileFrameSheet, tileFrameIndex } from './TileMap.ts';
export type { TileMapOptions, AutotileSet, AutotileCell, AutotileFormat, ShadowLayerOptions } from './TileMap.ts';
export { LayeredSprite } from './LayeredSprite.ts';
export { Projectile } from './Projectile.ts';
export type { ProjectilePoint, ProjectileOptions } from './Projectile.ts';
export { Flights } from './Flights.ts';
export type { FlightSprite, FlightOptions, FlightHandle } from './Flights.ts';
export { Beam, Beams } from './Beam.ts';
export type { BeamPoint, BeamOptions, BeamTextureOptions } from './Beam.ts';
export { LightningArc } from './LightningArc.ts';
export type { LightningArcOptions, LightningArcPoint } from './LightningArc.ts';
export { SpriteAttachment } from './SpriteAttachment.ts';
export type { AttachmentPoint, SpriteAttachmentOptions } from './SpriteAttachment.ts';
export { LiquidLayer } from './LiquidLayer.ts';
export type { LiquidLayerOptions } from './LiquidLayer.ts';
export { FogLayer, paintFogPixels } from './FogLayer.ts';
export type { FogCell, FogColor, FogLayerOptions } from './FogLayer.ts';
export { Halo, HALO_ANIMATION } from './Halo.ts';
export type { HaloOptions } from './Halo.ts';

export { ParticleEmitter } from './Particles.ts';
export type {
	Particle,
	ParticleRange,
	ParticleCurve,
	ParticleSpawnArea,
	ParticleEmitterOptions,
	FollowTarget,
	FollowOptions,
} from './Particles.ts';

export { ScreenEffects } from './ScreenEffects.ts';
export type { ScreenEffectPhase, ScreenEffectStep, ScreenEffectsOptions } from './ScreenEffects.ts';

export { ActorAnimator } from './ActorAnimator.ts';
export type { ActorAnimationState, ActorAnimatorOptions } from './ActorAnimator.ts';

export { StatusVisuals } from './StatusVisuals.ts';
export type { TintTarget, StatusVisualStyle, StatusVisualsOptions } from './StatusVisuals.ts';

export { blobIndex, autotileFrames, BLOB_SHAPES } from './Autotile.ts';
export type { NeighborMask } from './Autotile.ts';
export {
	RpgmAutotileAtlas,
	rpgmAutotileFrame,
	rpgmAutotileSlot,
	xpAutotileRef,
	xpAutotilePattern,
	assertAutotileLayout,
	autotileCellParts,
	rpgmTableEdgeCells,
	RPGM_AUTOTILE_SLOT_BASES,
	RPGM_AUTOTILE_SLOT_COUNTS,
	RPGM_FLOOR_AUTOTILE_TABLE,
	RPGM_WALL_AUTOTILE_TABLE,
	XP_AUTOTILE_PATTERNS,
	XP_NEIGHBORS_TO_PATTERN,
} from './RpgmAutotile.ts';
export type {
	RpgmAutotileFrame,
	RpgmAutotileQuadrant,
	RpgmAutotileShape,
	RpgmAutotileShapeTable,
	RpgmAutotileSlot,
	XpAutotilePattern,
	XpAutotileRef,
	AutotileCellPart,
	AutotileLayout,
	RpgmTableEdgeMap,
} from './RpgmAutotile.ts';

export { hexRotate, matchTerrainRule, resolveTerrainGraphics, squareRotate } from './TerrainGraphics.ts';
export type {
	ResolveTerrainGraphicsOptions,
	TerrainCondition,
	TerrainFlagsAt,
	TerrainImage,
	TerrainPlacement,
	TerrainRotate,
	TerrainRule,
} from './TerrainGraphics.ts';

export { TerrainGraphicsLayer } from './TerrainGraphicsLayer.ts';
export type { TerrainGraphicsLayerOptions } from './TerrainGraphicsLayer.ts';

export { inspectGraphicsCapabilities, detectWebGpu, RENDERING_DECISIONS } from './Capabilities.ts';
export type {
	GraphicsCapabilities,
	GraphicsProbe,
	GraphicsWorkload,
	RenderingDecision,
	WebGpuDetection,
} from './Capabilities.ts';

export { Container2D, Rectangle2D, Texture2D, rectOf } from './Types2D.ts';
export type { Rect, TextureRegion } from './Types2D.ts';
export { Node2D, Shape2D, Text2D, Sprite2D, TiledSprite, Gradient, createLayers } from './Shape2D.ts';

export { paletteRangeMapping, recolorTexture, remapPixels, withTextureCanvas } from './PaletteRemap.ts';
export type {
	PaletteMapping,
	PaletteRange,
	PaletteRemapMode,
	RecolorProbe,
	RemapCanvas,
	RemapCanvasContext,
} from './PaletteRemap.ts';

export { loadTiledMap } from './TiledMap.ts';
export type {
	TiledMapData,
	TiledTilesetData,
	TilesetSheet,
	LoadedTiledMap,
	TiledObject,
	TiledLayer,
} from './TiledMap.ts';
