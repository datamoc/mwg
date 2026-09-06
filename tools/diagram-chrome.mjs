/**
 * The shared visual language of every diagram under `webpage/assets/`.
 *
 * Extracted so the example diagrams (`make-example-diagrams.mjs`) and the architecture
 * diagrams (`make-architecture-diagrams.mjs`) cannot drift apart into two house styles: the
 * canvas size, the dark ground, the red rule across the top, the panel treatment and the
 * corner note all live here once.
 */

export const WIDTH = 1600;
export const HEIGHT = 1000;
export const FONT = 'Inter,Segoe UI,Arial,sans-serif';

export const INK = '#f3f4f6';
export const DIM = '#aab2bf';
export const GROUND = '#0b0d10';
export const PANEL_FILL = '#151922';
export const PANEL_STROKE = '#2a3240';
export const LINE = '#596273';

export const ACCENT = {
	blue: '#4ea1ff',
	red: '#e53935',
	green: '#4caf50',
	purple: '#b05cff',
	amber: '#ffab40',
};

export function escapeXml(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function panel(x, y, width, height, accent) {
	return (
		`<g filter="url(#shadow)">\n` +
		`  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${PANEL_FILL}" stroke="${PANEL_STROKE}" stroke-width="2"/>\n` +
		`  <rect x="${x}" y="${y}" width="8" height="${height}" rx="4" fill="${accent}"/>\n` +
		`</g>\n`
	);
}

export function text(x, y, fill, size, weight, anchor, content) {
	return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}>${escapeXml(content)}</text>\n`;
}

export function defs() {
	return (
		`<defs>\n` +
		`  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">\n` +
		`    <path d="M0,0 L12,6 L0,12 z" fill="${LINE}"/>\n` +
		`  </marker>\n` +
		`  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">\n` +
		`    <feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#000000" flood-opacity="0.28"/>\n` +
		`  </filter>\n` +
		`</defs>`
	);
}

/** the opening of every diagram: canvas, ground, top rule, title and subtitle */
export function open(title, subtitle) {
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
		defs(),
		`<rect width="100%" height="100%" fill="${GROUND}"/>`,
		`<rect x="0" y="0" width="100%" height="12" fill="${ACCENT.red}"/>`,
		text(70, 80, INK, 40, 700, 'start', title),
		text(70, 120, DIM, 20, null, 'start', subtitle),
	];
}

export function close(note) {
	return [text(1530, 964, '#667080', 14, null, 'end', note), `</svg>`];
}
