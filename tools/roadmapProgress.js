// MWG-based visualizer for ROADMAP.md: displays an overall completion bar,
// per-section or per-batch progress bars, and an open items summary.
// Uses mwg's two-d.Game, Scene2D, ui.Bar and ui.Label widgets loaded from the
// standalone global build (see roadmap-progress.html).
'use strict';

/**
 * The 1.0 exit checklist is checks to run rather than numbered capabilities, so it is reported
 * beside the numbered list instead of being mixed into its counts: that separation is the
 * roadmap process speaking, not an accident. It is still surfaced, because a dashboard that
 * hides an open release gate is worse than one that shows two kinds of work.
 */
function summarizeChecklist(items) {
	const boxes = items.filter((item) => item.type === 'checkbox');
	if (boxes.length === 0) return null;
	const open = boxes.filter((item) => !item.done);
	return {
		name: boxes[0].heading || 'Checklist',
		done: boxes.length - open.length,
		total: boxes.length,
		open,
	};
}

/**
 * Parses markdown roadmaps supporting both:
 * 1. Checkbox conventions (`- [ ]` / `- [x]`, grouped under `## ` section headers)
 * 2. Numbered items (`1. ~~shipped~~`, `~~1. shipped~~` / `2. open item`, with or without
 *    section headers)
 */
function parseRoadmap(markdown) {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const sections = [];
	let currentSection = null;
	// Nearest heading of any level, kept only to name the group an item belongs to (the 1.0
	// checklist sits under `### 1.0 exit checklist`). Sectioning itself stays `##`-only.
	let currentHeading = null;
	const items = [];

	for (const line of lines) {
		const labelMatch = line.match(/^#{1,6}\s+(.+)$/);
		if (labelMatch) currentHeading = labelMatch[1].trim();

		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			currentSection = { name: headingMatch[1].trim(), done: 0, total: 0, items: [] };
			sections.push(currentSection);
			continue;
		}

		const checkboxMatch = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.*)$/);
		if (checkboxMatch) {
			const done = checkboxMatch[1].toLowerCase() === 'x';
			const text = checkboxMatch[2].trim();
			const item = { type: 'checkbox', done, text, heading: currentHeading };
			items.push(item);
			if (currentSection) {
				currentSection.total++;
				if (done) currentSection.done++;
				currentSection.items.push(item);
			}
			continue;
		}

		// Both strikethrough conventions mean done: `12. ~~text~~` and `~~12. text~~`. Only the
		// first used to be seen, and the roadmap writes nine real items (205-213) the second
		// way, so they were counted nowhere and never reached the item panel.
		const numberedMatch = line.match(/^\s*(~~\s*)?(\d+)\.\s+(.*)$/);
		if (numberedMatch) {
			const num = parseInt(numberedMatch[2], 10);
			const rawText = numberedMatch[3].trim();
			const done = Boolean(numberedMatch[1]) || rawText.startsWith('~~');
			const item = { type: 'numbered', num, done, text: rawText };
			items.push(item);
			if (currentSection) {
				currentSection.total++;
				if (done) currentSection.done++;
				currentSection.items.push(item);
			}
			continue;
		}
	}

	const activeSections = sections.filter((s) => s.total > 0);
	if (activeSections.length > 0) {
		let overallDone = 0;
		let overallTotal = 0;
		for (const section of activeSections) {
			overallDone += section.done;
			overallTotal += section.total;
		}
		return {
			sections: activeSections,
			overallDone,
			overallTotal,
			openItems: items.filter((i) => !i.done),
			allItems: items,
		};
	}

	const numberedItems = items.filter((i) => i.type === 'numbered');
	if (numberedItems.length > 0) {
		let overallDone = 0;
		const overallTotal = numberedItems.length;
		for (const item of numberedItems) {
			if (item.done) overallDone++;
		}

		const groupSize = 25;
		const groupedSections = [];
		for (let i = 0; i < numberedItems.length; i += groupSize) {
			const chunk = numberedItems.slice(i, i + groupSize);
			const startNum = chunk[0].num;
			const endNum = chunk[chunk.length - 1].num;
			const chunkDone = chunk.filter((c) => c.done).length;
			groupedSections.push({
				name: `Items ${startNum} - ${endNum}`,
				done: chunkDone,
				total: chunk.length,
				items: chunk,
			});
		}

		return {
			sections: groupedSections,
			overallDone,
			overallTotal,
			openItems: numberedItems.filter((i) => !i.done),
			allItems: numberedItems,
			checklist: summarizeChecklist(items),
		};
	}

	const checkboxItems = items.filter((i) => i.type === 'checkbox');
	if (checkboxItems.length > 0) {
		const overallDone = checkboxItems.filter((i) => i.done).length;
		const overallTotal = checkboxItems.length;
		return {
			sections: [
				{
					name: 'Tasks',
					done: overallDone,
					total: overallTotal,
					items: checkboxItems,
				},
			],
			overallDone,
			overallTotal,
			openItems: checkboxItems.filter((i) => !i.done),
			allItems: checkboxItems,
			checklist: summarizeChecklist(items),
		};
	}

	return { sections: [], overallDone: 0, overallTotal: 0, openItems: [], allItems: [], checklist: null };
}

const Scene2DBase = typeof mw_games !== 'undefined' && mw_games.Scene2D ? mw_games.Scene2D : class {};

class RoadmapScene extends Scene2DBase {
	create() {
		const data = window.__roadmapData;
		const left = 24;
		let y = 20;

		if (!data || data.overallTotal === 0) {
			const missingLabel = new mw_games.Label({
				text: 'No roadmap data found. Serve this page over HTTP or embed ROADMAP.md in roadmap-data.',
				size: 14,
				color: 0xff6b6b,
			});
			missingLabel.position.set(left, y);
			this.stage.addChild(missingLabel);
			return;
		}

		const { sections, overallDone, overallTotal, openItems } = data;
		const barWidth = 460;
		const rowHeight = 32;

		const title = new mw_games.Label({
			text: 'mwg - ROADMAP.md progress',
			size: 20,
			bold: true,
			color: 0xffffff,
		});
		title.position.set(left, y);
		this.stage.addChild(title);
		y += 40;

		const overallPct = overallTotal > 0 ? Math.round((100 * overallDone) / overallTotal) : 0;
		const overallLabel = new mw_games.Label({
			text: `Overall: ${overallDone}/${overallTotal} (${overallPct}%)`,
			size: 16,
			bold: true,
			color: 0xffd166,
		});
		overallLabel.position.set(left, y);
		this.stage.addChild(overallLabel);
		y += 24;

		const overallBar = new mw_games.Bar({
			width: barWidth,
			height: 18,
			color: 0xffd166,
			value: overallDone,
			max: Math.max(1, overallTotal),
		});
		overallBar.position.set(left, y);
		this.stage.addChild(overallBar);
		y += 36;

		for (const section of sections) {
			const pct = section.total > 0 ? Math.round((100 * section.done) / section.total) : 0;
			const label = new mw_games.Label({
				text: `${section.name}  (${section.done}/${section.total} - ${pct}%)`,
				size: 13,
				color: 0xdddddd,
			});
			label.position.set(left, y);
			this.stage.addChild(label);
			y += 18;

			const barColor = section.done === section.total ? 0x06d6a0 : 0x118ab2;
			const bar = new mw_games.Bar({
				width: barWidth,
				height: 10,
				color: barColor,
				value: section.done,
				max: Math.max(1, section.total),
			});
			bar.position.set(left, y);
			this.stage.addChild(bar);
			y += rowHeight - 18;
		}

		// Checks to run rather than numbered capabilities, but the last gate before 1.0, so the
		// dashboard gives them their own row instead of folding them into the numbered totals.
		const checklist = data.checklist;
		if (checklist && checklist.total > 0) {
			const checklistPct = Math.round((100 * checklist.done) / checklist.total);
			const checklistLabel = new mw_games.Label({
				text: `${checklist.name}  (${checklist.done}/${checklist.total} - ${checklistPct}%)`,
				size: 13,
				color: 0xdddddd,
			});
			checklistLabel.position.set(left, y);
			this.stage.addChild(checklistLabel);
			y += 18;

			const checklistBar = new mw_games.Bar({
				width: barWidth,
				height: 10,
				color: checklist.done === checklist.total ? 0x06d6a0 : 0xffd166,
				value: checklist.done,
				max: Math.max(1, checklist.total),
			});
			checklistBar.position.set(left, y);
			this.stage.addChild(checklistBar);
			y += rowHeight - 18;
		}

		// The checklist's open boxes are checks rather than numbered items, but they are what is
		// left before 1.0, so they belong in the same "what is left" list.
		const pending = [...(openItems || []), ...((checklist && checklist.open) || [])];
		if (pending.length > 0) {
			y += 12;
			const openHeader = new mw_games.Label({
				text: `Open items (${pending.length}):`,
				size: 14,
				bold: true,
				color: 0xf78c6c,
			});
			openHeader.position.set(left, y);
			this.stage.addChild(openHeader);
			y += 20;

			for (const item of pending.slice(0, 8)) {
				const itemText = item.num ? `#${item.num}: ${item.text}` : item.text;
				const trimmed = itemText.length > 70 ? itemText.slice(0, 67) + '...' : itemText;
				const itemLabel = new mw_games.Label({
					text: trimmed,
					size: 12,
					color: 0xbbbbbb,
				});
				itemLabel.position.set(left + 8, y);
				this.stage.addChild(itemLabel);
				y += 18;
			}
			if (pending.length > 8) {
				const moreLabel = new mw_games.Label({
					text: `... and ${pending.length - 8} more open items`,
					size: 12,
					color: 0x888888,
				});
				moreLabel.position.set(left + 8, y);
				this.stage.addChild(moreLabel);
			}
		}
	}
}

// Item management: priority/assignee/status are never part of ROADMAP.md itself (the
// numbered list + `~~done~~` convention stays the single source of truth for what shipped -
// see CLAUDE.md's roadmap process). This is purely local, personal triage state, kept in
// localStorage so it survives a reload but never touches the markdown or git.
const ITEM_META_STORAGE_KEY = 'mwg-roadmap-item-meta-v1';
const PRIORITIES = ['unset', 'low', 'medium', 'high'];
const STATUSES = ['todo', 'in-progress', 'blocked', 'done', 'canceled'];

// Seed defaults for specific items, so a fact already known (this item is blocked on an
// external trigger, not merely untriaged) shows correctly the first time anyone opens this
// tool on any machine, rather than only after someone manually sets it once in their own
// browser's localStorage.
const DEFAULT_ITEM_META = {
	n148: { status: 'blocked' }, // gated on "once a second game needs the same combination"
};

function itemKey(item, index) {
	return item.num != null ? `n${item.num}` : `i${index}`;
}

function loadItemMeta() {
	try {
		if (typeof localStorage === 'undefined') return {};
		const raw = localStorage.getItem(ITEM_META_STORAGE_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch (_) {
		return {};
	}
}

function saveItemMeta(meta) {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(ITEM_META_STORAGE_KEY, JSON.stringify(meta));
		}
	} catch (_) {
		// quota exceeded or storage disabled (private browsing) - metadata just stays in-memory
	}
}

/**
 * Builds the DOM-based item management panel (search/filter/priority/assignee) into
 * `panelEl`. Plain DOM rather than mwg's `ui` widgets: text inputs, selects and a scrolling
 * list are what this needs, and none of that requires a Pixi canvas.
 */
function buildManagementPanel(panelEl, data) {
	const meta = loadItemMeta();
	const items = (data && data.allItems) || [];
	const state = { search: '', onlyOpen: true, priority: 'all', assignee: 'all', status: 'all' };

	function metaFor(key) {
		const base = { priority: 'unset', assignee: '', status: 'todo', note: '' };
		return { ...base, ...DEFAULT_ITEM_META[key], ...meta[key] };
	}

	function assigneeList() {
		const set = new Set();
		for (const item of items) {
			const m = meta[itemKey(item, items.indexOf(item))];
			if (m && m.assignee) set.add(m.assignee);
		}
		return Array.from(set).sort();
	}

	function filteredItems() {
		const search = state.search.trim().toLowerCase();
		return items
			.map((item, index) => ({ item, index, key: itemKey(item, index), m: metaFor(itemKey(item, index)) }))
			.filter(({ item, m }) => {
				if (state.onlyOpen && item.done) return false;
				if (search && !item.text.toLowerCase().includes(search)) return false;
				if (state.priority !== 'all' && m.priority !== state.priority) return false;
				if (state.status !== 'all' && m.status !== state.status) return false;
				if (state.assignee !== 'all' && m.assignee !== state.assignee) return false;
				return true;
			});
	}

	panelEl.innerHTML = '';

	const toolbar = document.createElement('div');
	toolbar.className = 'mwg-rp-toolbar';

	const searchInput = document.createElement('input');
	searchInput.type = 'search';
	searchInput.placeholder = 'Search item text...';
	searchInput.className = 'mwg-rp-search';
	toolbar.appendChild(searchInput);

	const onlyOpenLabel = document.createElement('label');
	onlyOpenLabel.className = 'mwg-rp-check';
	const onlyOpenCheckbox = document.createElement('input');
	onlyOpenCheckbox.type = 'checkbox';
	onlyOpenCheckbox.checked = state.onlyOpen;
	onlyOpenLabel.appendChild(onlyOpenCheckbox);
	onlyOpenLabel.appendChild(document.createTextNode(' Only items to process (open)'));
	toolbar.appendChild(onlyOpenLabel);

	function makeSelect(options, labelText) {
		const wrap = document.createElement('label');
		wrap.className = 'mwg-rp-select-wrap';
		wrap.appendChild(document.createTextNode(labelText + ' '));
		const select = document.createElement('select');
		for (const opt of options) {
			const o = document.createElement('option');
			o.value = opt;
			o.textContent = opt;
			select.appendChild(o);
		}
		wrap.appendChild(select);
		return { wrap, select };
	}

	const priorityFilter = makeSelect(['all', ...PRIORITIES], 'Priority:');
	toolbar.appendChild(priorityFilter.wrap);

	const statusFilter = makeSelect(['all', ...STATUSES], 'Status:');
	toolbar.appendChild(statusFilter.wrap);

	const assigneeFilter = makeSelect(['all'], 'Assignee:');
	toolbar.appendChild(assigneeFilter.wrap);

	function refreshAssigneeOptions() {
		const current = assigneeFilter.select.value || 'all';
		assigneeFilter.select.innerHTML = '';
		for (const opt of ['all', ...assigneeList()]) {
			const o = document.createElement('option');
			o.value = opt;
			o.textContent = opt === 'all' ? 'all' : opt;
			assigneeFilter.select.appendChild(o);
		}
		assigneeFilter.select.value = Array.from(assigneeFilter.select.options).some((o) => o.value === current)
			? current
			: 'all';
	}

	const summary = document.createElement('div');
	summary.className = 'mwg-rp-summary';

	const list = document.createElement('div');
	list.className = 'mwg-rp-list';

	const io = document.createElement('div');
	io.className = 'mwg-rp-io';
	const exportBtn = document.createElement('button');
	exportBtn.textContent = 'Export metadata';
	const importBtn = document.createElement('button');
	importBtn.textContent = 'Import metadata';
	const ioArea = document.createElement('textarea');
	ioArea.className = 'mwg-rp-io-area';
	ioArea.style.display = 'none';
	io.appendChild(exportBtn);
	io.appendChild(importBtn);
	io.appendChild(ioArea);

	exportBtn.addEventListener('click', () => {
		ioArea.style.display = 'block';
		ioArea.value = JSON.stringify(meta, null, 2);
		ioArea.readOnly = true;
		ioArea.select();
	});

	importBtn.addEventListener('click', () => {
		if (ioArea.style.display === 'block' && ioArea.readOnly === false) {
			try {
				const parsed = JSON.parse(ioArea.value || '{}');
				Object.assign(meta, parsed);
				saveItemMeta(meta);
				render();
			} catch (e) {
				window.alert('Invalid JSON: ' + e.message);
			}
			return;
		}
		ioArea.style.display = 'block';
		ioArea.readOnly = false;
		ioArea.value = '';
		ioArea.placeholder = 'Paste exported metadata JSON here, then click "Import metadata" again to apply.';
		ioArea.focus();
	});

	function render() {
		refreshAssigneeOptions();
		const rows = filteredItems();
		summary.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'} shown (of ${items.length} total)`;

		list.innerHTML = '';
		for (const { item, key, m } of rows) {
			const row = document.createElement('div');
			row.className = 'mwg-rp-row' + (item.done ? ' mwg-rp-row-done' : '');

			const head = document.createElement('div');
			head.className = 'mwg-rp-row-head';
			const label = item.num != null ? `#${item.num}` : '-';
			head.textContent = `${label} ${item.done ? '[shipped]' : '[open]'} `;

			const text = document.createElement('span');
			text.className = 'mwg-rp-row-text';
			text.textContent = item.text.replace(/~~/g, '');
			head.appendChild(text);
			row.appendChild(head);

			const controls = document.createElement('div');
			controls.className = 'mwg-rp-row-controls';

			const prioritySelect = makeSelect(PRIORITIES, 'Priority').select;
			prioritySelect.value = m.priority;
			prioritySelect.addEventListener('change', () => {
				meta[key] = { ...metaFor(key), priority: prioritySelect.value };
				saveItemMeta(meta);
			});
			controls.appendChild(prioritySelect);

			const statusSelect = makeSelect(STATUSES, 'Status').select;
			statusSelect.value = m.status;
			statusSelect.addEventListener('change', () => {
				meta[key] = { ...metaFor(key), status: statusSelect.value };
				saveItemMeta(meta);
			});
			controls.appendChild(statusSelect);

			const assigneeInput = document.createElement('input');
			assigneeInput.type = 'text';
			assigneeInput.placeholder = 'assignee';
			assigneeInput.value = m.assignee;
			assigneeInput.className = 'mwg-rp-assignee-input';
			assigneeInput.addEventListener('change', () => {
				meta[key] = { ...metaFor(key), assignee: assigneeInput.value.trim() };
				saveItemMeta(meta);
				refreshAssigneeOptions();
			});
			controls.appendChild(assigneeInput);

			row.appendChild(controls);
			list.appendChild(row);
		}
	}

	searchInput.addEventListener('input', () => {
		state.search = searchInput.value;
		render();
	});
	onlyOpenCheckbox.addEventListener('change', () => {
		state.onlyOpen = onlyOpenCheckbox.checked;
		render();
	});
	priorityFilter.select.addEventListener('change', () => {
		state.priority = priorityFilter.select.value;
		render();
	});
	statusFilter.select.addEventListener('change', () => {
		state.status = statusFilter.select.value;
		render();
	});
	assigneeFilter.select.addEventListener('change', () => {
		state.assignee = assigneeFilter.select.value;
		render();
	});

	panelEl.appendChild(toolbar);
	panelEl.appendChild(summary);
	panelEl.appendChild(list);
	panelEl.appendChild(io);

	render();
}

async function loadRoadmapMarkdown() {
	if (typeof window !== 'undefined' && typeof window.__ROADMAP_MARKDOWN__ === 'string') {
		return window.__ROADMAP_MARKDOWN__;
	}
	if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
		const embedded = document.getElementById('roadmap-data');
		if (embedded && embedded.textContent && embedded.textContent.trim().length > 0) {
			return embedded.textContent;
		}
	}
	if (typeof fetch === 'function') {
		try {
			const response = await fetch('../ROADMAP.md');
			if (response.ok) {
				return await response.text();
			}
		} catch (_) {
			// fetch fails on file:// protocol in standard browsers
		}
	}
	return null;
}

if (typeof window !== 'undefined') {
	window.parseRoadmap = parseRoadmap;
	window.RoadmapScene = RoadmapScene;
	window.loadRoadmapMarkdown = loadRoadmapMarkdown;

	window.buildManagementPanel = buildManagementPanel;

	if (
		typeof document !== 'undefined' &&
		typeof document.getElementById === 'function' &&
		!window.__MWG_ROADMAP_NO_AUTOSTART__
	) {
		(async () => {
			const markdown = await loadRoadmapMarkdown();
			window.__roadmapData = markdown ? parseRoadmap(markdown) : null;

			const canvasWrap = document.getElementById('mwg-roadmap-canvas-wrap');
			if (typeof mw_games !== 'undefined' && mw_games.Game) {
				const gameOptions = canvasWrap
					? { background: 0x14161c, resizeTo: canvasWrap }
					: { background: 0x14161c, resizeTo: window };
				const game = new mw_games.Game(gameOptions);
				await game.start(RoadmapScene);
			}

			const panelEl = document.getElementById('mwg-roadmap-panel');
			if (panelEl && window.__roadmapData) {
				buildManagementPanel(panelEl, window.__roadmapData);
			}
		})();
	}
}

if (typeof globalThis !== 'undefined') {
	globalThis.parseRoadmap = parseRoadmap;
}
