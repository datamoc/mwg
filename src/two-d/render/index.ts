export { ColorTransformBatcher, packColorAdd, packTintAdd, NO_COLOR_ADD } from './ColorTransformBatcher.ts';
export type { HasColorAdd } from './ColorTransformBatcher.ts';

export { TintedSprite, registerColorTransform } from './TintedSprite.ts';
export {
	applyImageModifiers,
	applyTextureModifiers,
	blendMatrix,
	channelScaleMatrix,
	channelSwapMatrix,
	colorShiftMatrix,
	croppedTexture,
	imageModifier,
	maskPixels,
	parseImagePath,
} from './ImageModifiers.ts';
export type { ChannelSource, ImageModifier, ImageTextureProbe, ParsedImagePath } from './ImageModifiers.ts';
export { AnimatedSprite, Animation } from './AnimatedSprite.ts';
export type { AnimationFrame, AnimationFrameInput, AnimationOptions } from './AnimatedSprite.ts';
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
export type { TileMapOptions } from './TileMap.ts';
export { LayeredSprite } from './LayeredSprite.ts';
export { Projectile } from './Projectile.ts';
export type { ProjectilePoint, ProjectileOptions } from './Projectile.ts';
export { LightningArc } from './LightningArc.ts';
export type { LightningArcOptions, LightningArcPoint } from './LightningArc.ts';
export { SpriteAttachment } from './SpriteAttachment.ts';
export type { AttachmentPoint, SpriteAttachmentOptions } from './SpriteAttachment.ts';
export { Halo, HALO_ANIMATION } from './Halo.ts';
export type { HaloOptions } from './Halo.ts';

export { ParticleEmitter } from './Particles.ts';
export type { Particle, ParticleRange, ParticleEmitterOptions } from './Particles.ts';

export { ScreenEffects } from './ScreenEffects.ts';
export type { ScreenEffectPhase, ScreenEffectsOptions } from './ScreenEffects.ts';

export { ActorAnimator } from './ActorAnimator.ts';
export type { ActorAnimationState, ActorAnimatorOptions } from './ActorAnimator.ts';

export { StatusVisuals } from './StatusVisuals.ts';
export type { TintTarget, StatusVisualStyle, StatusVisualsOptions } from './StatusVisuals.ts';

export { blobIndex, autotileFrames, BLOB_SHAPES } from './Autotile.ts';
export type { NeighborMask } from './Autotile.ts';

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
export { Node2D, Shape2D, Text2D, Sprite2D, TiledSprite, Gradient } from './Shape2D.ts';

export { paletteRangeMapping, recolorTexture, remapPixels } from './PaletteRemap.ts';
export type { PaletteMapping, PaletteRange, RecolorProbe, RemapCanvas, RemapCanvasContext } from './PaletteRemap.ts';

export { loadTiledMap } from './TiledMap.ts';
export type {
	TiledMapData,
	TiledTilesetData,
	TilesetSheet,
	LoadedTiledMap,
	TiledObject,
	TiledLayer,
} from './TiledMap.ts';
