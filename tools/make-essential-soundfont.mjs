import { readFileSync, writeFileSync } from 'node:fs';
import { subsetSoundFont } from '../dist/audio/SoundFont.js';

// Run npm run build:pkg first. Preserve original sample data and licence, selecting presets only.
const programs = [0, 24, 40, 56, 73].map((program) => ({ bank: 0, program }));
programs.push({ bank: 128, program: 0 });
const bytes = subsetSoundFont(readFileSync(new URL('../data/microgm-opt.sf2', import.meta.url)), programs);
writeFileSync(new URL('../data/microgm-essential.sf2', import.meta.url), new Uint8Array(bytes));
console.log(`microgm-essential.sf2: ${bytes.byteLength} bytes, ${programs.length} presets`);
