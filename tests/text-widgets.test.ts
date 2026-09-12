import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MarkupText } from '../src/two-d/ui/MarkupText.ts';
import { RichLabel } from '../src/two-d/ui/RichLabel.ts';
import { Text2D } from '../src/two-d/render/Shape2D.ts';

/**
 * `RichLabel`/`MarkupText` accepting `tagStyles` (item 313). Both construct headlessly - Pixi only
 * needs a renderer to *draw* text, not to build the objects - so the wiring each widget does with
 * the option is checked here directly rather than assumed.
 */

test('MarkupText draws a registered custom tag as a styled run, not literal text', () => {
	const label = new MarkupText({
		text: '<quest>Find the amulet</quest>',
		tagStyles: { quest: { fontSize: 22, fontWeight: 'bold' } },
	});

	assert.equal(label.children.length, 1);
	const run = label.children[0] as Text2D;
	assert.equal(run.text, 'Find the amulet', 'the tag markers are not drawn');
	assert.equal(run.style.fontSize, 22, "the tag's own size reached the run");
	assert.equal(run.style.fontWeight, 'bold', "the tag's own weight reached the run");
});

test('MarkupText leaves a tag literal when no tagStyles names it', () => {
	const label = new MarkupText({ text: '<quest>Find</quest>' });

	assert.equal((label.children[0] as Text2D).text, '<quest>Find</quest>');
});

test('RichLabel keeps a registered tag as an element for HTMLText and passes its style through', () => {
	const label = new RichLabel({ text: '<quest>Find</quest>', tagStyles: { quest: { fill: 0xffaa00 } } });

	assert.equal(label.text, '<quest>Find</quest>', 'the tag survives escaping while registered');
	assert.ok(label.style.tagStyles?.quest, 'the tag style reached the HTMLTextStyle');
});

test('RichLabel still escapes a tag once nothing registers it', () => {
	const label = new RichLabel({ text: '<quest>Find</quest>' });

	assert.equal(label.text, '&lt;quest&gt;Find&lt;/quest&gt;');
});
