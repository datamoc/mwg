import { readFile, writeFile, stat } from 'node:fs/promises';
import { extname, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Converts a raster image buffer to WebP - roadmap item 350's "convert pictures to WebP"
 * half, kept as its own module so `tools/compile-resources.mjs` (a published, shipped tool -
 * see `package.json`'s `files`/`exports`) never has to import an image codec itself. This file
 * is *not* shipped: it dynamically imports `sharp`, a devDependency of this repo, so a game
 * that never opts into WebP conversion carries no new dependency at all. A game that does want
 * it installs `sharp` in its own project the same way this repo does.
 *
 * `lossless` (default true) uses WebP's real lossless mode (VP8L), which is what a pixel-art
 * tileset's exact colours need - not "high quality lossy", which is still a DCT approximation
 * at any quality setting. Lossy mode (`lossless: false`, with `quality`) is available for
 * photographic source art where the extra size saving is worth it, but it is never the
 * default: this project does not silently trade fidelity for size.
 */

let sharpModule;
async function loadSharp() {
	if (sharpModule) return sharpModule;
	try {
		sharpModule = (await import('sharp')).default;
	} catch (err) {
		throw new Error(
			'WebP conversion needs the optional `sharp` package, which is not installed. ' +
				'Run `npm install --save-dev sharp` in your project to use toWebp, or pass ' +
				'`toWebp: false` (the default) to skip WebP conversion entirely.',
			{ cause: err },
		);
	}
	return sharpModule;
}

/**
 * @param {Buffer} buffer source image bytes (PNG or JPEG)
 * @param {object} [options]
 * @param {boolean} [options.lossless] use WebP's lossless mode (default true)
 * @param {number} [options.quality] 0-100, used only when `lossless` is false (default 90)
 * @returns {Promise<Buffer>} WebP-encoded image bytes
 */
export async function toWebp(buffer, { lossless = true, quality = 90 } = {}) {
	const sharp = await loadSharp();
	return sharp(buffer)
		.webp(lossless ? { lossless: true } : { quality })
		.toBuffer();
}

/**
 * The extensions `compileResources`'s `toWebp` option will attempt to convert. `.gif` (frame
 * animation, which WebP would need to be re-authored to preserve) and `.svg` (already vector,
 * so there is nothing raster to convert) are deliberately left out, along with `.webp` itself.
 */
export const WEBP_CONVERTIBLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const args = process.argv.slice(2);
	const input = args.find((a) => !a.startsWith('--'));
	if (!input) {
		console.error('usage: node tools/webp-convert.mjs <file.png|file.jpg> [--lossy[=quality]]');
		process.exit(1);
	}
	const lossyFlag = args.find((a) => a === '--lossy' || a.startsWith('--lossy='));
	const lossless = !lossyFlag;
	const quality = lossyFlag && lossyFlag.includes('=') ? Number(lossyFlag.split('=')[1]) : 90;

	const inPath = resolve(input);
	if (!WEBP_CONVERTIBLE_EXTENSIONS.has(extname(inPath).toLowerCase())) {
		console.error(`${input}: not a convertible image (expected .png, .jpg or .jpeg)`);
		process.exit(1);
	}
	const source = await readFile(inPath);
	const converted = await toWebp(source, { lossless, quality });
	const outPath = resolve(dirname(inPath), basename(inPath, extname(inPath)) + '.webp');
	await writeFile(outPath, converted);

	const { size: sourceSize } = await stat(inPath);
	const kb = (n) => (n / 1024).toFixed(1) + ' KB';
	const pct = Math.round((100 * (sourceSize - converted.length)) / sourceSize);
	console.log(`  ${outPath}`);
	console.log(
		`  ${kb(sourceSize)} -> ${kb(converted.length)} (${pct >= 0 ? '-' : '+'}${Math.abs(pct)}%)` +
			(lossless ? ' [lossless]' : ` [lossy, quality ${quality}]`),
	);
}
