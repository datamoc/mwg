import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'pixi.js';

import { installFakeTextMetrics } from './helpers/fakeTextMetrics.ts';
import { DropdownView, type DropdownViewOptions } from '../src/two-d/ui/DropdownView.ts';

/**
 * The dropdown widget over a long list: it shows a window of rows and scrolls the rest, opens with
 * the chosen row in view, answers the keyboard and closes on a press elsewhere. Text cannot be
 * measured without a canvas, so a subclass supplies the label widths.
 */
installFakeTextMetrics();

class FixedWidth extends DropdownView {
	protected override measureLabel(text: string): number {
		return text.length * 10;
	}
}

const levels = (count: number) => Array.from({ length: count }, (_, i) => ({ label: `Level ${i + 1}` }));
const view = (options: Partial<DropdownViewOptions> & { count?: number } = {}) =>
	new FixedWidth({ width: 120, rowHeight: 20, options: levels(options.count ?? 30), ...options });

test('an open list shows at most maxVisibleRows rows and scrolls the rest', () => {
	const dropdown = view({ maxVisibleRows: 6 });
	dropdown.model.open();
	dropdown.refresh();
	assert.equal(dropdown.visibleRows, 6);
	assert.equal(dropdown.scroller?.viewportHeight, 120);
	assert.equal(dropdown.scroller?.contentHeight, 600);
	assert.equal(dropdown.scroller?.scrollable, true);
});

test('a short list shows all its rows and does not scroll', () => {
	const dropdown = view({ count: 3, maxVisibleRows: 6 });
	dropdown.model.open();
	dropdown.refresh();
	assert.equal(dropdown.visibleRows, 3);
	assert.equal(dropdown.scroller?.scrollable, false);
});

test('it opens with the chosen row in view', () => {
	const dropdown = view({ maxVisibleRows: 5, selectedIndex: 20 });
	dropdown.model.open();
	dropdown.refresh();
	const offset = dropdown.scroller?.offset ?? -1;
	assert.ok(offset <= 20 * 20 && offset + 100 >= 21 * 20, `row 20 is inside the window (offset ${offset})`);
});

test('the keyboard opens the list, moves the highlight and picks', () => {
	const dropdown = view({ maxVisibleRows: 5 });
	assert.equal(dropdown.handleKey('x'), false);
	assert.equal(dropdown.handleKey('ArrowDown'), true);
	assert.equal(dropdown.model.isOpen, true);

	dropdown.handleKey('ArrowDown');
	dropdown.handleKey('ArrowDown');
	assert.equal(dropdown.model.highlight, 2);
	dropdown.handleKey('PageDown');
	assert.equal(dropdown.model.highlight, 7);
	dropdown.handleKey('End');
	assert.equal(dropdown.model.highlight, 29);
	assert.ok((dropdown.scroller?.offset ?? 0) > 0, 'the list followed the highlight');
	dropdown.handleKey('Home');
	assert.equal(dropdown.model.highlight, 0);
	dropdown.handleKey('PageDown');

	const chosen: number[] = [];
	dropdown.model.onChange.add(({ index }) => {
		chosen.push(index);
	});
	dropdown.handleKey('Enter');
	assert.deepEqual(chosen, [5]);
	assert.equal(dropdown.model.isOpen, false);
});

test('Escape closes without changing the choice', () => {
	const dropdown = view();
	dropdown.handleKey('Enter');
	dropdown.handleKey('ArrowDown');
	dropdown.handleKey('Escape');
	assert.equal(dropdown.model.isOpen, false);
	assert.equal(dropdown.model.selectedIndex, 0);
});

test('a press outside the button and the list closes it, one inside does not', () => {
	const stage = new Container();
	const dropdown = view({ maxVisibleRows: 5 });
	dropdown.position.set(50, 40);
	stage.addChild(dropdown);
	dropdown.model.open();
	dropdown.refresh();

	assert.equal(dropdown.handleOutsideClick(60, 60), false, 'on the button');
	assert.equal(dropdown.handleOutsideClick(60, 100), false, 'on the list');
	assert.equal(dropdown.model.isOpen, true);
	assert.equal(dropdown.handleOutsideClick(400, 400), true);
	assert.equal(dropdown.model.isOpen, false);
	assert.equal(dropdown.handleOutsideClick(400, 400), false, 'nothing open, nothing to close');
});

test('autoWidth widens the view to the longest label', () => {
	const options = [{ label: 'Short' }, { label: '3. Le Fleuve profond  (verrouillé)' }];
	const fixed = new FixedWidth({ width: 120, options });
	const auto = new FixedWidth({ width: 120, options, autoWidth: true });
	assert.equal(fixed.viewWidth, 120);
	assert.ok(auto.viewWidth > 34 * 10, `fits the long label (${auto.viewWidth})`);
});

test('fitBelow limits the rows to what the viewport leaves under the button', () => {
	const dropdown = view({ maxVisibleRows: 8 });
	assert.equal(dropdown.fitBelow(500, 600), 4);
	assert.equal(dropdown.fitBelow(100, 600), 8);
	assert.equal(dropdown.fitBelow(595, 600), 1);
});
