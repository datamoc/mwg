import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';

import { Beam, Beams } from '../src/two-d/render/Beam.ts';

/**
 * P35: the one-shot beam between two points. `Graphics`, `TilingSprite` and
 * `Texture` all construct headless, so the fade/removal timing, the strip
 * geometry and the group bookkeeping are tested here without a renderer.
 */

function near(actual: number, expected: number, label?: string): void {
	assert.ok(Math.abs(actual - expected) < 1e-9, `${label ? `${label}: ` : ''}expected ~${expected}, saw ${actual}`);
}

test('a plain beam fades across its duration and expires exactly once', () => {
	const zap = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, { colour: 0x88ccff, duration: 0.2 });
	assert.equal(zap.done, false);
	assert.equal(zap.alpha, 1);

	assert.equal(zap.update(0.1), false);
	near(zap.alpha, 0.5);
	near(zap.progress, 0.5);

	assert.equal(zap.update(0.1), true, 'the instant it outlives its duration');
	assert.equal(zap.done, true);
	assert.equal(zap.update(1), false, 'expiry reports once');
	zap.destroy();
});

test('the default duration is a sub-second flash and zero resolves at once', () => {
	const flash = new Beam({ x: 0, y: 0 }, { x: 10, y: 0 });
	assert.equal(flash.update(0.1), false, 'the 0.2 s default is still fading at half');
	assert.equal(flash.update(0.1), true);
	flash.destroy();

	const instant = new Beam({ x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 0 });
	assert.equal(instant.update(1 / 60), true, 'a zero duration still resolves in one update');
	instant.destroy();
});

test('a zero-length beam has no direction and still expires', () => {
	const point = new Beam({ x: 7, y: 7 }, { x: 7, y: 7 }, { duration: 0.1 });
	assert.equal(point.rotation, 0);
	assert.equal(point.update(0.1), true);
	point.destroy();
});

test('retarget moves the far end while the near end stays put', () => {
	const tether = new Beam({ x: 10, y: 20 }, { x: 110, y: 20 }, { duration: 10 });
	assert.equal(tether.position.x, 10);
	assert.equal(tether.position.y, 20);
	near(tether.rotation, 0);

	tether.retarget(undefined, { x: 10, y: 120 });
	near(tether.rotation, Math.PI / 2);
	assert.equal(tether.position.x, 10, 'the near end never moves on retarget');
	tether.retarget({ x: 0, y: 0 });
	assert.equal(tether.position.x, 0);
	tether.destroy();
});

test('additive blend is the default and opts out cleanly', () => {
	const additive = new Beam({ x: 0, y: 0 }, { x: 10, y: 0 });
	assert.equal(additive.children[0].blendMode, 'add');
	additive.destroy();

	const solid = new Beam({ x: 0, y: 0 }, { x: 10, y: 0 }, { additive: false });
	assert.notEqual(solid.children[0].blendMode, 'add');
	solid.destroy();
});

test('a textured beam stretches the strip to the distance and tracks retarget', () => {
	const strip = new Beam({ x: 0, y: 0 }, { x: 60, y: 0 }, { texture: new Texture(), width: 6 });
	const body = strip.children[0] as TilingSprite;
	assert.equal(body.width, 60, 'the strip repeats to the full distance');
	assert.equal(body.height, 6, 'the width option is the strip height');

	strip.retarget(undefined, { x: 30, y: 0 });
	assert.equal(body.width, 30);
	strip.update(0.05);
	near(strip.alpha, 0.75, 'the strip fades like the plain line');
	strip.destroy();
});

test('a thin beam narrows with its remaining life, plain and textured alike', () => {
	const line = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, { width: 4, duration: 0.2, thin: true });
	const strip = new Beam(
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ texture: new Texture(), width: 8, duration: 0.2, thin: true },
	);

	line.update(0.1);
	//Graphics keeps no queryable stroke width, so the thinning is visible through
	//the tiling strip below; here the expiry and the fade still behave the same
	assert.equal(line.done, false);

	const stripBody = strip.children[0] as TilingSprite;
	assert.equal(stripBody.height, 8, 'full thickness at launch');
	strip.update(0.1);
	assert.equal(stripBody.height, 4, 'half the life, half the thickness');
	strip.update(0.1);
	assert.equal(stripBody.height, 0, 'the strip is gone at end of life');
	assert.equal(strip.done, true);
	line.destroy();
	strip.destroy();
});

test('a beam without thin keeps its full thickness for the whole fade', () => {
	const strip = new Beam({ x: 0, y: 0 }, { x: 100, y: 0 }, { texture: new Texture(), width: 8, duration: 0.2 });
	const body = strip.children[0] as TilingSprite;
	strip.update(0.1);
	assert.equal(body.height, 8, 'half faded, still the full 8px strip');
	strip.update(0.1);
	assert.equal(body.height, 8, 'gone, but never narrowed on the way');
	strip.destroy();
});

test('the texture object form stretches once along the span and anchors', () => {
	//pixi's `Texture.width` is a getter over the frame, so a headless test sizes
	//the art through the frame the way a real atlas region would
	const ray = new Texture({ frame: new Rectangle(0, 0, 16, 8) });
	const beam = new Beam({ x: 0, y: 0 }, { x: 64, y: 0 }, { texture: { source: ray, stretch: true }, width: 8 });
	const body = beam.children[0] as Sprite;
	assert.ok(body instanceof Sprite, 'the stretched form is a Sprite, not a TilingSprite');
	near(body.scale.x, 4, 'the 16px art is stretched across the 64px span, not tiled');
	near(body.scale.y, 1, '8px art at 8px thickness is 1:1');
	assert.equal(body.anchor.y, 0.5, 'the strip is centred on the line by default');

	beam.retarget(undefined, { x: 32, y: 0 });
	near(body.scale.x, 2, 'retarget re-stretches');

	beam.update(0.05);
	near(body.scale.y, 1, 'without thin, the thickness never narrows');
	beam.destroy();
});

test('the texture object form anchors the tiled strip too, and 0 matches the bare form', () => {
	const source = new Texture();
	const hung = new Beam({ x: 0, y: 0 }, { x: 40, y: 0 }, { texture: { source, anchor: 1 } });
	const hungBody = hung.children[0] as TilingSprite;
	assert.equal(hungBody.anchor.y, 1, 'the strip hangs below the line');

	const bare = new Beam({ x: 0, y: 0 }, { x: 40, y: 0 }, { texture: source });
	const bareBody = bare.children[0] as TilingSprite;
	assert.equal(bareBody.anchor.y, 0, 'the bare-texture form keeps its old top-edge placement');
	hung.destroy();
	bare.destroy();
});

test('a Beams group fades its beams and forgets the finished ones', () => {
	const beams = new Beams();
	const ray = beams.add({ x: 0, y: 0 }, { x: 100, y: 0 }, { duration: 0.2 });
	assert.equal(beams.count, 1);
	assert.equal(ray.parent, beams, 'group beams are parented here');

	beams.update(0.1);
	assert.equal(beams.count, 1, 'still fading at half duration');
	beams.update(0.1);
	assert.equal(beams.count, 0);
	assert.equal(ray.destroyed, true, 'a finished beam is destroyed with its removal');
	assert.equal(beams.children.length, 0);
	beams.destroy();
});

test('clear drops every beam at once, and destroy clears first', () => {
	const beams = new Beams();
	beams.add({ x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 10 });
	beams.add({ x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 10 });
	beams.clear();
	assert.equal(beams.count, 0);
	assert.equal(beams.children.length, 0);

	beams.add({ x: 0, y: 0 }, { x: 10, y: 0 }, { duration: 10 });
	beams.destroy();
	assert.equal(beams.count, 0, 'no beam outlives its group');
	assert.equal(beams.destroyed, true);
});
