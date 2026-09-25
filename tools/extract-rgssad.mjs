#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as glue from './vendored/rgssad-wasm/rgssad_wasm_bg.js';

/**
 * Extracts an RPG Maker XP/VX `.rgssad` archive to plain files, through the vendored
 * `rgssad-wasm` decoder (MIT, see `vendored/rgssad-wasm/README.md`). A format tool, for someone
 * porting a game whose archive they own; nothing a player receives. Shipped as
 * `@datamoc/mw_games/tools/extract-rgssad` and `mwg-extract-rgssad <archive> <outDir>` (item 389).
 *
 * Entry names come from the archive, so they are untrusted: each is normalised (RPG Maker writes
 * `\\` separators) and refused unless it resolves inside `outDir`, the check that stops an entry
 * named `..\\..\\anything` from writing outside the folder asked for.
 */

// Resolved relative to this script's own location, not the caller's cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
let ready = null;

function decoder() {
	ready ??= WebAssembly.instantiate(fs.readFileSync(path.join(here, 'vendored/rgssad-wasm/rgssad_wasm_bg.wasm')), {
		'./rgssad_wasm_bg.js': glue,
	}).then(({ instance }) => {
		glue.__wbg_set_wasm(instance.exports);
		if (instance.exports.__wbindgen_start) instance.exports.__wbindgen_start();
	});
	return ready;
}

/** where an archive entry lands under `outDir`, or a thrown error when its name escapes it */
export function entryPath(outDir, fileName) {
	const root = path.resolve(outDir);
	const target = path.resolve(root, fileName.replace(/\\/g, '/'));
	if (target !== root && !target.startsWith(root + path.sep))
		throw new Error(`rgssad entry "${fileName}" would be written outside ${root}`);
	return target;
}

/** extracts every entry of `archivePath` under `outDir`; returns how many files were written */
export async function extractRgssad(archivePath, outDir) {
	await decoder();
	const data = fs.readFileSync(archivePath);
	const reader = new glue.Reader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
	let count = 0;
	for (let entry = reader.readEntry(); entry != null; entry = reader.readEntry()) {
		const outPath = entryPath(outDir, entry.fileName);
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, Buffer.from(entry.data));
		count++;
	}
	return count;
}

//realpath, since an npm `bin` shim reaches this file through a symlink
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [, , archivePath, outDir] = process.argv;
	if (!archivePath || !outDir) {
		console.error('usage: mwg-extract-rgssad <archive.rgssad> <outDir>');
		process.exit(1);
	}
	console.log(`Extracted ${await extractRgssad(archivePath, outDir)} files to ${outDir}`);
}
