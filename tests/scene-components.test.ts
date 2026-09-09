import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../src/core/Scene.ts';
import { SceneComponentHost, type SceneComponent } from '../src/core/SceneComponents.ts';

class HostedScene extends Scene {
	components = new SceneComponentHost<HostedScene>();
	create(): void {}
}

/** records every lifecycle call it receives, in order, for assertions */
function recorder(name: string, log: string[]): SceneComponent<HostedScene> {
	return {
		name,
		create: () => log.push(`${name}:create`),
		update: (_scene, dt) => log.push(`${name}:update:${dt}`),
		resize: (_scene, w, h) => log.push(`${name}:resize:${w}x${h}`),
		onSuspend: () => log.push(`${name}:suspend`),
		onResume: (_scene, result) => log.push(`${name}:resume:${String(result)}`),
		destroy: () => log.push(`${name}:destroy`),
	};
}

test('add runs create immediately, in the order components are added', () => {
	const scene = new HostedScene();
	const log: string[] = [];
	scene.components.add(recorder('map', log), scene);
	scene.components.add(recorder('ui', log), scene);
	assert.deepEqual(log, ['map:create', 'ui:create']);
});

test('update, resize, onSuspend and onResume fan out to every component in registration order', () => {
	const scene = new HostedScene();
	const log: string[] = [];
	scene.components.add(recorder('map', log), scene);
	scene.components.add(recorder('ui', log), scene);
	log.length = 0;

	scene.components.update(scene, 1 / 60);
	scene.components.resize(scene, 800, 600);
	scene.components.onSuspend(scene);
	scene.components.onResume(scene, 'picked');

	assert.deepEqual(log, [
		'map:update:0.016666666666666666',
		'ui:update:0.016666666666666666',
		'map:resize:800x600',
		'ui:resize:800x600',
		'map:suspend',
		'ui:suspend',
		'map:resume:picked',
		'ui:resume:picked',
	]);
});

test('destroy runs in reverse registration order', () => {
	const scene = new HostedScene();
	const log: string[] = [];
	scene.components.add(recorder('map', log), scene);
	scene.components.add(recorder('ui', log), scene);
	log.length = 0;

	scene.components.destroy(scene);
	assert.deepEqual(log, ['ui:destroy', 'map:destroy']);
});

test('get returns a registered component by name; an unknown name throws', () => {
	const scene = new HostedScene();
	const map = recorder('map', []);
	scene.components.add(map, scene);

	assert.equal(scene.components.get('map'), map);
	assert.equal(scene.components.has('missing'), false);
	assert.throws(() => scene.components.get('missing'), /no registration named "missing"/);
});

test('adding two components under the same name throws', () => {
	const scene = new HostedScene();
	scene.components.add(recorder('map', []), scene);
	assert.throws(() => scene.components.add(recorder('map', []), scene), /"map" is already registered/);
});

test('a component with no optional hooks is simply skipped', () => {
	const scene = new HostedScene();
	scene.components.add({ name: 'bare' }, scene);
	assert.doesNotThrow(() => {
		scene.components.update(scene, 1 / 60);
		scene.components.resize(scene, 100, 100);
		scene.components.onSuspend(scene);
		scene.components.onResume(scene, null);
		scene.components.destroy(scene);
	});
});
