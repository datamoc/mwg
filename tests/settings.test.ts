import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Settings, defaultSettings, effectiveMusicVolume, effectiveSfxVolume } from '../src/core/Settings.ts';
import { exportBindings, importBindings, keysFor } from '../src/core/Input.ts';
import type { SaveStorage } from '../src/core/Save.ts';

function memory(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

test('a fresh settings starts at full volume, unmuted, zoom 1, default bindings', () => {
	const restore = exportBindings();
	try {
		const settings = new Settings({ storage: memory() });
		assert.deepEqual(settings.current, defaultSettings());
	} finally {
		importBindings(restore);
	}
});

test('music volume, sfx volume, mute and zoom persist across instances on the same storage', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		const first = new Settings({ storage });
		first.update({ musicVolume: 0.7, sfxVolume: 0.3, muted: true, zoom: 2.5 });
		const second = new Settings({ storage });
		assert.equal(second.current.musicVolume, 0.7);
		assert.equal(second.current.sfxVolume, 0.3);
		assert.equal(second.current.muted, true);
		assert.equal(second.current.zoom, 2.5);
	} finally {
		importBindings(restore);
	}
});

test('volumes clamp to 0..1 and zoom never drops below 0.01', () => {
	const restore = exportBindings();
	try {
		const settings = new Settings({ storage: memory() });
		settings.update({ musicVolume: 2, sfxVolume: -1, zoom: 0 });
		assert.equal(settings.current.musicVolume, 1);
		assert.equal(settings.current.sfxVolume, 0);
		assert.equal(settings.current.zoom, 0.01);
	} finally {
		importBindings(restore);
	}
});

test('a non-finite volume or zoom falls back to its default, not NaN', () => {
	const restore = exportBindings();
	try {
		const settings = new Settings({ storage: memory() });
		settings.update({ musicVolume: NaN, zoom: Number.POSITIVE_INFINITY });
		assert.equal(settings.current.musicVolume, 1);
		assert.equal(settings.current.zoom, 1);
	} finally {
		importBindings(restore);
	}
});

test('muted zeroes both effective volumes while keeping the stored levels', () => {
	assert.equal(effectiveMusicVolume({ musicVolume: 0.7, muted: true }), 0);
	assert.equal(effectiveSfxVolume({ sfxVolume: 0.3, muted: true }), 0);
	assert.equal(effectiveMusicVolume({ musicVolume: 0.7, muted: false }), 0.7);
	assert.equal(effectiveSfxVolume({ sfxVolume: 0.3, muted: false }), 0.3);
});

test('corrupt stored JSON reads as defaults instead of throwing', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		storage.write('mwg-settings:default', '{not json');
		const settings = new Settings({ storage });
		assert.deepEqual(settings.current, defaultSettings());
	} finally {
		importBindings(restore);
	}
});

test('namespaces keep two games sharing storage from reading each other’s settings', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		new Settings({ storage, namespace: 'game-a' }).setMusicVolume(0.2);
		const other = new Settings({ storage, namespace: 'game-b' });
		assert.equal(other.current.musicVolume, 1);
		assert.equal(new Settings({ storage, namespace: 'game-a' }).current.musicVolume, 0.2);
	} finally {
		importBindings(restore);
	}
});

test('stored bindings are applied to Input on load, so a rebind survives a restart', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		new Settings({ storage }).setBindings({ confirm: ['KeyJ'] });
		assert.deepEqual(keysFor('confirm'), ['KeyJ']);
		const reloaded = new Settings({ storage });
		assert.deepEqual(reloaded.current.bindings.confirm, ['KeyJ']);
		assert.deepEqual(keysFor('confirm'), ['KeyJ']);
	} finally {
		importBindings(restore);
	}
});

test('game-defined values like hints or a violence level persist across instances', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		const first = new Settings({ storage });
		assert.equal(first.getCustom('hints', false), false);
		first.setCustom('hints', true);
		first.setCustom('violence', 'reduced');
		const second = new Settings({ storage });
		assert.equal(second.getCustom('hints', false), true);
		assert.equal(second.getCustom('violence', 'full'), 'reduced');
		assert.equal(second.current.custom.hints, true);
	} finally {
		importBindings(restore);
	}
});

test('non-flat custom values in stored JSON are dropped while flat ones survive', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		storage.write(
			'mwg-settings:default',
			JSON.stringify({ custom: { hints: true, nested: { on: true }, list: [1], gone: null } }),
		);
		const settings = new Settings({ storage });
		assert.deepEqual(settings.current.custom, { hints: true });
	} finally {
		importBindings(restore);
	}
});

test('reset returns to defaults and persists them', () => {
	const restore = exportBindings();
	try {
		const storage = memory();
		const settings = new Settings({ storage });
		settings.update({ musicVolume: 0.1, muted: true, zoom: 3 });
		settings.setBindings({ confirm: ['KeyJ'] });
		settings.reset();
		assert.deepEqual(settings.current, defaultSettings());
		assert.deepEqual(new Settings({ storage }).current, defaultSettings());
	} finally {
		importBindings(restore);
	}
});
