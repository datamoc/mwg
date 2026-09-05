export {
	ColorTransformBatcher,
	packColorAdd,
	packTintAdd,
	NO_COLOR_ADD,
} from './ColorTransformBatcher.ts';
export type { HasColorAdd } from './ColorTransformBatcher.ts';

export { TintedSprite, registerColorTransform } from './TintedSprite.ts';
export { AnimatedSprite, Animation } from './AnimatedSprite.ts';
export type { AnimationOptions } from './AnimatedSprite.ts';
export { SpriteSheet } from './SpriteSheet.ts';
export { Camera, createCamera, snapZoom } from './Camera.ts';
export type { CameraOptions } from './Camera.ts';
export { Viewport, splitScreenHalves } from './Viewport.ts';
export type { ViewportOptions } from './Viewport.ts';
export { createColorBlindnessFilter, COLOR_BLINDNESS_MATRICES } from './ColorBlindness.ts';
export type { ColorBlindnessType } from './ColorBlindness.ts';

export { Minimap, newlyRevealed } from './Minimap.ts';
export type { MinimapOptions } from './Minimap.ts';
export { TileMap, EMPTY, tileFrame, tileFrameSheet, tileFrameIndex } from './TileMap.ts';
export type { TileMapOptions } from './TileMap.ts';
export { LayeredSprite } from './LayeredSprite.ts';
export { Projectile } from './Projectile.ts';
export type { ProjectilePoint, ProjectileOptions } from './Projectile.ts';

export { ActorAnimator } from './ActorAnimator.ts';
export type { ActorAnimationState, ActorAnimatorOptions } from './ActorAnimator.ts';

export { StatusVisuals } from './StatusVisuals.ts';
export type { TintTarget, StatusVisualStyle, StatusVisualsOptions } from './StatusVisuals.ts';

export { blobIndex, autotileFrames, BLOB_SHAPES } from './Autotile.ts';
export type { NeighborMask } from './Autotile.ts';

export { inspectGraphicsCapabilities, detectWebGpu, RENDERING_DECISIONS } from './Capabilities.ts';
export type { GraphicsCapabilities, GraphicsProbe, GraphicsWorkload, RenderingDecision, WebGpuDetection } from './Capabilities.ts';
