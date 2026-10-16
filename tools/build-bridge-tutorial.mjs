import { readFileSync, writeFileSync } from 'node:fs';

//Writes webpage/tutorials/bridge/index.html: tools/templates/bridge-tutorial.html with every {{name}}
//replaced by the matching code block quoted from examples/bridge, so the page cannot describe code the
//example no longer has. tests/bridge-example.test.ts fails when a quoted block drifts: rerun this then.
const read = (path) =>
	readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
		.replace(/\r\n/g, '\n')
		.split('\n');
const files = { sim: read('examples/bridge/sim.ts'), main: read('examples/bridge/main.ts') };
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

//lines from the first one starting with `start` to the next line equal to `end` (a closing brace is
//matched at the opening line's own indent); `end` null quotes the one line
function grab(file, start, end) {
	const lines = files[file];
	const first = lines.findIndex((line) => line.trim().startsWith(start));
	if (first < 0) throw new Error(`start not found: ${start}`);
	let last = first;
	if (end !== null) {
		const pad = lines[first].match(/^\t*/)[0];
		const closer = end.startsWith('}') || end.startsWith(']');
		last = lines.findIndex((line, i) => i >= first && (closer ? line === pad + end : line.trim() === end));
		if (last < 0) throw new Error(`end not found: ${end}`);
	}
	const block = lines.slice(first, last + 1);
	const indent = Math.min(...block.filter((line) => line.trim()).map((line) => line.match(/^\t*/)[0].length));
	return block.map((line) => line.slice(indent)).join('\n');
}
const code = (file, start, end) => `<pre class="from-source"><code>${esc(grab(file, start, end))}</code></pre>`;

const snippets = {
	warren: code('sim', 'export function warrenBeams', '}'),
	build: code('sim', 'export function buildBridge', '}'),
	level: code('sim', 'export interface Level', '}'),
	levels: code('sim', 'export const LEVELS', '];'),
	cost: code('sim', 'export function beamCost', '}'),
	problem: code('sim', 'export function beamProblem', '}'),
	pointer: code('main', 'const toWorld', 'pointer.up.add((p) => this.drop(this.jointAt(p.worldX, p.worldY)));'),
	drop: code('main', 'private drop(', '}'),
	apply: code('sim', 'export function applyAction', '}'),
	step: code('sim', 'step(): void', '}'),
	ratio: code('sim', 'export function ratioColour', '}'),
	beamdraw: code('main', 'this.crossing.beams.forEach', '});'),
	breaks: code('main', 'this.crossing.bridge.world.onBreak.add', '});'),
	dispatch: code('main', 'private dispatch(', '}'),
	recorder: code('main', 'private readonly actions', 'private recorder = new Recorder(this.actions, this.ticks);'),
	replay: code('main', 'private replay()', '}'),
	tick: code('main', 'if (this.player && !this.running', '}'),
	saves: code('main', 'const saves', null),
	save: code('main', 'this.runs.push(result);', 'this.say(describe(this.level, result));'),
	fade: code(
		'main',
		'//decorative: the message fades in',
		'this.labels.message.alpha = fade === 0 ? 1 : Math.min(1, this.message.age / fade);',
	),
	theme: code('main', 'private paintLabels()', '}'),
	contrast: code('main', "['Contrast'", null),
	cableCost: code('sim', 'return Math.round(beam[2]', null),
};

const template = readFileSync(new URL('./templates/bridge-tutorial.html', import.meta.url), 'utf8');
const html = template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
	if (!(name in snippets)) throw new Error(`no snippet ${name}`);
	return snippets[name];
});
writeFileSync(new URL('../webpage/tutorials/bridge/index.html', import.meta.url), html);
console.log(`webpage/tutorials/bridge/index.html written (${html.length} bytes)`);
