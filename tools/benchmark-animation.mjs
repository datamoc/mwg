import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { findChrome } from './find-chrome.mjs';

/**
 * Measures the crossover between browser-native element animation and Pixi sprites.
 *
 * The question this exists to answer, with numbers instead of an assumption: for moving
 * things around, is CSS animation of DOM/SVG elements (compositor-friendly, main thread idle)
 * cheaper than animating Pixi sprites in `update(dt)` (batched WebGL, main thread busy)?
 *
 * A generated page runs one mode per load:
 *
 *   - `css`: N inline `<svg>` elements, each with a compositor `transform` animation;
 *   - `pixi`: N `Sprite2D`s sharing one generated texture, moved every frame in `update(dt)`;
 *   - `both`: both at once, to show what they cost together in one page.
 *
 * and samples `requestAnimationFrame` intervals. Read the caveats, because they decide what
 * the numbers mean:
 *
 *   - rAF intervals measure **main-thread frame pacing**. CSS animation runs on the
 *     compositor, so `css` will look flat until compositing or memory pressure is the limit;
 *     that is the finding, not a measurement of compositor cost. `pixi` and `both` include
 *     real JS and GPU work.
 *   - on a runner with no GPU (SwiftShader) the Pixi side is software-rasterised. The tool
 *     warns when it detects that; local numbers on a real GPU are the meaningful ones.
 *   - it is a measurement, not a gate. Nothing here asserts a threshold.
 *
 * Run `npm run build` first, then `npm run benchmark:animation`.
 * `MWG_ANIM_COUNTS`, `MWG_ANIM_MODES` and `MWG_ANIM_FRAMES` override the defaults.
 */

const root = resolve(import.meta.dirname, '..');
const globalBundle = join(root, 'dist', 'mw_games.global.js');
if (!existsSync(globalBundle)) throw new Error(`no build found at ${globalBundle} - run "npm run build" first`);

const counts = (process.env.MWG_ANIM_COUNTS ?? '250,1000,4000')
	.split(',')
	.map((value) => Number(value.trim()))
	.filter((value) => Number.isFinite(value) && value > 0);
const modes = (process.env.MWG_ANIM_MODES ?? 'css,pixi,both').split(',').map((value) => value.trim());
const frames = Number(process.env.MWG_ANIM_FRAMES ?? 120);
const extraChromeArgs = (process.env.MWG_BENCHMARK_CHROME_ARGS ?? '').split(' ').filter(Boolean);

const PAGE = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<style>
		html, body { margin: 0; width: 100%; height: 100%; background: #101018; overflow: hidden; }
		#dom { position: fixed; inset: 0; z-index: 2; pointer-events: none; }
		#game { position: fixed; inset: 0; z-index: 1; display: block; }
		.orbit {
			position: absolute; left: 50%; top: 50%; width: 18px; height: 18px;
			will-change: transform;
			animation: orbit 1.6s linear infinite;
		}
		@keyframes orbit {
			from { transform: rotate(0deg) translateX(220px) rotate(0deg); }
			to { transform: rotate(360deg) translateX(220px) rotate(-360deg); }
		}
	</style>
</head>
<body>
	<div id="dom"></div>
	<canvas id="game"></canvas>
	<script src="./mw_games.global.js"></script>
	<script>
		const params = new URLSearchParams(location.search);
		const mode = params.get('mode') || 'pixi';
		const count = Number(params.get('count') || 1000);
		const { Game, Scene2D, Shape2D, Sprite2D } = window.mw_games;
		const GEM = '<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="9,0 18,9 9,18 0,9" fill="#6fb1ff"/></svg>';

		let spriteCount = 0;

		function buildCss() {
			const host = document.getElementById('dom');
			const fragment = document.createDocumentFragment();
			for (let i = 0; i < count; i++) {
				const element = document.createElement('div');
				element.className = 'orbit';
				element.style.animationDelay = (-i * 0.013).toFixed(3) + 's';
				element.innerHTML = GEM;
				fragment.appendChild(element);
			}
			host.appendChild(fragment);
		}

		async function buildPixi() {
			spriteCount = count;
			const game = new Game({ canvas: document.getElementById('game'), background: 0x101018 });

			class BenchScene extends Scene2D {
				create() {
					this.cx = Game.current.width / 2;
					this.cy = Game.current.height / 2;
					const shape = new Shape2D().rect(-9, -9, 18, 18).fill(0x6fb1ff);
					const texture = window.__PIXI_APP__.renderer.generateTexture(shape);
					this.sprites = [];
					for (let i = 0; i < spriteCount; i++) {
						const sprite = new Sprite2D(texture);
						sprite.anchor.set(0.5);
						this.stage.addChild(sprite);
						this.sprites.push(sprite);
					}
					this.t = 0;
				}

				update(dt) {
					this.t += dt;
					for (let i = 0; i < this.sprites.length; i++) {
						const angle = this.t * 1.6 + i * 0.017;
						this.sprites[i].position.set(
							this.cx + Math.cos(angle) * 220,
							this.cy + Math.sin(angle) * 160,
						);
					}
				}
			}

			await game.start(BenchScene);
		}

		function rendererInfo() {
			const canvas = document.querySelector('canvas');
			const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
			if (!gl) return { name: 'none', gpu: null };
			const extension = gl.getExtension('WEBGL_debug_renderer_info');
			return {
				name: String(window.__PIXI_APP__ && window.__PIXI_APP__.renderer ? window.__PIXI_APP__.renderer.name : 'webgl').toLowerCase(),
				gpu: extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
			};
		}

		async function measure(sampleCount) {
			await new Promise((done) => setTimeout(done, 500));
			const samples = [];
			await new Promise((done) => {
				let previous;
				const tick = (now) => {
					if (previous !== undefined) samples.push(now - previous);
					previous = now;
					if (samples.length >= sampleCount) done();
					else requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
			});
			samples.sort((a, b) => a - b);
			const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
			return {
				mode,
				count,
				frames: samples.length,
				averageMs: Number(average.toFixed(3)),
				p95Ms: Number(samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))].toFixed(3)),
				fps: Number((1000 / average).toFixed(1)),
			};
		}

		(async () => {
			if (mode === 'css' || mode === 'both') buildCss();
			if (mode === 'pixi' || mode === 'both') await buildPixi();
			window.__BENCH__ = { measure, renderer: rendererInfo() };
			window.__BENCH_READY__ = true;
		})().catch((error) => {
			window.__BENCH_ERROR__ = String((error && error.stack) || error);
			window.__BENCH_READY__ = true;
		});
	</script>
</body>
</html>
`;

const scratch = mkdtempSync(join(tmpdir(), 'mwg-animation-bench-'));
cpSync(globalBundle, join(scratch, 'mw_games.global.js'));
writeFileSync(join(scratch, 'index.html'), PAGE);

const executablePath = process.env.CHROME_PATH ?? (await findChrome());
const browser = await chromium.launch({
	executablePath,
	headless: true,
	args: ['--allow-file-access-from-files', ...extraChromeArgs],
});

const rows = [];
let renderer = { name: 'unknown', gpu: null };

try {
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	for (const mode of modes) {
		for (const count of counts) {
			const url = `${pathToFileURL(join(scratch, 'index.html')).href}?mode=${mode}&count=${count}`;
			await page.goto(url, { waitUntil: 'load' });
			await page.waitForFunction(() => window.__BENCH_READY__ === true, undefined, { timeout: 15000 });

			const failure = await page.evaluate(() => window.__BENCH_ERROR__ ?? null);
			if (failure) throw new Error(`page setup failed for ${mode} x ${count}: ${failure}`);
			if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join('; ')}`);

			renderer = await page.evaluate(() => window.__BENCH__.renderer);
			const result = await page.evaluate((sampleCount) => window.__BENCH__.measure(sampleCount), frames);
			rows.push(result);
			console.log(
				`${result.mode.padEnd(5)} n=${String(result.count).padStart(6)}  ${result.averageMs.toFixed(2).padStart(7)} ms  ` +
					`p95 ${result.p95Ms.toFixed(2).padStart(7)} ms  ${result.fps.toFixed(1).padStart(6)} fps`,
			);
		}
	}
} finally {
	await browser.close();
	rmSync(scratch, { recursive: true, force: true });
}

const software = /swiftshader|llvmpipe|software/i.test(renderer.gpu ?? '');
console.log(`\nrenderer: ${renderer.name}${renderer.gpu ? ` (${renderer.gpu})` : ''}`);
if (software) {
	console.log('warning: software WebGL detected - the Pixi numbers are not representative of a GPU');
}
console.log(
	'note: rAF intervals measure main-thread pacing; CSS animation runs on the compositor, so "css" staying flat is expected.',
);

const output = resolve(root, 'benchmark-results', 'animation-benchmark.json');
mkdirSync(resolve(root, 'benchmark-results'), { recursive: true });
writeFileSync(
	output,
	`${JSON.stringify({ timestamp: new Date().toISOString(), renderer, software, rows }, null, '\t')}\n`,
);
console.log(`wrote ${output}`);
