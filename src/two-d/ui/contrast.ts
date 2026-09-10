/**
 * WCAG contrast, so a game can check its own palette instead of guessing.
 *
 * `theme` palettes are plain numbers and nothing has ever verified one, which means a game's
 * own colours can silently fall below the readable threshold - low-contrast text on a panel is
 * invisible to a typechecker and easy to miss in a screenshot on a bright monitor. These are
 * the standard relative-luminance and contrast-ratio formulas, pure and testable, with the
 * WCAG AA/AAA thresholds built in. `theme.defaultTheme` and `theme.highContrastTheme` both
 * pass; a game's own palette can be checked the same way.
 *
 * @example
 * ```ts
 * import { contrastRatio, meetsContrast, relativeLuminance } from '@datamoc/mw_games/two-d/ui';
 *
 * console.log(relativeLuminance(0xffffff)); // 1
 * console.log(contrastRatio(0xffffff, 0x000000).toFixed(1)); // 21.0
 * console.log(meetsContrast(0xe8e8f0, 0x1c1c26)); // true - the default theme's text on its panel
 * ```
 */

/** one 0-255 channel of a 0xRRGGBB colour, linearised for relative luminance */
function channel(value: number): number {
	const c = value / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a 0xRRGGBB colour, 0 (black) to 1 (white) */
export function relativeLuminance(color: number): number {
	return (
		0.2126 * channel((color >> 16) & 0xff) + 0.7152 * channel((color >> 8) & 0xff) + 0.0722 * channel(color & 0xff)
	);
}

/** WCAG contrast ratio between two 0xRRGGBB colours, 1 (identical) to 21 (black on white) */
export function contrastRatio(a: number, b: number): number {
	const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

export type ContrastLevel = 'AA' | 'AAA';

/**
 * Whether `foreground` on `background` reaches the WCAG minimum for `level`: 4.5 (AA) or 7
 * (AAA), relaxed to 3 / 4.5 for `large` text (roughly 18pt, or 14pt bold).
 */
export function meetsContrast(
	foreground: number,
	background: number,
	level: ContrastLevel = 'AA',
	large = false,
): boolean {
	const required = level === 'AAA' ? (large ? 4.5 : 7) : large ? 3 : 4.5;
	return contrastRatio(foreground, background) >= required;
}
