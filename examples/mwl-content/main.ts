import { gameData } from './generated/game-data.ts';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('MWL example is missing #app');

const roots = gameData.roots;
const byTag = (tag: string) => roots.filter((node) => node.tag === tag);
const attributes = (node: { attributes: Readonly<Record<string, string>> }) => node.attributes;
const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
	);
const card = (title: string, body: string) => `<section class="card"><h2>${title}</h2>${body}</section>`;

const items = byTag('item')
	.map((node) => {
		const attrs = attributes(node);
		return `<li>${escapeHtml(attrs.name ?? attrs.id ?? 'item')}</li>`;
	})
	.join('');
const units = byTag('unit_type')
	.map((node) => {
		const attrs = attributes(node);
		return `<li>${escapeHtml(attrs.name ?? attrs.id ?? 'unit')}</li>`;
	})
	.join('');
const maps = byTag('map')
	.map((node) => {
		const attrs = attributes(node);
		return `<li><code>${escapeHtml(attrs.id ?? 'map')}</code></li>`;
	})
	.join('');
const events = byTag('event')
	.map((node) => {
		const attrs = attributes(node);
		return `<li><code>${escapeHtml(attrs.id ?? 'event')}</code> on ${escapeHtml(attrs.on ?? 'unknown')}</li>`;
	})
	.join('');
const ai = byTag('ai')
	.flatMap((node) => node.children.filter((child) => child.tag === 'behavior'))
	.map((node) => {
		const attrs = attributes(node);
		return `<li><code>${escapeHtml(attrs.hook ?? 'hook')}</code>: ${escapeHtml(attrs.action ?? 'behavior')}</li>`;
	})
	.join('');

app.innerHTML = [
	`<h1>${escapeHtml(attributes(gameData.roots.find((node) => node.tag === 'game') ?? roots[0]).title ?? 'MWL game')}</h1>`,
	'<p>This page consumes generated MWL data. The browser receives no MWL parser and no authored content object literals.</p>',
	card(
		'Compiled catalog',
		`<p><code>${roots.length}</code> roots, <code>${gameData.assets.length}</code> declared assets, <code>${gameData.messages.length}</code> translatable messages.</p>`,
	),
	card('Units', `<ul>${units}</ul>`),
	card('Items', `<ul>${items}</ul>`),
	card('Maps and events', `<ul>${maps}${events}</ul>`),
	card('AI hooks', `<ul>${ai}</ul>`),
].join('');
