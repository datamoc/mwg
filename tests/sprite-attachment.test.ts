import assert from 'node:assert/strict';
import test from 'node:test';
import { SpriteAttachment } from '../src/two-d/render/SpriteAttachment.ts';

test('follow places the child at the owner position plus the offset', () => {
	const child = { x: 0, y: 0 };
	const shadow = new SpriteAttachment(child, { offsetX: 2, offsetY: 4 });
	shadow.follow(100, 200);
	assert.deepEqual(child, { x: 102, y: 204 });
});

test('follow with no offset tracks the owner exactly', () => {
	const child = { x: 0, y: 0 };
	const attachment = new SpriteAttachment(child);
	attachment.follow(10, -5);
	assert.deepEqual(child, { x: 10, y: -5 });
});

test('with no duration, update always returns false and done stays false', () => {
	const attachment = new SpriteAttachment({ x: 0, y: 0 });
	for (let i = 0; i < 10; i += 1) assert.equal(attachment.update(1), false);
	assert.equal(attachment.done, false);
});

test('with a duration, update reports done exactly once it elapses', () => {
	const attachment = new SpriteAttachment({ x: 0, y: 0 }, { duration: 3 });
	assert.equal(attachment.update(1), false);
	assert.equal(attachment.update(1), false);
	assert.equal(attachment.done, false);
	assert.equal(attachment.update(1), true);
	assert.equal(attachment.done, true);
	assert.equal(attachment.update(1), false, 'no repeated true once expired');
});

test('follow keeps working after the attachment has expired', () => {
	const child = { x: 0, y: 0 };
	const attachment = new SpriteAttachment(child, { duration: 1, offsetY: -10 });
	attachment.update(2);
	assert.equal(attachment.done, true);
	attachment.follow(5, 5);
	assert.deepEqual(child, { x: 5, y: -5 });
});
