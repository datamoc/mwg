/**
 * A renderer's backing store is `width * resolution` by `height * resolution` pixels, and a
 * device's GPU has a `MAX_TEXTURE_SIZE` it will not go past. `Game` used to ask for the
 * display's full `devicePixelRatio` whatever the canvas size, which on a large enough canvas is
 * a request the device cannot honour: WebGL answers that by clamping the drawing buffer rather
 * than failing, so the game carries on rendering into a surface that is not the one it asked
 * for, with nothing reported anywhere.
 *
 * Measured, not assumed: a full-window canvas of 816x1812 css pixels at `devicePixelRatio`
 * 2.625 asks for 2121x4709, and a device reporting a 4096 limit produced a drawing buffer
 * clamped to 2121x4096. That same process painted an entirely black screen, but that is *not*
 * attributed here: the failure did not reproduce (the emulator reported 8192 on every later
 * start) and a deliberately clamped 1050x10500 request rendered correctly on the next process,
 * so the black screen's cause was never established. What stands on its own is the clamped
 * request, which is a size the game never asked for and cannot see.
 *
 * So the request is kept inside what the device says it can make. Whole numbers, because whole
 * device pixels are the point: a fractional ratio duplicates pixel columns unevenly, the same
 * reason `Game` watches `devicePixelRatio` in the first place.
 *
 * @param width logical width in css pixels (`renderer.screen.width`)
 * @param height logical height in css pixels
 * @param devicePixelRatio what the display asks for; never exceeded
 * @param maxTextureSize the GPU's own limit, or any non-finite/non-positive value for "no cap"
 * @returns the resolution to resize with, never above `devicePixelRatio`, never below 1
 */
export function fitResolution(width: number, height: number, devicePixelRatio: number, maxTextureSize: number): number {
	const longest = Math.max(width, height);
	if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) return devicePixelRatio;
	if (!Number.isFinite(longest) || longest <= 0) return devicePixelRatio;
	if (longest * devicePixelRatio <= maxTextureSize) return devicePixelRatio;

	//a canvas longer than the limit even at 1x is left at 1x: nothing smaller can be offered,
	//and scaling the scene down instead would move every coordinate a game depends on
	return Math.max(1, Math.floor(maxTextureSize / longest));
}
