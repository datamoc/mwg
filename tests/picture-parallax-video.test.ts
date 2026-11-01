import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sprite, Texture, TextureSource, TilingSprite } from 'pixi.js';

import { Picture, PictureLayer } from '../src/two-d/render/PictureLayer.ts';
import { ParallaxLayer, parallaxScroll } from '../src/two-d/render/ParallaxLayer.ts';
import type { Texture2D } from '../src/two-d/render/Types2D.ts';
import { VideoOverlay } from '../src/two-d/render/VideoOverlay.ts';

/** a real, empty texture of the given size: safe to build without a renderer */
function blank(width = 32, height = 16): Texture {
	return new Texture({ source: new TextureSource({ width, height }) });
}

/** the smallest thing the layer reads off a texture, for the scroll maths */
function stub(width = 32, height = 16): Texture2D {
	return { width, height } as unknown as Texture2D;
}

// ------------------------------------------------------------------ PictureLayer

test('show creates a picture the layer addresses by name', () => {
	const layer = new PictureLayer();
	const picture = layer.show('title', { texture: blank(), x: 10, y: 20 });

	assert.ok(picture instanceof Picture);
	assert.equal(layer.get('title'), picture);
	assert.equal(layer.has('title'), true);
	assert.equal(picture.name, 'title');
	assert.equal(picture.x, 10);
	assert.equal(picture.y, 20);
	assert.equal(layer.size, 1);
	assert.equal(layer.container.children.length, 1);
});

test('names reads bottom to top in insertion order until a zIndex says otherwise', () => {
	const layer = new PictureLayer();
	layer.show('a');
	layer.show('b');
	layer.show('c');

	assert.deepEqual([...layer.names], ['a', 'b', 'c']);

	layer.show('d', { zIndex: -1 });
	layer.show('e', { zIndex: 2 });

	assert.deepEqual([...layer.names], ['d', 'a', 'b', 'c', 'e'], 'an explicit zIndex sorts against the defaults');
	assert.deepEqual(
		(layer.container.children as Picture[]).map((child) => child.name),
		['d', 'a', 'b', 'c', 'e'],
		'the display list agrees with names',
	);
});

test('showing an existing name replaces it in place, keeping the sprite and its slot', () => {
	const layer = new PictureLayer();
	const texture = blank();
	const first = layer.show('sky', { texture, x: 0 });
	layer.show('grass');
	layer.show('sky', { x: 40 });

	assert.equal(layer.get('sky'), first, 'the same picture, not a replacement sprite');
	assert.equal(first.x, 40, 'the patch was applied');
	assert.equal(first.texture, texture, 'omitting texture keeps the art');
	assert.deepEqual([...layer.names], ['sky', 'grass'], 'its slot in the stack is untouched');
});

test('a direct setZIndex re-sorts the stack the picture belongs to', () => {
	const layer = new PictureLayer();
	layer.show('a');
	layer.show('b');
	layer.show('c');

	layer.get('a')?.setZIndex(10);

	assert.deepEqual([...layer.names], ['b', 'c', 'a']);
	assert.equal(layer.container.children[2], layer.get('a'));
});

test('a zIndex in a replace patch re-sorts too', () => {
	const layer = new PictureLayer();
	layer.show('a');
	layer.show('b');

	layer.show('a', { zIndex: 3 });

	assert.deepEqual([...layer.names], ['b', 'a']);
	assert.equal(layer.container.children[1], layer.get('a'));
});

test('bringToFront and sendToBack move past whatever zIndex the rest carry', () => {
	const layer = new PictureLayer();
	layer.show('a', { zIndex: 5 });
	layer.show('b');
	layer.show('c');

	assert.equal(layer.bringToFront('b'), true);
	assert.deepEqual([...layer.names], ['c', 'a', 'b']);
	assert.equal(layer.get('b')?.zIndex, 6);

	assert.equal(layer.sendToBack('c'), true);
	assert.deepEqual([...layer.names], ['c', 'a', 'b']);
	assert.equal(layer.get('c')?.zIndex, -1);

	assert.equal(layer.bringToFront('missing'), false, 'an unknown name changes nothing');
	assert.equal(layer.sendToBack('missing'), false);
});

test('erase destroys the sprite, and clear takes the whole stack', () => {
	const layer = new PictureLayer();
	const doomed = layer.show('doomed');
	layer.show('kept');

	assert.equal(layer.erase('doomed'), true);
	assert.equal(doomed.destroyed, true);
	assert.equal(layer.has('doomed'), false);
	assert.deepEqual([...layer.names], ['kept'], 'the rest keeps its order');
	assert.equal(layer.erase('doomed'), false, 'erasing twice reports it was already gone');

	layer.clear();
	assert.equal(layer.size, 0);
	assert.equal(layer.container.children.length, 0);

	//a cleared layer is still usable, and the name starts at the top again
	layer.show('again');
	assert.deepEqual([...layer.names], ['again']);
});

test('destroy takes the container and every picture with it', () => {
	const layer = new PictureLayer();
	const picture = layer.show('title');
	const { container } = layer;

	layer.destroy();

	assert.equal(picture.destroyed, true);
	assert.equal(container.destroyed, true);
	assert.equal(layer.size, 0);
});

test('moveTo applies only what the patch sets and reports an unknown name', () => {
	const layer = new PictureLayer();
	const picture = layer.show('sprite', { texture: blank(), x: 1, y: 2, alpha: 1 });

	assert.equal(
		layer.moveTo('sprite', {
			x: 30,
			originX: 0.5,
			originY: 0.5,
			scale: 2,
			rotation: Math.PI,
			alpha: 0.25,
			tint: 0x336699,
			blendMode: 'add',
			visible: false,
		}),
		picture,
	);

	assert.equal(picture.x, 30);
	assert.equal(picture.y, 2, 'an unset field is left alone');
	assert.equal(picture.anchor.x, 0.5);
	assert.equal(picture.anchor.y, 0.5);
	assert.equal(picture.scale.x, 2);
	assert.equal(picture.rotation, Math.PI);
	assert.equal(picture.alpha, 0.25);
	assert.equal(picture.tint, 0x336699);
	assert.equal(picture.blendMode, 'add');
	assert.equal(picture.visible, false);

	assert.equal(layer.moveTo('missing', { x: 0 }), null);
});

test('width and height are the drawn size, so they win over scale', () => {
	const layer = new PictureLayer();
	const picture = layer.show('frame', { texture: blank(32, 16), scale: 3 });
	assert.equal(picture.width, 96, 'scale 3 on a 32 wide texture');

	layer.moveTo('frame', { width: 64, height: 64 });
	assert.equal(picture.width, 64);
	assert.equal(picture.height, 64);
	assert.equal(picture.scale.x, 2, '32 texels drawn 64 wide');
	assert.equal(picture.scale.y, 4);
});

test('rotate and tint address a picture by name', () => {
	const layer = new PictureLayer();
	layer.show('badge');

	assert.equal(layer.rotate('badge', Math.PI / 2), layer.get('badge'));
	assert.equal(layer.get('badge')?.rotation, Math.PI / 2);
	assert.equal(layer.tint('badge', 0xff0000), layer.get('badge'));
	assert.equal(layer.get('badge')?.tint, 0xff0000);

	assert.equal(layer.rotate('missing', 1), null);
	assert.equal(layer.tint('missing', 0xffffff), null);
});

test('setTexture swaps the art without touching the placement', () => {
	const layer = new PictureLayer();
	const picture = layer.show('portrait', { texture: blank(), x: 7 });
	const next = blank(64, 64);

	picture.setTexture(next);
	assert.equal(picture.texture, next);
	assert.equal(picture.x, 7);
});

// ------------------------------------------------------------------ parallax convention

test('parallaxScroll pins a ! basename and loops everything else', () => {
	assert.deepEqual(parallaxScroll('img/parallaxes/Clouds.png'), {
		scrollX: 0.5,
		scrollY: 0.5,
		loopX: true,
		loopY: true,
	});
	assert.deepEqual(parallaxScroll('img/parallaxes/!Sky.png'), {
		scrollX: 0,
		scrollY: 0,
		loopX: false,
		loopY: false,
	});
	assert.deepEqual(parallaxScroll('!Sky.png').loopX, false, 'a bare basename counts too');
	assert.deepEqual(parallaxScroll('C:\\art\\!Night.png').scrollY, 0, 'either separator');
	assert.equal(parallaxScroll('art/!Night.png').loopY, false);
	assert.equal(parallaxScroll('art/Night!.png').loopX, true, 'only a leading ! counts');
});

// ------------------------------------------------------------------ ParallaxLayer

test('a layer looping both axes is one tiling quad that follows the camera at its depth', () => {
	const layer = new ParallaxLayer({ texture: stub(32, 16), width: 64, height: 32 });
	assert.equal(layer.children.length, 1);

	const tiling = layer.children[0] as TilingSprite;
	assert.ok(tiling instanceof TilingSprite);
	assert.equal(tiling.width, 64);
	assert.equal(tiling.height, 32);

	layer.update(1 / 60, { x: 100, y: 20 });
	assert.equal(tiling.tilePosition.x, -50, 'the default depth is half a world');
	assert.equal(tiling.tilePosition.y, -10);

	layer.setScroll(0, 0);
	layer.update(1 / 60, { x: 100, y: 20 });
	assert.equal(tiling.tilePosition.x, 0, 'depth 0 pins the art to the screen');
	assert.equal(tiling.tilePosition.y, 0);

	layer.setScroll(1, 1);
	layer.update(1 / 60, { x: 100, y: 20 });
	assert.equal(tiling.tilePosition.x, -100, 'depth 1 moves with the world');

	layer.update(1 / 60, { x: 100, y: 20, zoom: 2 });
	assert.equal(tiling.tilePosition.x, -200, 'zoom scales the world speed too');
});

test('a layer looping neither axis repeats copies from the art first pixel', () => {
	const layer = new ParallaxLayer({
		texture: stub(32, 16),
		loopX: false,
		loopY: false,
		width: 64,
		height: 32,
		scrollX: 1,
		scrollY: 1,
	});

	//ceil(64 / 32) + 1 by ceil(32 / 16) + 1
	assert.equal(layer.children.length, 9);
	assert.ok(layer.children.every((child) => child instanceof Sprite && !(child instanceof TilingSprite)));

	layer.update(0, { x: 10, y: 0 });
	assert.equal(layer.children[0].x, -10, 'the art moved left with the world, unwrapped');
	assert.equal(layer.children[1].x, 22, 'and repeats one tile to the right');

	const covered = (layer.children as Sprite[]).filter((copy) => copy.visible);
	assert.ok(covered.length > 0, 'the band is still covered this close to the start');

	//far enough along that every copy has left the covered area: no wrapping back into view
	layer.update(0, { x: 1000, y: 0 });
	assert.ok(
		(layer.children as Sprite[]).every((copy) => !copy.visible),
		'a non-looping backdrop runs out instead of wrapping',
	);
});

test('a looping x axis wraps its copies while the y axis does not', () => {
	const layer = new ParallaxLayer({
		texture: stub(32, 16),
		loopX: true,
		loopY: false,
		width: 64,
		height: 32,
		scrollX: 1,
		scrollY: 1,
	});

	layer.update(0, { x: 100, y: 100 });

	//-100 wrapped into (-32, 0]
	assert.equal(layer.children[0].x, -4);
	assert.equal(layer.children[0].y, -100, 'the unlooping axis is left unwrapped');

	const xs = (layer.children as Sprite[]).map((copy) => copy.x);
	assert.ok(
		xs.some((x) => x >= 0 && x < 64),
		'a wrapped axis still covers the left edge of the band',
	);
});

test('offset, opacity and tint reach the art', () => {
	const layer = new ParallaxLayer({
		texture: stub(32, 16),
		loopX: false,
		loopY: false,
		width: 64,
		height: 32,
		scrollX: 1,
		scrollY: 1,
	});

	layer.setOffset(8, 4);
	layer.update(0, { x: 0, y: 0 });
	assert.equal(layer.children[0].x, 8);
	assert.equal(layer.children[0].y, 4);

	layer.setOpacity(0.5);
	assert.equal(layer.alpha, 0.5);

	layer.setTint(0x88aaff);
	assert.equal((layer.children[0] as Sprite).tint, 0x88aaff);

	const tilingLayer = new ParallaxLayer({ texture: stub(), width: 32, height: 16 });
	tilingLayer.setTint(0x123456);
	assert.equal((tilingLayer.children[0] as TilingSprite).tint, 0x123456);
});

test('resolution tiles the art at a different density', () => {
	const copies = new ParallaxLayer({
		texture: stub(32, 16),
		loopX: false,
		loopY: false,
		width: 64,
		height: 32,
		resolution: 2,
	});
	//a 32 texel tile at resolution 2 covers 16 screen units: ceil(64 / 16) + 1 by ceil(32 / 8) + 1
	assert.equal(copies.children.length, 5 * 5);
	assert.equal((copies.children[0] as Sprite).scale.x, 0.5);

	const tiling = new ParallaxLayer({ texture: stub(32, 16), width: 64, height: 32, resolution: 2 });
	assert.equal((tiling.children[0] as TilingSprite).tileScale.x, 0.5);
});

test('the covered area defaults to the art size and follows resize', () => {
	const single = new ParallaxLayer({ texture: stub(40, 24) });
	const tiling = single.children[0] as TilingSprite;
	assert.equal(tiling.width, 40);
	assert.equal(tiling.height, 24);

	single.resize(120, 48);
	assert.equal((single.children[0] as TilingSprite).width, 120);

	const copies = new ParallaxLayer({
		texture: stub(32, 16),
		loopX: false,
		loopY: false,
		width: 64,
		height: 16,
	});
	assert.equal(copies.children.length, 3 * 2);
	copies.resize(128, 16);
	assert.equal(copies.children.length, 5 * 2, 'a wider band needs more copies');
});

test('setTexture rebuilds the art and keeps the covered area', () => {
	const layer = new ParallaxLayer({ texture: stub(32, 16), loopX: false, loopY: false, width: 64, height: 16 });
	const before = layer.children.length;

	layer.setTexture(blank(32, 32));
	assert.equal(layer.children.length, before, 'same width, so the same grid');
	assert.equal((layer.children[0] as Sprite).width, 32);
});

test('update refuses a bad frame or camera rather than drawing nothing', () => {
	const layer = new ParallaxLayer({ texture: stub() });

	assert.throws(() => layer.update(-1, { x: 0, y: 0 }), RangeError);
	assert.throws(() => layer.update(Number.NaN, { x: 0, y: 0 }), RangeError);
	assert.throws(() => layer.update(1 / 60, { x: Number.NaN, y: 0 }), RangeError);
	assert.throws(() => layer.update(1 / 60, { x: 0, y: 0, zoom: 0 }), RangeError);
	assert.throws(() => new ParallaxLayer({ texture: stub(), resolution: 0 }), RangeError);
});

test('the scroll depths are readable back', () => {
	const layer = new ParallaxLayer({ texture: stub(), scrollX: 0.25, scrollY: 0.75, loopX: false, loopY: true });
	assert.equal(layer.scrollX, 0.25);
	assert.equal(layer.scrollY, 0.75);
	assert.equal(layer.loopX, false);
	assert.equal(layer.loopY, true);

	layer.setScroll(1, 0);
	assert.equal(layer.scrollX, 1);
	assert.equal(layer.scrollY, 0);
});

// ------------------------------------------------------------------ VideoOverlay

test('outside a browser the overlay constructs and every call is a safe no-op', async () => {
	const overlay = new VideoOverlay({ width: 320, height: 180 });

	assert.equal(overlay.element, null);
	assert.equal(overlay.playing, false);

	await overlay.play('intro.webm');
	await overlay.play('intro.webm', { loop: true, muted: false, startAt: 2 });

	overlay.pause();
	await overlay.resume();
	overlay.stop();
	overlay.setBounds(1, 2, 3, 4);
	overlay.setVisible(false);
	overlay.dispose();

	assert.equal(overlay.element, null, 'still nothing to dispose of');
	assert.equal(overlay.playing, false);
});

test('a disposed overlay stays a no-op', async () => {
	const overlay = new VideoOverlay();
	overlay.dispose();
	overlay.dispose();

	await overlay.play('late.webm');
	overlay.stop();
	assert.equal(overlay.element, null);
	await overlay.resume();
});

// a stand-in for the browser's video element: only what `VideoOverlay` touches, so the
// element lifecycle (append, play, ended, error, dispose) is testable without a browser
class FakeVideo {
	style: Record<string, string> = {};
	preload = '';
	loop = false;
	muted = false;
	controls = false;
	autoplay = false;
	crossOrigin = '';
	src = '';
	currentSrc = '';
	currentTime = 0;
	readyState = 0;
	paused = true;
	ended = false;
	removed = false;
	refuses = false;

	private readonly listeners = new Map<string, Set<() => void>>();

	play(): Promise<void> {
		if (this.refuses) return Promise.reject(new Error('the browser refused to play it'));
		this.paused = false;
		return Promise.resolve();
	}

	pause(): void {
		this.paused = true;
	}

	load(): void {}

	removeAttribute(name: string): void {
		if (name === 'src') this.src = '';
	}

	remove(): void {
		this.removed = true;
	}

	addEventListener(type: string, listener: () => void): void {
		const listeners = this.listeners.get(type) ?? new Set<() => void>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: () => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	dispatch(type: string): void {
		for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
	}

	listenerCount(type: string): number {
		return this.listeners.get(type)?.size ?? 0;
	}
}

class FakeHost {
	clientWidth = 320;
	clientHeight = 180;
	children: FakeVideo[] = [];

	appendChild(child: FakeVideo): void {
		this.children.push(child);
	}
}

/** installs a fake `document` for one test, returning the elements it hands out */
function installFakeDocument(): { created: FakeVideo[]; host: FakeHost; restore(): void } {
	const created: FakeVideo[] = [];
	const host = new FakeHost();
	const scope = globalThis as unknown as { document?: unknown };
	const had = 'document' in scope;
	const previous = scope.document;
	scope.document = {
		createElement: () => {
			const video = new FakeVideo();
			created.push(video);
			return video;
		},
	} as unknown as Document;
	return {
		created,
		host,
		restore: () => {
			if (had) scope.document = previous;
			else delete scope.document;
		},
	};
}

test('in a browser the overlay creates, positions and removes its own element', () => {
	const { created, host, restore } = installFakeDocument();
	try {
		const overlay = new VideoOverlay({
			container: host as unknown as HTMLElement,
			x: 4,
			y: 6,
			width: 100,
			height: 50,
		});
		const video = created[0];

		assert.equal(overlay.element, video as unknown as HTMLVideoElement);
		assert.deepEqual(host.children, [video], 'appended to the given container');
		assert.equal(video.style.position, 'absolute');
		assert.equal(video.style.left, '4px');
		assert.equal(video.style.top, '6px');
		assert.equal(video.style.width, '100px');
		assert.equal(video.style.height, '50px');
		assert.equal(video.style.pointerEvents, 'none', 'the game keeps the taps by default');

		overlay.setBounds(1, 2, 3, 4);
		assert.equal(video.style.width, '3px');

		overlay.setVisible(false);
		assert.equal(video.style.display, 'none');

		overlay.dispose();
		assert.equal(video.removed, true);
		assert.equal(overlay.element, null);
	} finally {
		restore();
	}
});

test('play resolves on ended or stop, and rejects when the element cannot play', async () => {
	const { created, host, restore } = installFakeDocument();
	try {
		const overlay = new VideoOverlay({ container: host as unknown as HTMLElement });
		const video = created[0];

		const ended = overlay.play('intro.webm');
		assert.equal(video.src, 'intro.webm');
		assert.equal(overlay.playing, true);
		video.ended = true;
		video.dispatch('ended');
		await ended;
		assert.equal(overlay.playing, false);
		assert.equal(video.listenerCount('ended'), 0, 'the listeners go with the clip');

		const stopped = overlay.play('intro.webm');
		overlay.stop();
		await stopped;
		assert.equal(video.paused, true);
		assert.equal(overlay.playing, false);

		const failed = overlay.play('intro.webm');
		video.dispatch('error');
		await assert.rejects(failed, /could not play/);

		video.refuses = true;
		await assert.rejects(overlay.play('missing.webm'), /refused to play/);

		const controlled = new VideoOverlay({ container: host as unknown as HTMLElement, controls: true });
		assert.equal(controlled.element?.style.pointerEvents, 'auto', 'controls need to be clickable');
	} finally {
		restore();
	}
});
