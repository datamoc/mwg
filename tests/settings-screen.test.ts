import { test } from 'node:test';
import assert from 'node:assert/strict';

//same stub as list-view.test.ts: pixi.js canvas Text (which Label wraps) measures
//through `document.createElement('canvas')` with no headless fallback; these tests
//never assert on pixel layout, only on row order, persistence and navigation
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
	const context = {
		font: '',
		letterSpacing: '0px',
		textLetterSpacing: '0px',
		measureText: (text: string) => ({
			width: text.length * 6,
			actualBoundingBoxAscent: 8,
			actualBoundingBoxDescent: 2,
		}),
	};
	const canvas = { getContext: () => context, width: 0, height: 0, style: {} };
	(globalThis as { document?: unknown }).document = { createElement: () => canvas };
	(globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
}

import { Settings } from '../src/core/Settings.ts';
import { exportBindings, importBindings, bind } from '../src/core/Input.ts';
import type { SaveStorage } from '../src/core/Save.ts';
import { SettingsScreen } from '../src/two-d/ui/SettingsScreen.ts';

function memory(): SaveStorage {
	const data = new Map<string, string>();
	return {
		read: (key) => data.get(key) ?? null,
		write: (key, value) => void data.set(key, value),
		remove: (key) => void data.delete(key),
		keys: () => [...data.keys()],
	};
}

function guarded<T>(run: () => T): T {
	const restore = exportBindings();
	try {
		return run();
	} finally {
		importBindings(restore);
	}
}

/** walks down from the first row collecting ids, proving order and count */
function rowIds(screen: SettingsScreen, count: number): string[] {
	const ids: string[] = [screen.selectedRow];
	for (let i = 1; i < count; i++) {
		screen.handleAction('down');
		ids.push(screen.selectedRow);
	}
	return ids;
}

test('rows arrive in order: music, sfx, muted, zoom, custom rows, controls, reset', () => {
	guarded(() => {
		const screen = new SettingsScreen({
			settings: new Settings({ storage: memory() }),
			custom: [
				{ kind: 'boolean', key: 'hints', label: 'Hints' },
				{ kind: 'choice', key: 'violence', label: 'Violence', options: ['full', 'reduced'] },
			],
		});
		assert.deepEqual(rowIds(screen, 8), [
			'music',
			'sfx',
			'muted',
			'zoom',
			'custom:hints',
			'custom:violence',
			'controls',
			'reset',
		]);
	});
});

test('left and right on the music row move the persisted volume in the pressed direction', () => {
	guarded(() => {
		const storage = memory();
		const screen = new SettingsScreen({ settings: new Settings({ storage }) });
		assert.equal(screen.selectedRow, 'music');

		screen.handleAction('left');
		assert.equal(new Settings({ storage }).current.musicVolume, 0.9);
		screen.handleAction('right');
		screen.handleAction('right');
		assert.equal(new Settings({ storage }).current.musicVolume, 1);
	});
});

test('confirm on the mute row flips the persisted flag', () => {
	guarded(() => {
		const storage = memory();
		const screen = new SettingsScreen({ settings: new Settings({ storage }) });
		screen.handleAction('down');
		screen.handleAction('down');
		assert.equal(screen.selectedRow, 'muted');

		screen.handleAction('confirm');
		assert.equal(new Settings({ storage }).current.muted, true);
		screen.handleAction('confirm');
		assert.equal(new Settings({ storage }).current.muted, false);
	});
});

test('the zoom slider respects its configured bounds', () => {
	guarded(() => {
		const storage = memory();
		const screen = new SettingsScreen({
			settings: new Settings({ storage }),
			zoomMin: 1,
			zoomMax: 2,
			zoomStep: 0.5,
		});
		for (let i = 0; i < 3; i++) screen.handleAction('down');
		assert.equal(screen.selectedRow, 'zoom');

		for (let i = 0; i < 10; i++) screen.handleAction('right');
		assert.equal(new Settings({ storage }).current.zoom, 2);
		for (let i = 0; i < 10; i++) screen.handleAction('left');
		assert.equal(new Settings({ storage }).current.zoom, 1);
	});
});

test('custom rows persist: toggle, number, and a choice that cycles with wrap', () => {
	guarded(() => {
		const storage = memory();
		const screen = new SettingsScreen({
			settings: new Settings({ storage }),
			custom: [
				{ kind: 'boolean', key: 'hints', label: 'Hints' },
				{ kind: 'number', key: 'scroll', label: 'Scroll', min: 1, max: 5, step: 1 },
				{ kind: 'choice', key: 'violence', label: 'Violence', options: ['full', 'reduced'] },
			],
		});
		for (let i = 0; i < 4; i++) screen.handleAction('down');
		assert.equal(screen.selectedRow, 'custom:hints');
		screen.handleAction('confirm');
		assert.equal(new Settings({ storage }).current.custom.hints, true);

		screen.handleAction('down');
		screen.handleAction('right');
		screen.handleAction('right');
		assert.equal(new Settings({ storage }).current.custom.scroll, 3);

		screen.handleAction('down');
		screen.handleAction('confirm');
		assert.equal(new Settings({ storage }).current.custom.violence, 'reduced');
		screen.handleAction('confirm');
		assert.equal(new Settings({ storage }).current.custom.violence, 'full');
	});
});

test('confirm on the reset row restores persisted defaults', () => {
	guarded(() => {
		const storage = memory();
		const settings = new Settings({ storage });
		settings.update({ musicVolume: 0.2, muted: true, zoom: 3 });
		const screen = new SettingsScreen({ settings });
		for (let i = 0; i < 5; i++) screen.handleAction('down');
		assert.equal(screen.selectedRow, 'reset');

		screen.handleAction('confirm');
		const reloaded = new Settings({ storage }).current;
		assert.equal(reloaded.musicVolume, 1);
		assert.equal(reloaded.muted, false);
		assert.equal(reloaded.zoom, 1);
	});
});

test('the controls page opens, and leaving it persists rebinds made through Input', () => {
	guarded(() => {
		const storage = memory();
		const screen = new SettingsScreen({ settings: new Settings({ storage }), actions: ['confirm'] });
		for (let i = 0; i < 4; i++) screen.handleAction('down');
		assert.equal(screen.selectedRow, 'controls');

		screen.handleAction('confirm');
		assert.equal(screen.isRebinding, true);

		bind('confirm', ['KeyJ']);
		assert.equal(screen.handleAction('cancel'), true);
		assert.equal(screen.isRebinding, false);
		assert.deepEqual(new Settings({ storage }).current.bindings.confirm, ['KeyJ']);
	});
});

test('cancel on the main page is left to the caller, and selection wraps both ends', () => {
	guarded(() => {
		const screen = new SettingsScreen({ settings: new Settings({ storage: memory() }) });
		assert.equal(screen.handleAction('cancel'), false);

		screen.handleAction('up');
		assert.equal(screen.selectedRow, 'reset');
		screen.handleAction('down');
		assert.equal(screen.selectedRow, 'music');
	});
});

test('refresh re-reads values changed behind the screen’s back', () => {
	guarded(() => {
		const settings = new Settings({ storage: memory() });
		const screen = new SettingsScreen({ settings });

		settings.setMusicVolume(0.3);
		screen.refresh();
		screen.handleAction('left');
		assert.equal(settings.current.musicVolume, 0.2);
	});
});
