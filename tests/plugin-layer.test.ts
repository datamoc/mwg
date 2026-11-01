import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Texture, TextureSource } from 'pixi.js';

import { PluginLayer, PluginSprite } from '../src/two-d/render/PluginLayer.ts';
import type { Texture2D } from '../src/two-d/render/Types2D.ts';

/**
 * The plugin layer is the display half of plugin support, and the point of testing it
 * without a renderer is the same point the bridge itself makes: a plugin's sprite is a
 * sprite whether or not a canvas exists. Everything here asserts what the layer did to a
 * Pixi object, never what a frame looks like.
 */

/** the smallest thing a Sprite reads off a texture, cast the way a stub resolver would */
function stub(width = 32, height = 16): Texture2D {
	return { width, height } as unknown as Texture2D;
}

/** a real, empty texture of the given size, for the tests that need a drawable size */
function blank(width = 8, height = 8): Texture {
	return new Texture({ source: new TextureSource({ width, height }) });
}

/** a resolver that records every URL it was asked for */
function recorder(texture: Texture2D = stub()): { seen: string[]; resolve: (path: string) => Texture2D } {
	const seen: string[] = [];
	return {
		seen,
		resolve: (path: string) => {
			seen.push(path);
			return texture;
		},
	};
}

test('create adds exactly one sprite to the layer and its container', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create({ texture: 'plugin/mist.png' });

	assert.ok(sprite instanceof PluginSprite);
	assert.equal(layer.count, 1);
	assert.deepEqual([...layer.sprites], [sprite]);
	assert.equal(layer.container.children.length, 1);
	assert.equal(layer.container.children[0], sprite);
	assert.equal(sprite.parent, layer.container, 'the sprite is a child of the layer container');
});

test('each create adds one more sprite, in creation order', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const first = layer.create();
	const second = layer.create();

	assert.equal(layer.count, 2);
	assert.deepEqual([...layer.sprites], [first, second]);
	assert.deepEqual([...layer.container.children], [first, second]);
	assert.notEqual(first.id, second.id);
	assert.equal(first.label, first.id, 'label starts as the generated id');
	assert.match(first.id, /^plugin-sprite-\d+$/);
});

test('the resolver receives the plugin URL and its result is the sprite texture', () => {
	const first = stub(64, 32);
	const second = stub(16, 16);
	const { seen, resolve } = recorder(first);
	const layer = new PluginLayer({ texture: resolve });

	const a = layer.create({ texture: 'plugin/mist.png' });
	assert.equal(a.texture, first);

	//a different texture on the next create, through a resolver that can answer per URL
	const perUrl = new PluginLayer({
		texture: (path) => {
			seen.push(path);
			return path === 'plugin/hud.png' ? second : first;
		},
	});
	const b = perUrl.create({ texture: 'plugin/hud.png' });

	assert.deepEqual(seen, ['plugin/mist.png', 'plugin/hud.png']);
	assert.equal(b.texture, second);
});

test('moveTo applies only the fields the patch sets', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create({ x: 5, y: 6, rotation: 0.5, alpha: 0.5, visible: false, zIndex: 3 });

	sprite.moveTo({ x: 20, alpha: 0.25 });

	assert.equal(sprite.x, 20);
	assert.equal(sprite.y, 6, 'y was not in the patch');
	assert.equal(sprite.rotation, 0.5);
	assert.equal(sprite.alpha, 0.25);
	assert.equal(sprite.visible, false);
	assert.equal(sprite.zIndex, 3);
});

test('moveTo accepts a new texture URL and a tone, and leaves the identity alone', () => {
	const next = stub();
	const seen: string[] = [];
	const layer = new PluginLayer({
		texture: (path) => {
			seen.push(path);
			return path === 'next.png' ? next : stub();
		},
	});
	const sprite = layer.create({ texture: 'first.png' });
	const id = sprite.id;

	sprite.moveTo({ texture: 'next.png', tone: { gray: 120 } });

	assert.equal(sprite.texture, next);
	assert.deepEqual(seen, ['first.png', 'next.png']);
	assert.equal(sprite.id, id);
	assert.equal(sprite.tone.gray, 120);
});

test('setTone applies a normalized tone and null clears it', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create();

	assert.equal(sprite.setTone({ red: -20, gray: 200 }), sprite, 'fluent');
	assert.deepEqual({ ...sprite.tone }, { red: -20, green: 0, blue: 0, gray: 200 });

	sprite.setTone(null);
	assert.deepEqual({ ...sprite.tone }, { red: 0, green: 0, blue: 0, gray: 0 });
});

test('various options land: width, height, alpha, visible, blendMode and zIndex', () => {
	const layer = new PluginLayer({ texture: () => blank(8, 8) });
	const sprite = layer.create({
		texture: 'art.png',
		width: 32,
		height: 16,
		alpha: 0.4,
		visible: false,
		blendMode: 'add',
		zIndex: 7,
	});

	assert.equal(sprite.width, 32);
	assert.equal(sprite.height, 16);
	assert.equal(sprite.alpha, 0.4);
	assert.equal(sprite.visible, false);
	assert.equal(sprite.blendMode, 'add');
	assert.equal(sprite.zIndex, 7);
});

test('zIndex orders the container, and a new zIndex re-sorts without a frame', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const high = layer.create({ zIndex: 5 });
	const middle = layer.create();
	const low = layer.create({ zIndex: 1 });

	assert.deepEqual([...layer.container.children], [middle, low, high], 'sorted by zIndex, ties in creation order');

	high.setZIndex(-1);
	assert.deepEqual([...layer.container.children], [high, middle, low]);

	middle.setZIndex(10);
	assert.deepEqual([...layer.container.children], [high, low, middle]);
});

test('a missing texture draws nothing rather than throwing', () => {
	//a resolver that throws is the strictest shape a host could supply
	const throwing = new PluginLayer({
		texture: () => {
			throw new Error('no such asset');
		},
	});
	const sprite = throwing.create({ texture: 'missing.png', x: 3, y: 4 });

	assert.equal(sprite.texture, Texture.EMPTY);
	assert.equal(sprite.x, 3);
	assert.equal(sprite.y, 4);
	assert.equal(throwing.count, 1);

	//and a resolver that answers with nothing, cast the way an untyped host would
	const silent = new PluginLayer({ texture: (() => undefined) as unknown as (path: string) => Texture2D });
	assert.equal(silent.create({ texture: 'gone.png' }).texture, Texture.EMPTY);
	assert.equal(silent.textureFor('gone.png'), null);

	//setTexture follows the same rule
	assert.equal(sprite.setTexture('another-missing.png'), sprite);
	assert.equal(sprite.texture, Texture.EMPTY);
});

test('the default resolver works headless for a path that never loaded', () => {
	const layer = new PluginLayer();
	const sprite = layer.create({ texture: 'never/loaded.png' });

	assert.equal(sprite.texture, Texture.EMPTY);
	assert.equal(layer.count, 1);
});

test('remove destroys the sprite and decrements the count', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const first = layer.create();
	const second = layer.create();

	assert.equal(layer.remove(first), true);
	assert.equal(first.destroyed, true);
	assert.equal(layer.count, 1);
	assert.deepEqual([...layer.sprites], [second]);
	assert.deepEqual([...layer.container.children], [second]);

	assert.equal(layer.remove(first), false, 'already gone');
	assert.equal(layer.count, 1);
});

test('remove refuses a sprite belonging to another layer', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const other = new PluginLayer({ texture: () => stub() });
	const foreign = other.create();

	assert.equal(layer.remove(foreign), false);
	assert.equal(foreign.destroyed, false);
	assert.equal(other.count, 1);
});

test('erase goes back through the owning layer, and twice reports false', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create();

	assert.equal(sprite.erase(), true);
	assert.equal(sprite.destroyed, true);
	assert.equal(layer.count, 0);
	assert.equal(sprite.erase(), false);
});

test('a direct destroy also leaves the layer, so no stale entry survives', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create();

	sprite.destroy();

	assert.equal(sprite.destroyed, true);
	assert.equal(layer.count, 0);
	assert.equal(layer.container.children.length, 0);
});

test('clear destroys every sprite but leaves the layer usable', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const first = layer.create();
	const second = layer.create();

	layer.clear();

	assert.equal(first.destroyed, true);
	assert.equal(second.destroyed, true);
	assert.equal(layer.count, 0);
	assert.deepEqual([...layer.sprites], []);
	assert.equal(layer.container.children.length, 0);

	const later = layer.create();
	assert.equal(layer.count, 1);
	assert.equal(layer.container.children[0], later);
});

test('the layer adds its container to the parent option and takes its zIndex', () => {
	const world = new Container();
	const layer = new PluginLayer({ parent: world, zIndex: 900, texture: () => stub() });

	assert.equal(layer.container.parent, world);
	assert.equal(layer.container.zIndex, 900);
	assert.ok(world.children.includes(layer.container));
});

test('the layer destroy takes the container and every sprite with it', () => {
	const layer = new PluginLayer({ texture: () => stub() });
	const sprite = layer.create();
	const { container } = layer;

	layer.destroy();

	assert.equal(sprite.destroyed, true);
	assert.equal(container.destroyed, true);
	assert.equal(layer.count, 0);
});

test('textureFor answers the same lookup create uses, without creating anything', () => {
	const art = stub();
	const layer = new PluginLayer({ texture: () => art });

	assert.equal(layer.textureFor('anything.png'), art);
	assert.equal(layer.count, 0);
});
