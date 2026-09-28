import { Text, type Container } from 'pixi.js';

/**
 * The zoom a window stack should run at: `base`, stepped down a whole number at a time
 * until `contentHeight` (unzoomed) fits `viewportHeight`, and never below 1. A tall window
 * on a short screen would otherwise be clipped at both ends.
 *
 * @example
 * ```ts
 * import { fitWindowZoom } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(fitWindowZoom(3, 300, 700)); // 2 - 300 x 3 is too tall, 300 x 2 fits
 * ```
 */
export function fitWindowZoom(base: number, contentHeight: number, viewportHeight: number): number {
	let zoom = Math.max(1, Math.floor(base));
	while (zoom > 1 && contentHeight * zoom > viewportHeight) zoom--;
	return zoom;
}

/** the product of every scale from `node` up to the stage */
function cumulativeScale(node: Container | null): number {
	let scale = 1;
	for (let at = node; at; at = at.parent) scale *= Math.abs(at.scale.x);
	return scale;
}

/**
 * Re-rasterises every `Text` under `root` at `devicePixelRatio` times its own on-screen
 * scale, rounded to a whole number. Pixi draws text at the renderer's resolution and knows
 * nothing of a parent's zoom, so text inside a scaled container is otherwise 1x text
 * magnified, and blurry. Call it after a layout or zoom change, not every frame; a text
 * already at the right resolution is left untouched.
 *
 * @example
 * ```ts
 * import { Container } from 'pixi.js';
 * import { sharpenText } from '@datamoc/mw_games/two-d/ui';
 *
 * const panel = new Container();
 * panel.scale.set(3);
 * sharpenText(panel, 2); // every Text inside now rasterises at 6x
 * ```
 */
export function sharpenText(root: Container, devicePixelRatio: number): void {
	const walk = (node: Container, scale: number): void => {
		if (node instanceof Text) {
			const resolution = devicePixelRatio * Math.max(1, Math.round(scale));
			if (node.resolution !== resolution) node.resolution = resolution;
		}
		for (const child of node.children) walk(child as Container, scale * Math.abs((child as Container).scale.x));
	};
	walk(root, cumulativeScale(root));
}
