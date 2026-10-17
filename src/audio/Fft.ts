/** in-place iterative radix-2 FFT; `real` and `imaginary` must be a power of two long */
export function fft(real: Float64Array, imaginary: Float64Array): void {
	const length = real.length;

	let j = 0;
	for (let i = 1; i < length; i++) {
		let bit = length >> 1;
		while (j & bit) {
			j ^= bit;
			bit >>= 1;
		}
		j ^= bit;
		if (i < j) {
			let swap = real[i];
			real[i] = real[j];
			real[j] = swap;
			swap = imaginary[i];
			imaginary[i] = imaginary[j];
			imaginary[j] = swap;
		}
	}

	for (let size = 2; size <= length; size <<= 1) {
		const angle = (-2 * Math.PI) / size;
		const stepReal = Math.cos(angle);
		const stepImaginary = Math.sin(angle);
		const half = size >> 1;
		for (let start = 0; start < length; start += size) {
			let weightReal = 1;
			let weightImaginary = 0;
			for (let k = 0; k < half; k++) {
				const even = start + k;
				const odd = even + half;
				const oddReal = real[odd] * weightReal - imaginary[odd] * weightImaginary;
				const oddImaginary = real[odd] * weightImaginary + imaginary[odd] * weightReal;
				real[odd] = real[even] - oddReal;
				imaginary[odd] = imaginary[even] - oddImaginary;
				real[even] += oddReal;
				imaginary[even] += oddImaginary;

				const nextReal = weightReal * stepReal - weightImaginary * stepImaginary;
				weightImaginary = weightReal * stepImaginary + weightImaginary * stepReal;
				weightReal = nextReal;
			}
		}
	}
}
