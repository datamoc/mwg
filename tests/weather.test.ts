import { test } from 'node:test';
import assert from 'node:assert/strict';

import { weatherPreset, WeatherLayer } from '../src/two-d/render/Weather.ts';

test('weatherPreset scales count and opacity with power, never speed', () => {
	const full = weatherPreset('rain', { width: 960, height: 540 });
	const half = weatherPreset('rain', { width: 960, height: 540, power: 0.5 });
	assert.ok(full && half);
	assert.equal(half.rate!, full.rate! * 0.5);
	assert.equal(half.max!, Math.ceil(full.max! * 0.5));
	assert.deepEqual(half.speed, full.speed);
	assert.ok(
		(half.alpha as readonly [number, number])[0] < (full.alpha as readonly [number, number])[0],
		'a lighter fall is fainter',
	);
});

test('clear produces no preset, and a non-positive power is treated as clear', () => {
	assert.equal(weatherPreset('clear', { width: 100, height: 100 }), null);
	assert.equal(weatherPreset('snow', { width: 100, height: 100, power: 0 }), null);
	assert.throws(() => weatherPreset('rain', { width: 0, height: 100 }), /positive width and height/);
});

test('snow falls slower and lives longer than rain, and storm is the heaviest', () => {
	const rain = weatherPreset('rain', { width: 960, height: 540 });
	const snow = weatherPreset('snow', { width: 960, height: 540 });
	const storm = weatherPreset('storm', { width: 960, height: 540 });
	assert.ok(rain && snow && storm);
	assert.ok(snow.speed![1] < rain.speed![0]);
	assert.ok(snow.life![1] > rain.life![1]);
	assert.ok(storm.rate! > rain.rate);
});

test('wind leans every kind of fall by the same offset', () => {
	const calm = weatherPreset('rain', { width: 100, height: 100 });
	const windy = weatherPreset('rain', { width: 100, height: 100, wind: 0.2 });
	assert.ok(calm && windy);
	assert.deepEqual(windy.angle, [calm.angle[0] + 0.2, calm.angle[1] + 0.2]);
});

test('the layer emits while a weather is set and stops on clear', () => {
	const weather = new WeatherLayer({ width: 200, height: 100 });
	assert.equal(weather.weather, 'clear');

	weather.setWeather('snow', { power: 1 });
	assert.equal(weather.weather, 'snow');
	for (let frame = 0; frame < 30; frame++) weather.update(1 / 30);
	assert.ok(weather.activeCount > 0);

	weather.setWeather('clear');
	assert.equal(weather.weather, 'clear');
	for (let frame = 0; frame < 400; frame++) weather.update(0.1);
	assert.equal(weather.activeCount, 0, 'no particle outlives a long enough clear');
	weather.clear();
	assert.equal(weather.children.length, 0);
});

test('resizing rebuilds an active weather for the new size and validates the bounds', () => {
	const weather = new WeatherLayer({ width: 200, height: 100 });
	weather.setWeather('rain', { power: 0.5 });
	weather.setBounds(400, 200);
	assert.equal(weather.weather, 'rain');
	assert.throws(() => weather.setBounds(0, 200), /positive/);
});
