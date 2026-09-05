import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Generates the art and sound the examples use.
 *
 * These are drawn and synthesised here rather than downloaded, for one reason: everything
 * `mwg` ships has to be redistributable under its own licence. Borrowing a tileset means
 * inheriting whatever that tileset's terms are, and game art is exactly where those terms
 * bite. Generated assets have no such history.
 *
 * They are deliberately plain. If you want real pixel art in your own game, Kenney
 * (kenney.nl) publishes large tilesets under CC0, which imposes nothing.
 */

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'examples', 'assets');

const TILE = 16;
const COLUMNS = 8;
const ROWS = 2;

// ---------------------------------------------------------------- PNG encoding

function crc32(buf) {
	let crc = ~0;
	for (const byte of buf) {
		crc ^= byte;
		for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return ~crc >>> 0;
}

function chunk(type, data) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');

	const crcInput = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const tail = Buffer.alloc(4);
	tail.writeUInt32BE(crc32(crcInput), 0);

	return Buffer.concat([head, data, tail]);
}

/** @param pixels RGBA bytes, row-major */
function encodePng(width, height, pixels) {
	//each scanline is prefixed with its filter type; 0 means "no filter"
	const raw = Buffer.alloc(height * (1 + width * 4));
	for (let y = 0; y < height; y++) {
		const to = y * (1 + width * 4);
		raw[to] = 0;
		pixels.copy(raw, to + 1, y * width * 4, (y + 1) * width * 4);
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; //bit depth
	ihdr[9] = 6; //colour type: RGBA
	//10..12 stay zero: deflate, adaptive filtering, no interlace

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

// ---------------------------------------------------------------- the tileset

class Canvas {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = Buffer.alloc(width * height * 4);
	}

	set(x, y, [r, g, b, a = 255]) {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		const i = (y * this.width + x) * 4;
		this.data[i] = r;
		this.data[i + 1] = g;
		this.data[i + 2] = b;
		this.data[i + 3] = a;
	}

	rect(x, y, w, h, color) {
		for (let dy = 0; dy < h; dy++) {
			for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color);
		}
	}

	border(x, y, w, h, color) {
		for (let dx = 0; dx < w; dx++) {
			this.set(x + dx, y, color);
			this.set(x + dx, y + h - 1, color);
		}
		for (let dy = 0; dy < h; dy++) {
			this.set(x, y + dy, color);
			this.set(x + w - 1, y + dy, color);
		}
	}

	/** a filled circle, which is all the "creature" shapes need */
	disc(cx, cy, radius, color) {
		for (let dy = -radius; dy <= radius; dy++) {
			for (let dx = -radius; dx <= radius; dx++) {
				if (dx * dx + dy * dy <= radius * radius) this.set(cx + dx, cy + dy, color);
			}
		}
	}
}

/**
 * A deterministic hash, so the speckling on the floor tiles is the same every build and
 * the generated file does not churn in git.
 */
function noise(x, y, salt) {
	let h = Math.imul(x * 374761393 + y * 668265263 + salt * 1442695041, 2246822519);
	h = (h ^ (h >>> 13)) >>> 0;
	return (h % 1000) / 1000;
}

const PALETTE = {
	stone: [96, 96, 104],
	stoneDark: [72, 72, 80],
	stoneLight: [124, 124, 132],
	wall: [58, 54, 62],
	wallTop: [86, 80, 92],
	water: [56, 88, 148],
	waterLight: [78, 118, 184],
	grass: [78, 116, 66],
	door: [132, 96, 52],
	gold: [214, 178, 66],
	hero: [232, 224, 208],
	heroDark: [176, 168, 152],
	rat: [148, 112, 88],
	blob: [116, 168, 92],
	spike: [156, 156, 164],
	rust: [168, 64, 48],
};

/** the tile index each name sits at, exported so the examples do not use magic numbers */
const TILES = {
	FLOOR: 0,
	FLOOR_WORN: 1,
	WALL: 2,
	WALL_TOP: 3,
	WATER: 4,
	GRASS: 5,
	DOOR: 6,
	COIN: 7,
	HERO: 8,
	RAT: 9,
	BLOB: 10,
	EMPTY: 11,
	TRAP: 12,
};

function drawTile(canvas, index, draw) {
	const x = (index % COLUMNS) * TILE;
	const y = Math.floor(index / COLUMNS) * TILE;
	draw(x, y);
}

function buildTileset() {
	const canvas = new Canvas(COLUMNS * TILE, ROWS * TILE);

	//floor: flat stone with a little deterministic speckle so tiling is visible
	drawTile(canvas, TILES.FLOOR, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.stone);
		for (let y = 0; y < TILE; y++) {
			for (let x = 0; x < TILE; x++) {
				const n = noise(x, y, 1);
				if (n > 0.88) canvas.set(ox + x, oy + y, PALETTE.stoneLight);
				else if (n < 0.12) canvas.set(ox + x, oy + y, PALETTE.stoneDark);
			}
		}
	});

	//a second floor variant, so a map does not look like graph paper
	drawTile(canvas, TILES.FLOOR_WORN, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.stone);
		for (let y = 0; y < TILE; y++) {
			for (let x = 0; x < TILE; x++) {
				const n = noise(x, y, 7);
				if (n > 0.72) canvas.set(ox + x, oy + y, PALETTE.stoneDark);
			}
		}
		canvas.rect(ox + 3, oy + 9, 5, 1, PALETTE.stoneDark);
		canvas.rect(ox + 10, oy + 4, 3, 1, PALETTE.stoneDark);
	});

	//wall: brickwork, offset every other course
	drawTile(canvas, TILES.WALL, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.wall);
		for (let row = 0; row < 4; row++) {
			const y = oy + row * 4;
			canvas.rect(ox, y, TILE, 1, PALETTE.wallTop);
			const offset = row % 2 === 0 ? 0 : 8;
			for (let brick = 0; brick < 2; brick++) {
				const x = ox + ((offset + brick * 8) % TILE);
				canvas.rect(x, y, 1, 4, PALETTE.wallTop);
			}
		}
	});

	drawTile(canvas, TILES.WALL_TOP, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.wallTop);
		canvas.border(ox, oy, TILE, TILE, PALETTE.wall);
	});

	drawTile(canvas, TILES.WATER, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.water);
		for (let y = 0; y < TILE; y++) {
			for (let x = 0; x < TILE; x++) {
				if (noise(x, y, 3) > 0.8) canvas.set(ox + x, oy + y, PALETTE.waterLight);
			}
		}
	});

	drawTile(canvas, TILES.GRASS, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.stone);
		for (let x = 0; x < TILE; x++) {
			const height = 3 + Math.floor(noise(x, 0, 5) * 5);
			for (let y = 0; y < height; y++) {
				canvas.set(ox + x, oy + TILE - 1 - y, PALETTE.grass);
			}
		}
	});

	drawTile(canvas, TILES.DOOR, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.wall);
		canvas.rect(ox + 3, oy + 2, 10, 14, PALETTE.door);
		canvas.border(ox + 3, oy + 2, 10, 14, PALETTE.wallTop);
		canvas.rect(ox + 10, oy + 9, 1, 2, PALETTE.gold);
	});

	drawTile(canvas, TILES.COIN, (ox, oy) => {
		canvas.disc(ox + 8, oy + 9, 4, PALETTE.gold);
		canvas.disc(ox + 7, oy + 8, 2, [240, 214, 120]);
	});

	//the "creatures" are simple on purpose: what matters is that they take a colour well
	drawTile(canvas, TILES.HERO, (ox, oy) => {
		canvas.disc(ox + 8, oy + 5, 3, PALETTE.hero);
		canvas.rect(ox + 5, oy + 8, 6, 6, PALETTE.hero);
		canvas.rect(ox + 5, oy + 12, 6, 2, PALETTE.heroDark);
		canvas.set(ox + 7, oy + 5, [40, 40, 48]);
		canvas.set(ox + 9, oy + 5, [40, 40, 48]);
	});

	drawTile(canvas, TILES.RAT, (ox, oy) => {
		canvas.rect(ox + 3, oy + 8, 9, 5, PALETTE.rat);
		canvas.disc(ox + 12, oy + 9, 2, PALETTE.rat);
		canvas.rect(ox + 1, oy + 10, 3, 1, PALETTE.rat);
		canvas.set(ox + 13, oy + 8, [30, 20, 20]);
	});

	drawTile(canvas, TILES.BLOB, (ox, oy) => {
		canvas.disc(ox + 8, oy + 10, 5, PALETTE.blob);
		canvas.disc(ox + 6, oy + 8, 2, [150, 200, 120]);
	});

	//a sprung trap: the same floor a hidden one disguises itself as, plus the spikes a
	//revealed one shows once discovered
	drawTile(canvas, TILES.TRAP, (ox, oy) => {
		canvas.rect(ox, oy, TILE, TILE, PALETTE.stone);
		for (let y = 0; y < TILE; y++) {
			for (let x = 0; x < TILE; x++) {
				const n = noise(x, y, 1);
				if (n > 0.88) canvas.set(ox + x, oy + y, PALETTE.stoneLight);
				else if (n < 0.12) canvas.set(ox + x, oy + y, PALETTE.stoneDark);
			}
		}
		for (const sx of [3, 7, 11]) {
			for (let row = 0; row < 6; row++) {
				const width = 6 - row;
				canvas.rect(ox + sx - Math.floor(width / 2), oy + 13 - row, width, 1, PALETTE.spike);
			}
			canvas.set(ox + sx, oy + 7, PALETTE.rust);
		}
	});

	//TILES.EMPTY is left fully transparent on purpose

	return encodePng(canvas.width, canvas.height, canvas.data);
}

// ------------------------------------------------- backdrop and characters

/**
 * A backdrop for the dialogue example.
 *
 * Crude on purpose: a wall, a floor, a window with light falling from it. Enough for a
 * character to stand in front of and for a scene change to be visible.
 */
function buildBackdrop(palette) {
	const width = 320;
	const height = 180;
	const canvas = new Canvas(width, height);
	const horizon = Math.round(height * 0.62);

	//wall, shaded slightly darker towards the floor
	for (let y = 0; y < horizon; y++) {
		const shade = 1 - (y / horizon) * 0.25;
		canvas.rect(0, y, width, 1, palette.wall.map((c) => Math.round(c * shade)));
	}

	//floor, in perspective-ish bands that get shorter towards the horizon
	for (let y = horizon; y < height; y++) {
		const depth = (y - horizon) / (height - horizon);
		const shade = 0.55 + depth * 0.45;
		canvas.rect(0, y, width, 1, palette.floor.map((c) => Math.round(c * shade)));
	}
	for (let x = 0; x < width; x += 24) {
		for (let y = horizon; y < height; y++) {
			if (noise(x, y, 21) > 0.7) canvas.set(x, y, palette.floorLine);
		}
	}

	//a window, and the light it throws on the floor
	const wx = 210;
	const wy = 24;
	canvas.rect(wx, wy, 64, 56, palette.sky);
	canvas.border(wx - 2, wy - 2, 68, 60, palette.frame);
	canvas.rect(wx + 30, wy, 2, 56, palette.frame);
	canvas.rect(wx, wy + 26, 64, 2, palette.frame);

	for (let y = horizon; y < height; y++) {
		const spread = (y - horizon) * 0.7;
		const left = Math.round(wx - spread * 0.4);
		const width_ = Math.round(64 + spread);
		for (let x = left; x < left + width_; x++) {
			if (x < 0 || x >= 320) continue;
			const i = (y * 320 + x) * 4;
			//lighten what is already there rather than painting over it
			canvas.data[i] = Math.min(255, canvas.data[i] + 26);
			canvas.data[i + 1] = Math.min(255, canvas.data[i + 1] + 24);
			canvas.data[i + 2] = Math.min(255, canvas.data[i + 2] + 14);
		}
	}

	return encodePng(width, height, canvas.data);
}

/**
 * Character parts, drawn one at a time.
 *
 * The figure is decomposed so that every surface a game would want to vary is its own
 * colour: skin, eyes, hair, the upper garment and the lower one. Two characters are then
 * two palettes over the same silhouette, which is how a real game gets a townful of people
 * out of one drawing, and how a player-made character works at all.
 *
 * Frames are 64x96, standing on the bottom edge, and only the face differs between them.
 */
const CHARACTER_FRAME = { width: 64, height: 96 };

/** the expression each frame carries, in the order they are drawn */
const EXPRESSIONS = ['neutral', 'happy', 'cross'];

function shade(color, factor) {
	return color.map((c) => Math.max(0, Math.min(255, Math.round(c * factor))));
}

const PARTS = {
	/** trousers or skirt, plus the shoes below them */
	lower(canvas, ox, palette) {
		canvas.rect(ox + 20, 68, 24, 20, palette.bottom);
		//a gap between the legs, so the silhouette does not read as a single block
		canvas.rect(ox + 31, 76, 2, 12, shade(palette.bottom, 0.6));
		canvas.rect(ox + 19, 88, 11, 5, shade(palette.bottom, 0.45));
		canvas.rect(ox + 34, 88, 11, 5, shade(palette.bottom, 0.45));
	},

	/** shirt and sleeves; the hands are drawn after, so they sit on top of the cuffs */
	upper(canvas, ox, palette) {
		canvas.rect(ox + 19, 43, 26, 26, palette.top);
		canvas.rect(ox + 14, 45, 5, 20, shade(palette.top, 0.85));
		canvas.rect(ox + 45, 45, 5, 20, shade(palette.top, 0.85));
		//a collar, which is what stops the head looking stuck onto a rectangle
		canvas.rect(ox + 27, 43, 10, 3, shade(palette.top, 0.7));
	},

	hands(canvas, ox, palette) {
		canvas.rect(ox + 14, 65, 5, 5, palette.skin);
		canvas.rect(ox + 45, 65, 5, 5, palette.skin);
	},

	head(canvas, ox, palette) {
		//neck first, so the jaw overlaps it
		canvas.rect(ox + 28, 40, 8, 5, shade(palette.skin, 0.85));
		canvas.disc(ox + 32, 30, 13, palette.skin);
	},

	hair(canvas, ox, palette) {
		canvas.disc(ox + 32, 22, 13, palette.hair);
		canvas.rect(ox + 19, 22, 26, 4, palette.hair);
		//sideburns, framing the face
		canvas.rect(ox + 19, 26, 3, 10, palette.hair);
		canvas.rect(ox + 42, 26, 3, 10, palette.hair);
	},

	/** the eyes carry their own colour, with a dark pupil so they read at this size */
	face(canvas, ox, palette, expression) {
		const dark = [28, 24, 30];
		const mouth = shade(palette.skin, 0.55);

		if (expression === 'happy') {
			//closed, curved-up eyes: no iris is visible, so no eye colour here
			canvas.rect(ox + 25, 30, 4, 1, dark);
			canvas.set(ox + 24, 31, dark);
			canvas.set(ox + 29, 31, dark);
			canvas.rect(ox + 35, 30, 4, 1, dark);
			canvas.set(ox + 34, 31, dark);
			canvas.set(ox + 39, 31, dark);

			canvas.rect(ox + 28, 36, 8, 1, mouth);
			canvas.set(ox + 27, 35, mouth);
			canvas.set(ox + 36, 35, mouth);
			return;
		}

		//open eyes: white, iris, pupil
		for (const x of [25, 34]) {
			canvas.rect(ox + x, 28, 5, 4, [242, 240, 238]);
			canvas.rect(ox + x + 1, 29, 3, 3, palette.eyes);
			canvas.rect(ox + x + 2, 30, 1, 2, dark);
		}

		if (expression === 'cross') {
			//brows angled inwards, and a flat mouth
			canvas.rect(ox + 24, 25, 5, 1, palette.hair);
			canvas.set(ox + 29, 26, palette.hair);
			canvas.rect(ox + 35, 25, 5, 1, palette.hair);
			canvas.set(ox + 34, 26, palette.hair);
			canvas.rect(ox + 29, 37, 6, 1, mouth);
		} else {
			canvas.rect(ox + 24, 24, 5, 1, palette.hair);
			canvas.rect(ox + 35, 24, 5, 1, palette.hair);
			canvas.rect(ox + 29, 36, 6, 1, mouth);
		}
	},
};

/**
 * Builds one character sheet from a five-colour palette.
 *
 * @param palette skin, eyes, hair, top, bottom, each an [r, g, b] triple
 */
function buildCharacter(palette) {
	const { width, height } = CHARACTER_FRAME;
	const canvas = new Canvas(width * EXPRESSIONS.length, height);

	EXPRESSIONS.forEach((expression, index) => {
		const ox = index * width;

		//back to front, so each part overlaps the one before it correctly
		PARTS.lower(canvas, ox, palette);
		PARTS.upper(canvas, ox, palette);
		PARTS.hands(canvas, ox, palette);
		PARTS.head(canvas, ox, palette);
		PARTS.hair(canvas, ox, palette);
		PARTS.face(canvas, ox, palette, expression);
	});

	return {
		png: encodePng(canvas.width, canvas.height, canvas.data),
		frameWidth: width,
		frameHeight: height,
		expressions: EXPRESSIONS.length,
	};
}

// ------------------------------------------------------------------- SVG

/**
 * A small vector icon, to verify SVG textures actually load through the compiled `data:`
 * URI path (roadmap item 15) - not just resolve to one. `tools/compile-resources` already
 * lists the MIME type; whether Pixi's SVG parser rasterises a `data:image/svg+xml` source
 * correctly when it is reached through an *aliased* path with no `.svg` on the URL itself
 * is the part that needed checking, not assumed from the MIME entry alone.
 */
function buildGemIcon() {
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
		'<polygon points="16,2 30,12 25,30 7,30 2,12" fill="#d6b242" stroke="#8a6a1e" stroke-width="1.5"/>' +
		'<polygon points="16,2 30,12 16,16" fill="#f0d97a"/>' +
		'<polygon points="2,12 16,16 7,30" fill="#b8901e"/>' +
		'</svg>\n'
	);
}

// ---------------------------------------------------------------- sound

const SAMPLE_RATE = 22050;

function encodeWav(samples) {
	const data = Buffer.alloc(samples.length * 2);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		data.writeInt16LE(Math.round(clamped * 0x7fff), i * 2);
	}

	const header = Buffer.alloc(44);
	header.write('RIFF', 0, 'ascii');
	header.writeUInt32LE(36 + data.length, 4);
	header.write('WAVE', 8, 'ascii');
	header.write('fmt ', 12, 'ascii');
	header.writeUInt32LE(16, 16); //chunk size
	header.writeUInt16LE(1, 20); //PCM
	header.writeUInt16LE(1, 22); //mono
	header.writeUInt32LE(SAMPLE_RATE, 24);
	header.writeUInt32LE(SAMPLE_RATE * 2, 28); //byte rate
	header.writeUInt16LE(2, 32); //block align
	header.writeUInt16LE(16, 34); //bits per sample
	header.write('data', 36, 'ascii');
	header.writeUInt32LE(data.length, 40);

	return Buffer.concat([header, data]);
}

/**
 * @param duration seconds
 * @param voice receives the time in seconds and the progress 0..1, returns -1..1
 */
function synth(duration, voice) {
	const count = Math.floor(duration * SAMPLE_RATE);
	const samples = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		samples[i] = voice(i / SAMPLE_RATE, i / count);
	}
	return samples;
}

const decay = (progress, sharpness = 5) => Math.exp(-sharpness * progress);
const square = (phase) => (Math.sin(phase) >= 0 ? 1 : -1);

const SOUNDS = {
	//a short blip: menus, picking things up
	'blip.wav': synth(0.09, (t, p) => 0.35 * decay(p, 9) * square(2 * Math.PI * 880 * t)),

	//a duller thud, pitched down over its length: a step, a door
	'step.wav': synth(0.12, (t, p) => 0.3 * decay(p, 12) * Math.sin(2 * Math.PI * (220 - 90 * p) * t)),

	//noise burst plus a low tone: a hit landing
	'hit.wav': synth(0.16, (t, p) => {
		const noiseValue = (noise(Math.floor(t * SAMPLE_RATE), 0, 11) - 0.5) * 2;
		return decay(p, 14) * (0.35 * noiseValue + 0.25 * Math.sin(2 * Math.PI * 140 * t));
	}),

	//a rising two-note figure: something good happened
	'pickup.wav': synth(0.22, (t, p) => {
		const frequency = p < 0.5 ? 660 : 990;
		return 0.28 * decay(p, 4) * square(2 * Math.PI * frequency * t);
	}),
};

/**
 * A short melody loop: `notesHz` played one after another over `duration`, each with its
 * own soft attack/decay so consecutive notes do not click into each other. For
 * `examples/audio`'s `Music.playTracks` demo - three of these, not one, is the whole point:
 * a playlist needs more than one track to show a "several tracks" behaviour at all.
 */
function melody(duration, notesHz, waveform) {
	const noteDuration = duration / notesHz.length;
	return synth(duration, (t) => {
		const index = Math.min(notesHz.length - 1, Math.floor(t / noteDuration));
		const localP = (t - index * noteDuration) / noteDuration;
		return 0.25 * Math.sin(Math.PI * localP) * waveform(2 * Math.PI * notesHz[index] * t);
	});
}

const MUSIC = {
	//C E G C, sine - a gentle, rising figure
	'tune_dawn.wav': melody(4, [261.63, 329.63, 392.0, 523.25], Math.sin),
	//G B D F, square - punchier, for an active scene
	'tune_march.wav': melody(4, [196.0, 246.94, 293.66, 349.23], square),
	//A C F C(low), sine - a descending figure, for a quieter moment
	'tune_dusk.wav': melody(4, [220.0, 261.63, 174.61, 130.81], Math.sin),
};

// ---------------------------------------------------------------- write it out

await mkdir(OUT, { recursive: true });

const png = buildTileset();
await writeFile(join(OUT, 'tiles.png'), png);

const backdrop = buildBackdrop({
	wall: [72, 62, 78],
	floor: [96, 78, 62],
	floorLine: [78, 62, 48],
	sky: [126, 168, 208],
	frame: [52, 44, 56],
});
await writeFile(join(OUT, 'backdrop_room.png'), backdrop);

//two people, one silhouette: only the five colours differ
const characters = {
	'char_alice.png': buildCharacter({
		skin: [236, 198, 168],
		eyes: [64, 128, 92],
		hair: [168, 84, 52],
		top: [188, 92, 108],
		bottom: [58, 62, 96],
	}),
	'char_bob.png': buildCharacter({
		skin: [166, 122, 92],
		eyes: [78, 108, 168],
		hair: [42, 38, 40],
		top: [96, 148, 120],
		bottom: [92, 78, 62],
	}),
};
for (const [name, character] of Object.entries(characters)) {
	await writeFile(join(OUT, name), character.png);
}

for (const [name, samples] of Object.entries(SOUNDS)) {
	await writeFile(join(OUT, name), encodeWav(samples));
}

for (const [name, samples] of Object.entries(MUSIC)) {
	await writeFile(join(OUT, name), encodeWav(samples));
}

const gemIcon = buildGemIcon();
await writeFile(join(OUT, 'icon_gem.svg'), gemIcon);

//the examples import this rather than hard-coding tile numbers and frame sizes
await writeFile(
	join(OUT, 'tiles.json'),
	JSON.stringify(
		{
			tileSize: TILE,
			columns: COLUMNS,
			rows: ROWS,
			tiles: TILES,
			character: {
				frameWidth: CHARACTER_FRAME.width,
				frameHeight: CHARACTER_FRAME.height,
				expressions: Object.fromEntries(EXPRESSIONS.map((name, i) => [name, i])),
			},
		},
		null,
		'\t'
	) + '\n',
	'utf8'
);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`tiles.png   ${kb(png.length)}  (${COLUMNS}x${ROWS} tiles of ${TILE}px)`);
console.log(`backdrop_room.png ${kb(backdrop.length)}  (320x180)`);
for (const [name, character] of Object.entries(characters)) {
	console.log(`${name.padEnd(12)}${kb(character.png.length)}  (${character.expressions} expressions of ${character.frameWidth}x${character.frameHeight})`);
}
for (const [name, samples] of Object.entries(SOUNDS)) {
	console.log(`${name.padEnd(12)}${kb(samples.length * 2 + 44)}`);
}
for (const [name, samples] of Object.entries(MUSIC)) {
	console.log(`${name.padEnd(14)}${kb(samples.length * 2 + 44)}`);
}
console.log(`icon_gem.svg${kb(gemIcon.length)}`);
console.log('\nwritten to examples/assets - generated, so redistributable under the project licence');
