/**
 * Minifies an SVG for embedding, the SVG half of what `webp-convert` is for raster images, kept as
 * its own module so `tools/compile-resources.mjs` never has to import an optimiser itself: it
 * dynamically imports `svgo`, which a game that opts in installs in its own project the way it does
 * `sharp` for WebP (`npm install --save-dev svgo`). A game that never passes `svgo: true` carries
 * no new dependency at all.
 *
 * Optimising must not change what the game can see or name. Ids are left alone (`cleanupIds` is off:
 * a `<use href="#id">`, a gradient reference or a style selector inside the file, or an id the game
 * looks up, would break if minified), and the `viewBox` stays because svgo 4's default preset no
 * longer removes it (a game scales a texture by it), which is why this needs svgo 4 or newer.
 * Everything else in the default preset applies: comments, metadata, editor data, default
 * attributes, redundant groups, path precision.
 */

/** the svgo configuration `optimiseSvg` runs, exposed so a game can see exactly what it opts into */
export const SVGO_CONFIG = {
	multipass: true,
	plugins: [{ name: 'preset-default', params: { overrides: { cleanupIds: false } } }],
};

let svgoModule;
async function loadSvgo() {
	if (svgoModule) return svgoModule;
	try {
		svgoModule = await import('svgo');
	} catch (err) {
		throw new Error(
			'SVG optimisation needs the optional `svgo` package, which is not installed. ' +
				'Run `npm install --save-dev svgo` in your project to use `svgo: true`, or leave ' +
				'it off (the default) to embed SVG files as they are.',
			{ cause: err },
		);
	}
	return svgoModule;
}

/**
 * @param {Buffer} buffer the SVG file's bytes (UTF-8)
 * @returns {Promise<Buffer>} the optimised SVG; svgo throws for a file that is not valid SVG
 */
export async function optimiseSvg(buffer) {
	const { optimize } = await loadSvgo();
	return Buffer.from(optimize(buffer.toString('utf8'), SVGO_CONFIG).data, 'utf8');
}
