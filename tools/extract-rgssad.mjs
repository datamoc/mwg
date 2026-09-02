// Standalone Node extractor for RGSSAD archives, using the vendored rgssad-wasm
// module directly (bypassing the browser UI, which caps file-input size in
// this environment and can't handle a 60+MB archive).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as glue from "./vendored/rgssad-wasm/rgssad_wasm_bg.js";

// Resolved relative to this script's own location, not the caller's cwd, so
// `npm run extract:rgssad` works from the repo root regardless of invocation.
const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(here, "vendored/rgssad-wasm/rgssad_wasm_bg.wasm");
const wasmBytes = fs.readFileSync(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {
  "./rgssad_wasm_bg.js": glue,
});
glue.__wbg_set_wasm(instance.exports);
if (instance.exports.__wbindgen_start) instance.exports.__wbindgen_start();

const [, , archivePath, outDir] = process.argv;
if (!archivePath || !outDir) {
  console.error("usage: node extract-rgssad.mjs <archive.rgssad> <outDir>");
  process.exit(1);
}

const data = fs.readFileSync(archivePath);
const reader = new glue.Reader(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

let count = 0;
for (let entry = reader.readEntry(); entry != null; entry = reader.readEntry()) {
  const fileName = entry.fileName;
  const outPath = path.join(outDir, fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(entry.data));
  count++;
}
console.log(`Extracted ${count} files to ${outDir}`);
