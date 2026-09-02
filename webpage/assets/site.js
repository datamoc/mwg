// mwg project site — the hero demo.
//
// Draws the same tiny sprite twice and applies a colour transform to every pixel by hand:
// `texel * M + A`. The left canvas is clamped to A = 0, which is all Pixi's built-in `tint`
// can do (multiply only, so it can only ever darken). The right canvas gets the full
// transform, which is what `mwg/render`'s ColorTransformBatcher does per sprite, in the
// batch shader, at no extra cost. Moving the sliders is the whole pitch.

(function () {
	const SIZE = 20;

	// procedurally build a small hooded-figure sprite so no image asset is needed —
	// generated, not drawn by hand or downloaded, same rule the framework's own examples follow.
	function buildSprite() {
		const cx = SIZE / 2;
		const pixels = new Array(SIZE * SIZE).fill(null);

		const hair = [58, 42, 30];
		const skin = [202, 162, 122];
		const eye = [16, 19, 26];
		const robe = [74, 74, 94];
		const belt = [110, 140, 80];

		for (let y = 0; y < SIZE; y++) {
			for (let x = 0; x < SIZE; x++) {
				const dx = (x + 0.5 - cx) / (SIZE / 2);
				const dy = (y + 0.5 - 4) / 6;

				// hood: an ellipse near the top
				if (dx * dx + dy * dy < 1 && y >= 2 && y <= 9) {
					pixels[y * SIZE + x] = hair;
				}
				// face: a smaller ellipse inside the hood
				const fdy = (y + 0.5 - 6) / 3.2;
				if (dx * dx * 1.6 + fdy * fdy < 1 && y >= 5 && y <= 9) {
					pixels[y * SIZE + x] = skin;
				}
				// eyes
				if (y === 7 && (x === Math.round(cx - 2.5) || x === Math.round(cx + 1.5))) {
					pixels[y * SIZE + x] = eye;
				}
				// robe: widens toward the hem
				if (y >= 9 && y <= 18) {
					const spread = 3.2 + (y - 9) * 0.55;
					if (Math.abs(x + 0.5 - cx) < spread) {
						pixels[y * SIZE + x] = robe;
					}
				}
				// belt
				if (y === 13) {
					const spread = 3.2 + (13 - 9) * 0.55;
					if (Math.abs(x + 0.5 - cx) < spread) {
						pixels[y * SIZE + x] = belt;
					}
				}
			}
		}
		return pixels;
	}

	const sprite = buildSprite();

	function clamp(v) {
		return v < 0 ? 0 : v > 255 ? 255 : v;
	}

	function render(canvas, mult, add) {
		const ctx = canvas.getContext('2d');
		canvas.width = SIZE;
		canvas.height = SIZE;
		const img = ctx.createImageData(SIZE, SIZE);

		for (let i = 0; i < sprite.length; i++) {
			const texel = sprite[i];
			const o = i * 4;
			if (!texel) {
				img.data[o + 3] = 0;
				continue;
			}
			img.data[o] = clamp(texel[0] * mult[0] + add[0]);
			img.data[o + 1] = clamp(texel[1] * mult[1] + add[1]);
			img.data[o + 2] = clamp(texel[2] * mult[2] + add[2]);
			img.data[o + 3] = 255;
		}
		ctx.putImageData(img, 0, 0);
	}

	function hexToRgb01(hex) {
		const n = parseInt(hex.slice(1), 16);
		return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
	}

	function initDemo() {
		const tintOnly = document.getElementById('demo-tint');
		const tintAdd = document.getElementById('demo-full');
		if (!tintOnly || !tintAdd) return;

		const multColor = document.getElementById('mult-color');
		const multAmount = document.getElementById('mult-amount');
		const addColor = document.getElementById('add-color');
		const addAmount = document.getElementById('add-amount');

		function current() {
			const mc = hexToRgb01(multColor.value);
			const ma = Number(multAmount.value);
			// amount 0 = no tint (M = 1,1,1); amount 1 = full tint colour
			const mult = mc.map((c) => 1 - ma + ma * c);

			const ac = hexToRgb01(addColor.value);
			const aa = Number(addAmount.value) * 255;
			const add = ac.map((c) => c * aa);

			return { mult, add };
		}

		function draw() {
			const { mult, add } = current();
			render(tintOnly, mult, [0, 0, 0]);
			render(tintAdd, mult, add);
		}

		[multColor, multAmount, addColor, addAmount].forEach((el) => el.addEventListener('input', draw));

		document.querySelectorAll('.preset-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				multColor.value = btn.dataset.multColor;
				multAmount.value = btn.dataset.multAmount;
				addColor.value = btn.dataset.addColor;
				addAmount.value = btn.dataset.addAmount;
				draw();
			});
		});

		draw();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initDemo);
	} else {
		initDemo();
	}
})();
