import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Texture, TextureSource } from 'pixi.js';

import {
	ColorTransformBatcher,
	NO_COLOR_ADD,
	TINTED_SPRITE_PIPE,
	packColorAdd,
	packTintAdd,
	registerColorTransform,
} from '../src/two-d/render/ColorTransformBatcher.ts';
import { TintedSprite } from '../src/two-d/render/TintedSprite.ts';

/**
 * What this file does and does not cover.
 *
 * Covered: everything the colour transform decides on the CPU. The packing functions
 * (`packColorAdd`, `packTintAdd`, `NO_COLOR_ADD`) and, more importantly, the two vertex
 * packers, which is where a Pixi upgrade would break this file first: `packAttributes` and
 * `packQuadAttributes` read fields off Pixi's own untyped batchable elements and write a
 * seven-word vertex whose byte layout has to match `ColorTransformGeometry`'s attribute
 * offsets exactly. Those two methods never touch `this`, so they are exercised through the
 * prototype with a hand-built element: constructing a `ColorTransformBatcher` compiles its
 * shader, which needs a `document`, and this runner has none.
 *
 * Not covered, and not coverable here: anything a GPU decides. The GLSL/WGSL bits, whether
 * the shader compiles, whether `texel x M + A` actually lands on screen, and whether the
 * premultiplied-alpha handling in the fragment `end` block is right are all invisible to
 * `node --test`. `npm run benchmark:browser` drives a built example through real Chrome and
 * asserts the renderer stayed on the WebGL path; that, and looking at an example, is what
 * covers the GPU half.
 */

type QuadElement = Parameters<ColorTransformBatcher['packQuadAttributes']>[0];
type MeshElement = Parameters<ColorTransformBatcher['packAttributes']>[0];

/** the vertex layout under test: x, y, u, v, argb, textureIdAndRound, colorAdd */
const VERTEX_SIZE = 7;

/** neither packer uses `this`, so the real methods run detached, with no batcher instance */
const noBatcher = null as unknown as ColorTransformBatcher;
const packQuad = (element: QuadElement, floats: Float32Array, uints: Uint32Array, index: number, textureId: number) =>
	ColorTransformBatcher.prototype.packQuadAttributes.call(noBatcher, element, floats, uints, index, textureId);
const packMesh = (element: MeshElement, floats: Float32Array, uints: Uint32Array, index: number, textureId: number) =>
	ColorTransformBatcher.prototype.packAttributes.call(noBatcher, element, floats, uints, index, textureId);

function views(vertices: number): { floats: Float32Array; uints: Uint32Array } {
	const floats = new Float32Array(vertices * VERTEX_SIZE);
	return { floats, uints: new Uint32Array(floats.buffer) };
}

function quadElement(overrides: Record<string, unknown> = {}): QuadElement {
	return {
		transform: new Matrix(),
		color: 0xffffffff,
		roundPixels: 0,
		bounds: { minX: 0, minY: 0, maxX: 10, maxY: 20 },
		texture: { uvs: { x0: 0, y0: 0, x1: 1, y1: 0, x2: 1, y2: 1, x3: 0, y3: 1 } },
		...overrides,
	} as unknown as QuadElement;
}

/** the same quad as `quadElement`, described the way a mesh element describes it */
function meshElement(overrides: Record<string, unknown> = {}): MeshElement {
	return {
		transform: new Matrix(),
		color: 0xffffffff,
		roundPixels: 0,
		positions: new Float32Array([0, 0, 10, 0, 10, 20, 0, 20]),
		uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
		attributeOffset: 0,
		attributeSize: 4,
		...overrides,
	} as unknown as MeshElement;
}

/** the four channel bytes, in the order `packColorAdd` claims to write them */
function unpack(packed: number): { r: number; g: number; b: number; a: number } {
	return {
		r: packed & 0xff,
		g: (packed >>> 8) & 0xff,
		b: (packed >>> 16) & 0xff,
		a: (packed >>> 24) & 0xff,
	};
}

test('packColorAdd puts red in the lowest byte and alpha in the highest', () => {
	//unorm8x4 reads the four bytes in memory order and the views are little-endian, so this
	//byte order is the whole contract between the packer and the geometry's aColorAdd
	assert.equal(packColorAdd(1, 0, 0), 0x000000ff);
	assert.equal(packColorAdd(0, 1, 0), 0x0000ff00);
	assert.equal(packColorAdd(0, 0, 1), 0x00ff0000);
	assert.equal(packColorAdd(0, 0, 0, 1), 0xff000000);
});

test('packColorAdd defaults alpha to zero, so an added colour never fattens the sprite', () => {
	assert.equal(unpack(packColorAdd(1, 1, 1)).a, 0);
});

test('packColorAdd stays an unsigned 32-bit value even with every byte set', () => {
	const all = packColorAdd(1, 1, 1, 1);
	assert.equal(all, 0xffffffff);
	assert.ok(all > 0, 'must not come back as a negative signed int');
});

test('packColorAdd clamps out-of-range channels rather than wrapping', () => {
	assert.equal(packColorAdd(-1, -0.5, -100), NO_COLOR_ADD);
	assert.equal(packColorAdd(2, 100, Infinity), 0x00ffffff);
	assert.equal(packColorAdd(0, 0, 0, -1), NO_COLOR_ADD);
});

test('packColorAdd round-trips a channel to within one byte of quantisation', () => {
	for (let step = 0; step <= 32; step++) {
		const value = step / 32;
		const { r, g, b } = unpack(packColorAdd(value, value, value));
		assert.equal(r, g);
		assert.equal(g, b);
		assert.ok(Math.abs(r / 255 - value) <= 1 / 255, `${value} came back as ${r}/255`);
	}
});

test('NO_COLOR_ADD is the no-op the batcher packs for anything that never set a colour', () => {
	assert.equal(NO_COLOR_ADD, 0);
	assert.equal(NO_COLOR_ADD, packColorAdd(0, 0, 0, 0));
	//every byte zero: the fragment shader's `finalColor.rgb + vColorAdd.rgb * addedAlpha`
	//and `finalColor.a + vColorAdd.a` both reduce to finalColor
	assert.deepEqual(unpack(NO_COLOR_ADD), { r: 0, g: 0, b: 0, a: 0 });
});

test('packTintAdd reorders 0xRRGGBB into the packed byte order', () => {
	assert.equal(packTintAdd(0xff0000, 1), packColorAdd(1, 0, 0));
	assert.equal(packTintAdd(0x00ff00, 1), packColorAdd(0, 1, 0));
	assert.equal(packTintAdd(0x0000ff, 1), packColorAdd(0, 0, 1));
	assert.equal(packTintAdd(0xffffff, 1), packColorAdd(1, 1, 1));
});

test('packTintAdd at zero strength is exactly NO_COLOR_ADD, whatever the colour', () => {
	for (const color of [0x000000, 0xffffff, 0x3f7fbf, 0xff00ff]) {
		assert.equal(packTintAdd(color, 0), NO_COLOR_ADD, `colour ${color.toString(16)}`);
	}
});

test('packTintAdd scales each channel by strength and leaves alpha alone', () => {
	const half = unpack(packTintAdd(0x804020, 0.5));
	assert.equal(half.r, Math.round((0x80 / 255) * 0.5 * 255));
	assert.equal(half.g, Math.round((0x40 / 255) * 0.5 * 255));
	assert.equal(half.b, Math.round((0x20 / 255) * 0.5 * 255));
	//alpha is never touched: the add term pulls colour, it does not make a sprite more opaque
	assert.equal(half.a, 0);
});

test('lerpTint conserves a white texel: the kept tint plus the added colour is one', () => {
	//`lerp(texel, colour, s)` is `texel x (1 - s) + colour x s`; for colour 0xffffff the two
	//halves have to sum back to full white, or a cross-fade would visibly dim mid-way
	for (const strength of [0, 0.25, 0.5, 0.75, 1]) {
		const keep = Math.round((1 - strength) * 0xff);
		const added = unpack(packTintAdd(0xffffff, strength)).r;
		assert.ok(Math.abs(keep + added - 255) <= 1, `strength ${strength}: ${keep} + ${added}`);
	}
});

test('packQuadAttributes writes four seven-word vertices in the shared index buffer winding', () => {
	const { floats, uints } = views(4);
	packQuad(quadElement({ colorAdd: packColorAdd(1, 0, 0) }), floats, uints, 0, 3);

	//(minX,minY), (maxX,minY), (maxX,maxY), (minX,maxY) - the order Pixi's shared quad index
	//buffer expects, so a wrong corner here shows up as a torn sprite, not a wrong colour
	const corners = [[0, 0], [10, 0], [10, 20], [0, 20]];
	const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
	for (let i = 0; i < 4; i++) {
		const at = i * VERTEX_SIZE;
		assert.deepEqual([floats[at], floats[at + 1]], corners[i], `corner ${i} position`);
		assert.deepEqual([floats[at + 2], floats[at + 3]], uvs[i], `corner ${i} uv`);
		assert.equal(uints[at + 4], 0xffffffff, `corner ${i} argb`);
		assert.equal(uints[at + 5], (3 << 16) | 0, `corner ${i} textureIdAndRound`);
		assert.equal(uints[at + 6], packColorAdd(1, 0, 0), `corner ${i} colorAdd`);
	}
});

test('packQuadAttributes applies the element transform to every corner', () => {
	const { floats, uints } = views(4);
	const transform = new Matrix().scale(2, 3).translate(5, 7);
	packQuad(quadElement({ transform }), floats, uints, 0, 0);

	for (const [i, [x, y]] of [[0, 0], [10, 0], [10, 20], [0, 20]].entries()) {
		const at = i * VERTEX_SIZE;
		assert.equal(floats[at], x * 2 + 5, `corner ${i} x`);
		assert.equal(floats[at + 1], y * 3 + 7, `corner ${i} y`);
	}
});

test('packQuadAttributes folds roundPixels into the low half of the texture-id word', () => {
	const { floats, uints } = views(4);
	packQuad(quadElement({ roundPixels: 1 }), floats, uints, 0, 12);
	assert.equal(uints[5], (12 << 16) | 1);
});

test('an element that never set colorAdd packs the same vertices as one that set zero', () => {
	const bare = views(4);
	const explicit = views(4);
	packQuad(quadElement(), bare.floats, bare.uints, 0, 1);
	packQuad(quadElement({ colorAdd: NO_COLOR_ADD }), explicit.floats, explicit.uints, 0, 1);

	//this is the promise the batcher makes to everything that is not a TintedSprite: joining
	//this batch costs one zero word and changes nothing about how the sprite draws
	assert.deepEqual([...bare.uints], [...explicit.uints]);
	assert.equal(bare.uints[6], NO_COLOR_ADD);
});

test('packQuadAttributes writes at the given index and leaves earlier vertices untouched', () => {
	const { floats, uints } = views(5);
	uints[0] = 0xdeadbeef;
	packQuad(quadElement({ colorAdd: packColorAdd(0, 0, 1) }), floats, uints, VERTEX_SIZE, 0);

	assert.equal(uints[0], 0xdeadbeef, 'the vertex before the write must survive');
	assert.equal(uints[VERTEX_SIZE + 6], packColorAdd(0, 0, 1));
	assert.equal(uints[4 * VERTEX_SIZE + 6], packColorAdd(0, 0, 1), 'last corner of the quad');
});

test('packAttributes writes the same vertices as packQuadAttributes for the same quad', () => {
	const quad = views(4);
	const mesh = views(4);
	const colorAdd = packTintAdd(0x00ff00, 0.5);
	packQuad(quadElement({ colorAdd }), quad.floats, quad.uints, 0, 2);
	packMesh(meshElement({ colorAdd }), mesh.floats, mesh.uints, 0, 2);

	//the mesh path and the quad path are two hand-written copies of one layout; they drift
	//silently unless something compares them
	assert.deepEqual([...mesh.floats], [...quad.floats]);
	assert.deepEqual([...mesh.uints], [...quad.uints]);
});

test('packAttributes honours attributeOffset and attributeSize', () => {
	const { floats, uints } = views(2);
	packMesh(meshElement({ attributeOffset: 2, attributeSize: 2 }), floats, uints, 0, 0);

	assert.deepEqual([floats[0], floats[1]], [10, 20], 'first written vertex is positions[2]');
	assert.deepEqual([floats[VERTEX_SIZE], floats[VERTEX_SIZE + 1]], [0, 20]);
	assert.equal(uints[6], NO_COLOR_ADD);
});

test('registerColorTransform is safe to call more than once', () => {
	//a game passes it through GameOptions.extensions; a second Game in the same process must
	//not register the batcher twice
	assert.doesNotThrow(() => {
		registerColorTransform();
		registerColorTransform();
	});
});

function sprite(): TintedSprite {
	return new TintedSprite({ texture: new Texture({ source: new TextureSource({ width: 8, height: 8 }) }) });
}

test('TintedSprite routes itself through the colour-transform pipe', () => {
	//without this redirect the sprite joins Pixi's own batch and the add term is dropped
	assert.equal((sprite() as unknown as { renderPipeId: string }).renderPipeId, TINTED_SPRITE_PIPE);
});

test('a fresh TintedSprite adds nothing', () => {
	const s = sprite();
	assert.equal(s.colorAdd, NO_COLOR_ADD);
	assert.equal(s.tint, 0xffffff);
});

test('setColorAdd stores exactly what packColorAdd produces', () => {
	const s = sprite();
	s.setColorAdd(1, 0.5, 0, 0.25);
	assert.equal(s.colorAdd, packColorAdd(1, 0.5, 0, 0.25));
});

test('lerpTint sets both halves of the transform', () => {
	const s = sprite();
	s.lerpTint(0x00ff00, 0.5);
	const keep = Math.round(0.5 * 0xff);
	assert.equal(s.tint, (keep << 16) | (keep << 8) | keep);
	assert.equal(s.colorAdd, packTintAdd(0x00ff00, 0.5));
});

test('lerpTint at zero strength is the identity transform', () => {
	const s = sprite();
	s.lerpTint(0xff0000, 0);
	assert.equal(s.tint, 0xffffff);
	assert.equal(s.colorAdd, NO_COLOR_ADD);
});

test('silhouette keeps only the shape: multiply to black, add the colour whole', () => {
	const s = sprite();
	s.silhouette(0x3366ff);
	assert.equal(s.tint, 0x000000);
	assert.equal(s.colorAdd, packColorAdd(0x33 / 255, 0x66 / 255, 0xff / 255));
});

test('resetColor undoes any of the others', () => {
	const s = sprite();
	s.silhouette(0xff00ff);
	s.resetColor();
	assert.equal(s.tint, 0xffffff);
	assert.equal(s.colorAdd, NO_COLOR_ADD);
});

/**
 * The setter's early return is the point: the packed colour lives in vertex data, so every
 * real change has to invalidate the batch, and every no-op change must not. Counting the
 * invalidations through a subclass follows `stage-script.test.ts`: drive the real class
 * through a seam rather than stub Pixi out from under it.
 */
class CountingSprite extends TintedSprite {
	repacks = 0;

	override onViewUpdate(): void {
		this.repacks++;
		super.onViewUpdate();
	}
}

test('setting colorAdd invalidates the batch only when the value actually changed', () => {
	const s = new CountingSprite({ texture: new Texture({ source: new TextureSource({ width: 8, height: 8 }) }) });
	s.repacks = 0;

	s.colorAdd = packColorAdd(1, 0, 0);
	assert.equal(s.repacks, 1);

	s.colorAdd = packColorAdd(1, 0, 0);
	assert.equal(s.repacks, 1, 'the same colour must not repack the batch');

	s.setColorAdd(1, 0, 0);
	assert.equal(s.repacks, 1, 'setColorAdd of the same colour must not either');

	s.resetColor();
	assert.equal(s.repacks, 2);
});
