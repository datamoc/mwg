import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Container, Texture, TextureSource } from 'pixi.js';
import { FogLayer, paintFogPixels } from '../src/two-d/render/FogLayer.ts';
import { LiquidLayer } from '../src/two-d/render/LiquidLayer.ts';
import { MessageLog, linesToDrop } from '../src/two-d/ui/MessageLog.ts';
import { fitWindowZoom, sharpenText } from '../src/two-d/ui/TextSharpness.ts';
import { Label } from '../src/two-d/ui/Label.ts';

// ------------------------------------------------------------------ MessageLog

test('linesToDrop removes the oldest entries by wrapped line count and keeps the newest', () => {
	assert.equal(linesToDrop([1, 1, 1], 3), 0);
	assert.equal(linesToDrop([1, 1, 1, 1], 3), 1);
	assert.equal(linesToDrop([1, 2, 2], 3), 2);
	assert.equal(linesToDrop([1, 1, 5], 3), 2, 'the newest stays even when it alone is over budget');
	assert.equal(linesToDrop([], 3), 0);
});

test('a MessageLog starts empty, colours by level and can be cleared', () => {
	const log = new MessageLog({ wrapWidth: 100, colors: { positive: 0x00ff00 } });
	assert.equal(log.entryCount, 0);
	log.clear();
	assert.equal(log.entryCount, 0);
});

// --------------------------------------------------------------- TextSharpness

test('fitWindowZoom steps the zoom down until the content fits, never below 1', () => {
	assert.equal(fitWindowZoom(3, 200, 700), 3);
	assert.equal(fitWindowZoom(3, 300, 700), 2);
	assert.equal(fitWindowZoom(3, 900, 700), 1);
	assert.equal(fitWindowZoom(0, 10, 700), 1);
});

test('sharpenText sets text resolution to the device ratio times the whole on-screen scale', () => {
	const root = new Container();
	root.scale.set(3);
	const inner = new Container();
	inner.scale.set(1.5);
	const outer = new Label('plain');
	const nested = new Label('nested');
	root.addChild(outer, inner);
	inner.addChild(nested);
	sharpenText(root, 2);
	assert.equal(outer.resolution, 6);
	assert.equal(nested.resolution, 2 * Math.round(4.5));
});

test('sharpenText counts the scale of ancestors above the root it is given', () => {
	const stage = new Container();
	stage.scale.set(2);
	const root = new Container();
	stage.addChild(root);
	const label = new Label('x');
	root.addChild(label);
	sharpenText(root, 1);
	assert.equal(label.resolution, 2);
});

// ------------------------------------------------------------------ LiquidLayer

const blank = (): Texture => new Texture({ source: new TextureSource({ width: 16, height: 16 }) });

test('LiquidLayer builds a hidden quad per liquid cell and a tint lights it', () => {
	const layer = new LiquidLayer({ texture: blank(), width: 3, height: 2, isLiquid: (x, y) => x === y });
	assert.equal(layer.children.length, 2);
	assert.equal(
		layer.children.every((child) => !child.visible && child.eventMode === 'none'),
		true,
	);
	layer.setCellColor(1, 1, 0xffffff);
	assert.equal(layer.children[1].visible, true);
	layer.setCellColor(1, 1, 0);
	assert.equal(layer.children[1].visible, false);
	layer.setCellColor(2, 0, 0xffffff); //not liquid: ignored
});

test('ripples grow, fade and are removed after their duration; hidden cells make none', () => {
	const layer = new LiquidLayer({
		texture: blank(),
		rippleTexture: blank(),
		width: 2,
		height: 1,
		isLiquid: () => true,
		rippleDuration: 1,
	});
	layer.ripple(0, 0);
	assert.equal(layer.rippleCount, 0, 'an unlit cell shows no ripple');
	layer.setCellColor(0, 0, 0xffffff);
	layer.ripple(0, 0);
	layer.update(0.5);
	const ring = layer.children[layer.children.length - 1];
	assert.equal(layer.rippleCount, 1);
	assert.equal(ring.alpha, 0.5);
	assert.equal(ring.scale.x, 0.5);
	layer.update(0.6);
	assert.equal(layer.rippleCount, 0);
});

test('the surface scrolls only where cells are visible', () => {
	const layer = new LiquidLayer({ texture: blank(), width: 1, height: 2, isLiquid: () => true, speed: 10 });
	layer.setCellColor(0, 1, 0xffffff);
	layer.update(1);
	const [hidden, lit] = layer.children as unknown as { tilePosition: { y: number }; y: number }[];
	assert.equal(lit.tilePosition.y, -lit.y + 10);
	assert.notEqual(hidden.tilePosition.y, -hidden.y + 10);
});

// -------------------------------------------------------------------- FogLayer

test('paintFogPixels paints whole-cell states and sub-cell shading into RGBA', () => {
	const palette = [
		[0, 0, 0, 0],
		[10, 20, 30, 40],
	] as const;
	const pixels = new Uint8ClampedArray(2 * 2 * 4 * 2 * 2);
	//two cells, two pixels per tile along each axis
	paintFogPixels(pixels, 2, 1, 2, (x) => (x === 0 ? 1 : [0, 1, 0, 1]), palette);
	const at = (px: number, py: number): number[] =>
		Array.from(pixels.subarray((py * 4 + px) * 4, (py * 4 + px) * 4 + 4));
	assert.deepEqual(at(0, 0), [10, 20, 30, 40]);
	assert.deepEqual(at(1, 1), [10, 20, 30, 40]);
	assert.deepEqual(at(2, 0), [0, 0, 0, 0]);
	assert.deepEqual(at(3, 0), [10, 20, 30, 40]);
	assert.deepEqual(at(3, 1), [10, 20, 30, 40]);
});

test('a state without a palette entry paints transparent', () => {
	const pixels = new Uint8ClampedArray([9, 9, 9, 9]);
	paintFogPixels(pixels, 1, 1, 1, () => 5, [[1, 1, 1, 1]]);
	assert.deepEqual(Array.from(pixels), [0, 0, 0, 0]);
});

test('FogLayer needs a DOM canvas and says so', () => {
	if (typeof document !== 'undefined') return;
	assert.throws(() => new FogLayer({ width: 2, height: 2, palette: [] }), /document/);
});
