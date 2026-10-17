import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AudioSettings, dynamicsLimit, regionPlaybackRate, softenCutoff } from '../src/audio/Settings.ts';

test('regionPlaybackRate runs an NTSC tune slower on PAL and faster the other way', () => {
	assert.ok(regionPlaybackRate('pal', 'ntsc') < 1, 'PAL is the slower clock');
	assert.ok(Math.abs(regionPlaybackRate('pal', 'ntsc') - 50 / 60) < 1e-12);
	assert.ok(regionPlaybackRate('ntsc', 'pal') > 1);
	assert.equal(regionPlaybackRate('pal', 'pal'), 1);
	assert.equal(regionPlaybackRate('ntsc'), 1, 'authored for NTSC by default');
});

test('softenCutoff only ever lowers the cutoff as soften rises, and respects the rate', () => {
	const open = softenCutoff(0, 44100);
	const mid = softenCutoff(0.5, 44100);
	const full = softenCutoff(1, 44100);
	assert.ok(mid < open && full < mid, 'more soften, lower cutoff, in that order');
	assert.equal(softenCutoff(1, 8000), 3500, 'full soften reaches its floor under the rate');
	assert.equal(softenCutoff(0, 8000), 4000, 'and the open end is capped at half the sample rate');
	assert.equal(softenCutoff(-3, 44100), open, 'clamped below');
});

test('dynamicsLimit is the identity at 0 and pulls hot samples under full scale at 1', () => {
	assert.equal(dynamicsLimit(0.5, 0), 0.5);
	assert.equal(dynamicsLimit(-4, 0), -4);
	assert.ok(dynamicsLimit(4, 1) < 1 && dynamicsLimit(4, 1) > 0.9, 'soft-limited, not clipped flat');
	assert.ok(dynamicsLimit(-4, 1) > -1, 'symmetric on negative peaks');
	assert.ok(Math.abs(dynamicsLimit(0.25, 1)) < 0.25, 'quiet samples are pulled slightly too, the knee is soft');
});

test('AudioSettings clamps its dials, round-trips plain data and answers its rules', () => {
	const settings = new AudioSettings({ preferredEngine: 'retro:mt32', soften: 0.4 });
	settings.setBusVolume('se', 130);
	assert.equal(settings.snapshot().busVolumes.se, 100);
	settings.setBusVolume('bgm', -5);
	assert.equal(settings.snapshot().busVolumes.bgm, 0);

	const copy = new AudioSettings();
	copy.restore(settings.snapshot());
	assert.deepEqual(copy.snapshot(), settings.snapshot(), 'snapshot/restore round-trips');
	assert.equal(copy.snapshot().preferredEngine, 'retro:mt32');

	settings.restore({ region: 'pal', dynamics: 2, outputStage: 'clean' });
	assert.equal(settings.snapshot().dynamics, 1, 'clamped on the way in');
	assert.ok(settings.playbackRate('ntsc') < 1, 'the PAL setting slows NTSC content');
	assert.ok(settings.limit(4) < 1);
	assert.ok(settings.cutoff(44100) < softenCutoff(0.4, 44100), 'a clean stage softens further');
});
