#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Developer check, not shipped to games: for each MIDI engine of the retro-audio package that has a
 * packaged core (`retroCoreSource`), plays the same held chord twice, once through `AudioCoreHost` on a
 * worker from the core's text and once as a direct render of the engine, and requires the two to be
 * identical sample for sample. That is the contract of `AudioCoreHostOptions.factorySource`: the bundled
 * text is the engine, not a lookalike.
 *
 *   node tools/check-retro-cores.mjs [--package ../mwg-retro-audio] [--engines retro:d50,retro:m1] [--seconds 2]
 *
 * Needs the package built (`npm run build` there). Exits 1 when any engine differs, fails or underruns.
 */

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const packageDir = resolve(flag('--package') ?? '../mwg-retro-audio');
const seconds = Number(flag('--seconds') ?? 2);
const only = flag('--engines')?.split(',');
const RATE = 44100;
const VOICES = 8;

const dist = join(packageDir, 'dist', 'mwg');
if (!existsSync(join(dist, 'worker-cores.js'))) {
	console.error(`no built packaged cores in ${dist}: run the package's build first`);
	process.exit(1);
}
const here = (path) =>
	pathToFileURL(resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), path)).href;
const load = (path) => import(pathToFileURL(join(dist, path)).href);

const { AudioCoreHost } = await import(here('src/audio/CoreHost.ts'));
const { registerMidiSynth, resolveMidiSynth, renderMidiThroughSynth } = await import(here('src/audio/MidiSynth.ts'));
const { parseMidi } = await import(here('src/audio/Midi.ts'));
const { sendMidiToHost } = await import(here('src/audio/HostedMidi.ts'));
const { retroCoreNames, retroCoreSource } = await load('worker-cores.js');
const { registerRetroMidiEngines } = await load('midiEngines.js');
const { registerRetroCatalogueMidiEngines } = await load('catalogueEngines.js');
registerRetroMidiEngines(registerMidiSynth);
registerRetroCatalogueMidiEngines(registerMidiSynth);

/** a chord of held notes, one per channel, as a format 0 file at 120 bpm */
function chord(voices, length) {
	const track = [];
	for (let voice = 0; voice < voices; voice++) track.push(0, 0x90 | voice, 40 + voice * 4, 100);
	const ticks = Math.round(length * 192);
	const vlq = (value) => {
		const bytes = [value & 0x7f];
		for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
		return bytes;
	};
	for (let voice = 0; voice < voices; voice++)
		track.push(...(voice === 0 ? vlq(ticks) : [0]), 0x80 | voice, 40 + voice * 4, 0);
	track.push(0, 0xff, 0x2f, 0);
	return parseMidi(
		new Uint8Array([
			0x4d,
			0x54,
			0x68,
			0x64,
			0,
			0,
			0,
			6,
			0,
			0,
			0,
			1,
			0,
			96,
			0x4d,
			0x54,
			0x72,
			0x6b,
			0,
			0,
			0,
			track.length,
			...track,
		]),
	);
}

const file = chord(VOICES, seconds);
const names = (only ?? retroCoreNames).filter((name) => retroCoreSource(name) !== undefined);
let failed = 0;
for (const name of names) {
	const source = retroCoreSource(name);
	const line = { name, bytes: source.length };
	try {
		const { synth } = resolveMidiSynth(name, RATE, 'builtin');
		if (!synth) throw new Error('the engine is not registered with mwg');
		const direct = renderMidiThroughSynth(file, synth, { tail: 0 });
		const host = new AudioCoreHost({
			factorySource: source,
			sampleRate: RATE,
			mode: 'worker',
			prefetch: args.includes('--prefetch'),
			blockFrames: 2048,
			queueSeconds: 2,
		});
		sendMidiToHost(host, file);
		await new Promise((done) => setTimeout(done, 600));
		const total = direct.left.length;
		const left = new Float32Array(total);
		const right = new Float32Array(total);
		//a read is made only once the worker has rendered that much, so an underrun means the core failed to keep
		//up, not that this loop read faster than real time (which it otherwise would, and flake under load)
		for (let at = 0; at < total; at += 4410) {
			const wanted = Math.min(4410, total - at);
			for (let waited = 0; host.stats().queuedFrames < wanted && waited < 10_000; waited += 10) {
				host.pump(wanted);
				await new Promise((done) => setTimeout(done, 10));
			}
			host.read(left, right, at, wanted);
		}
		const stats = host.stats();
		host.dispose();
		let differing = 0;
		let peak = 0;
		for (let i = 0; i < total; i++) {
			if (Math.abs(left[i] - direct.left[i]) > 1e-6 || Math.abs(right[i] - direct.right[i]) > 1e-6) differing++;
			peak = Math.max(peak, Math.abs(direct.left[i]));
		}
		Object.assign(line, { mode: stats.mode, underruns: stats.underruns, differing, silent: peak < 0.002 });
		line.ok = stats.mode === 'worker' && stats.underruns === 0 && differing === 0;
	} catch (error) {
		Object.assign(line, { ok: false, error: error instanceof Error ? error.message : String(error) });
	}
	if (!line.ok) failed++;
	console.log(
		`${line.ok ? 'ok  ' : 'FAIL'} ${name}  ${Math.round(line.bytes / 1024)} KB` +
			(line.ok ? (line.silent ? '  (silent chord)' : '') : `  ${JSON.stringify(line)}`),
	);
}
console.log(`${names.length - failed} of ${names.length} packaged cores match a direct render`);
process.exitCode = failed ? 1 : 0;
