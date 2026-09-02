import {
	Batcher,
	Buffer,
	BufferUsage,
	ExtensionType,
	Geometry,
	Shader,
	colorBit,
	colorBitGl,
	compileHighShaderGlProgram,
	compileHighShaderGpuProgram,
	generateTextureBatchBit,
	generateTextureBatchBitGl,
	getBatchSamplersUniformGroup,
	roundPixelsBit,
	roundPixelsBitGl,
} from 'pixi.js';
import type { BatchableMeshElement, BatchableQuadElement, BatcherOptions, Matrix } from 'pixi.js';

/**
 * The fields the runtime elements carry but the published types omit.
 *
 * Pixi's own DefaultBatcher is untyped JavaScript, so these never had to be declared. They
 * are read here exactly as DefaultBatcher reads them.
 */
interface PackedElement {
	transform: Matrix;
	color: number;
	roundPixels: number;
	colorAdd?: number;
}

type MeshElement = BatchableMeshElement & PackedElement;
type QuadElement = BatchableQuadElement & PackedElement;

/**
 * A batcher that adds a per-sprite *additive* colour term.
 *
 * Pixi's built-in tint can only multiply. A roguelike needs `texel × M + A`, because the
 * add term is what expresses everything that pulls a sprite *towards* a colour rather
 * than darkening it: a poisoned enemy going green, a hit flashing white, a remembered but
 * unlit tile washing out to grey. Those all read as `lerp(texel, colour, strength)`, which
 * is `texel × (1 - s) + colour × s` — impossible with multiply alone.
 *
 * Doing it here rather than as a per-object filter is the whole point: a filter costs a
 * render-texture pass per object, while this rides along in the same batch and costs one
 * extra vertex attribute.
 *
 * ## A note on coupling
 *
 * This is the one file in `mwg` that builds on Pixi's batching internals: `Batcher`, the
 * high-shader bits, and the vertex packing layout. They are exported from the package
 * root, but they are implementation surface and may shift between Pixi minor versions.
 * The coupling is deliberately confined to this file, and `ColorTransform.test.ts` pins
 * the behaviour so an upgrade fails loudly rather than quietly rendering wrong.
 */

/** the extra vertex attribute, and how it folds into the fragment colour */
const colorAddBitGl = {
	name: 'color-add-bit',
	vertex: {
		header: /* glsl */ `
            in vec4 aColorAdd;
            out vec4 vColorAdd;
        `,
		main: /* glsl */ `
            vColorAdd = aColorAdd;
        `,
	},
	fragment: {
		header: /* glsl */ `
            in vec4 vColorAdd;
        `,
		end: /* glsl */ `
            // Pixi works in premultiplied alpha, so the added colour is scaled by the
            // final alpha. That keeps a transparent texel transparent instead of leaving
            // a coloured halo where the sprite is empty.
            float addedAlpha = finalColor.a + vColorAdd.a;
            finalColor = vec4(finalColor.rgb + vColorAdd.rgb * addedAlpha, addedAlpha);
        `,
	},
};

const colorAddBit = {
	name: 'color-add-bit',
	vertex: {
		header: /* wgsl */ `
            @in aColorAdd: vec4<f32>;
            @out vColorAdd: vec4<f32>;
        `,
		main: /* wgsl */ `
            vColorAdd = aColorAdd;
        `,
	},
	fragment: {
		header: /* wgsl */ `
            @in vColorAdd: vec4<f32>;
        `,
		end: /* wgsl */ `
            let addedAlpha = finalColor.a + vColorAdd.a;
            finalColor = vec4<f32>(finalColor.rgb + vColorAdd.rgb * addedAlpha, addedAlpha);
        `,
	},
};

class ColorTransformShader extends Shader {
	readonly maxTextures: number;

	constructor(maxTextures: number) {
		super({
			glProgram: compileHighShaderGlProgram({
				name: 'color-transform-batch',
				bits: [colorBitGl, colorAddBitGl, generateTextureBatchBitGl(maxTextures), roundPixelsBitGl],
			}),
			gpuProgram: compileHighShaderGpuProgram({
				name: 'color-transform-batch',
				bits: [colorBit, colorAddBit, generateTextureBatchBit(maxTextures), roundPixelsBit],
			}),
			resources: { batchSamplers: getBatchSamplersUniformGroup(maxTextures) },
		});
		this.maxTextures = maxTextures;
	}
}

/** the default layout plus one more 32-bit word for the additive colour */
const VERTEX_SIZE = 7;

class ColorTransformGeometry extends Geometry {
	constructor() {
		const attributeBuffer = new Buffer({
			data: new Float32Array(1),
			label: 'mwg-color-transform-attribute-buffer',
			usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
			shrinkToFit: false,
		});
		const indexBuffer = new Buffer({
			data: new Uint32Array(1),
			label: 'mwg-color-transform-index-buffer',
			usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
			shrinkToFit: false,
		});

		const stride = VERTEX_SIZE * 4;

		super({
			attributes: {
				aPosition: { buffer: attributeBuffer, format: 'float32x2', stride, offset: 0 },
				aUV: { buffer: attributeBuffer, format: 'float32x2', stride, offset: 2 * 4 },
				aColor: { buffer: attributeBuffer, format: 'unorm8x4', stride, offset: 4 * 4 },
				aTextureIdAndRound: { buffer: attributeBuffer, format: 'uint16x2', stride, offset: 5 * 4 },
				aColorAdd: { buffer: attributeBuffer, format: 'unorm8x4', stride, offset: 6 * 4 },
			},
			indexBuffer,
		});
	}
}

/**
 * Carries the additive colour for one renderable.
 *
 * Anything drawn through this batcher may set `colorAdd` on itself; anything that does not
 * is packed with zero and renders exactly as it would have with the default batcher.
 */
export interface HasColorAdd {
	/** additive colour, packed as 0xAABBGGRR to match the attribute's byte order */
	colorAdd?: number;
}

const NO_ADD = 0;

const addOf = (element: PackedElement): number => element.colorAdd ?? NO_ADD;

export class ColorTransformBatcher extends Batcher {
	/** @internal */
	static extension = {
		type: [ExtensionType.Batcher],
		name: 'mwg-color-transform',
	} as const;

	geometry: Geometry = new ColorTransformGeometry();
	shader: Shader;
	override name = ColorTransformBatcher.extension.name;
	override vertexSize = VERTEX_SIZE;

	constructor(options: BatcherOptions) {
		super(options);
		this.shader = new ColorTransformShader(options.maxTextures);
	}

	packAttributes(
		element: MeshElement,
		float32View: Float32Array,
		uint32View: Uint32Array,
		index: number,
		textureId: number
	): void {
		const textureIdAndRound = (textureId << 16) | (element.roundPixels & 0xffff);
		const { a, b, c, d, tx, ty } = element.transform;
		const { positions, uvs } = element;
		const argb = element.color;
		const colorAdd = addOf(element);

		const offset = element.attributeOffset;
		const end = offset + element.attributeSize;

		for (let i = offset; i < end; i++) {
			const i2 = i * 2;
			const x = positions[i2];
			const y = positions[i2 + 1];

			float32View[index++] = a * x + c * y + tx;
			float32View[index++] = d * y + b * x + ty;
			float32View[index++] = uvs[i2];
			float32View[index++] = uvs[i2 + 1];
			uint32View[index++] = argb;
			uint32View[index++] = textureIdAndRound;
			uint32View[index++] = colorAdd;
		}
	}

	packQuadAttributes(
		element: QuadElement,
		float32View: Float32Array,
		uint32View: Uint32Array,
		index: number,
		textureId: number
	): void {
		const { a, b, c, d, tx, ty } = element.transform;
		const { bounds } = element;
		const uvs = element.texture.uvs;

		const w0 = bounds.maxX;
		const w1 = bounds.minX;
		const h0 = bounds.maxY;
		const h1 = bounds.minY;

		const argb = element.color;
		const colorAdd = addOf(element);
		const textureIdAndRound = (textureId << 16) | (element.roundPixels & 0xffff);

		//the four corners, in the winding order Pixi's shared index buffer expects
		const corners: readonly [number, number, number, number][] = [
			[w1, h1, uvs.x0, uvs.y0],
			[w0, h1, uvs.x1, uvs.y1],
			[w0, h0, uvs.x2, uvs.y2],
			[w1, h0, uvs.x3, uvs.y3],
		];

		for (const [x, y, u, v] of corners) {
			float32View[index] = a * x + c * y + tx;
			float32View[index + 1] = d * y + b * x + ty;
			float32View[index + 2] = u;
			float32View[index + 3] = v;
			uint32View[index + 4] = argb;
			uint32View[index + 5] = textureIdAndRound;
			uint32View[index + 6] = colorAdd;
			index += VERTEX_SIZE;
		}
	}

	/** @internal - Pixi calls this when the device's texture limit is known */
	_updateMaxTextures(maxTextures: number): void {
		if ((this.shader as ColorTransformShader).maxTextures === maxTextures) return;
		this.shader.destroy();
		this.shader = new ColorTransformShader(maxTextures);
	}

	override destroy(): void {
		this.shader.destroy();
		super.destroy();
	}
}

/**
 * Packs an additive colour into the form the attribute expects.
 *
 * @param r red, 0 to 1
 * @param g green, 0 to 1
 * @param b blue, 0 to 1
 * @param a how much to add to the sprite's own alpha, 0 to 1; usually 0
 */
export function packColorAdd(r: number, g: number, b: number, a = 0): number {
	//unorm8x4 reads the four bytes in memory order, and the view is little-endian, so the
	//red channel has to sit in the lowest byte
	return (
		((clamp255(a) << 24) | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0
	);
}

/** the additive half of `lerp(texel, colour, strength)`; pair with a tint of `1 - strength` */
export function packTintAdd(color: number, strength: number): number {
	return packColorAdd(
		(((color >> 16) & 0xff) / 255) * strength,
		(((color >> 8) & 0xff) / 255) * strength,
		((color & 0xff) / 255) * strength
	);
}

function clamp255(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export const NO_COLOR_ADD = NO_ADD;
