/**
 * A hand-built SoundFont 3 for tests that run without ffmpeg, a browser or the network: one
 * preset, one compressed sample whose "Ogg" bytes are whatever the test passes, and a decoder
 * stand-in that turns those bytes into known frames.
 */

/** frames the stand-in decoder returns for every sample */
export const FRAMES = 100;

/** an `Ogg` stand-in decoder: a ramp whose slope is the first byte of the data */
export function fakeDecode(ogg: Uint8Array): Int16Array {
	return Int16Array.from({ length: FRAMES }, (_, index) => index * ogg[0]);
}

function str20(name: string): Buffer {
	return Buffer.concat([Buffer.from(name, 'latin1'), Buffer.alloc(20 - name.length)]);
}

function chunk(id: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.write(id, 0, 'latin1');
	head.writeUInt32LE(data.length, 4);
	return Buffer.concat([head, data, Buffer.alloc(data.length & 1)]);
}

function list(kind: string, parts: Buffer[]): Buffer {
	return chunk('LIST', Buffer.concat([Buffer.from(kind, 'latin1'), ...parts]));
}

function u16(...values: number[]): Buffer {
	const out = Buffer.alloc(values.length * 2);
	values.forEach((value, index) => out.writeUInt16LE(value, index * 2));
	return out;
}

function gen(oper: number, amount: number): Buffer {
	const out = Buffer.alloc(4);
	out.writeUInt16LE(oper, 0);
	out.writeInt16LE(amount, 2);
	return out;
}

/** a one-preset SoundFont 3: preset `program` of bank `bank`, one Ogg sample of `ogg.length` bytes looping 10 to 90 at 8 kHz */
export function buildSf3(bank: number, program: number, ogg: Buffer): Buffer {
	const preset = (name: string, p: number, b: number, bag: number): Buffer =>
		Buffer.concat([str20(name), u16(p, b, bag), Buffer.alloc(12)]);
	const header = Buffer.alloc(46);
	str20('ogg').copy(header, 0);
	header.writeUInt32LE(0, 20);
	header.writeUInt32LE(ogg.length, 24);
	header.writeUInt32LE(10, 28); //loop points are relative to the sample in an SF3
	header.writeUInt32LE(90, 32);
	header.writeUInt32LE(8000, 36);
	header[40] = 69;
	header.writeUInt16LE(0x11, 44); //mono, Ogg Vorbis
	const eos = Buffer.alloc(46);
	str20('EOS').copy(eos, 0);
	const pdta = list('pdta', [
		chunk('phdr', Buffer.concat([preset('Test', program, bank, 0), preset('EOS', 0, 0, 1)])),
		chunk('pbag', Buffer.concat([u16(0, 0), u16(1, 0)])),
		chunk('pgen', gen(41, 0)),
		chunk('inst', Buffer.concat([str20('TestInst'), u16(0), str20('EOS'), u16(1)])),
		chunk('ibag', Buffer.concat([u16(0, 0), u16(1, 0)])),
		chunk('igen', gen(53, 0)),
		chunk('shdr', Buffer.concat([header, eos])),
	]);
	const body = Buffer.concat([
		Buffer.from('sfbk', 'latin1'),
		list('INFO', [chunk('ifil', Buffer.from([3, 0, 0, 0]))]),
		list('sdta', [chunk('smpl', ogg)]),
		pdta,
	]);
	const head = Buffer.alloc(8);
	head.write('RIFF', 0, 'latin1');
	head.writeUInt32LE(body.length, 4);
	return Buffer.concat([head, body]);
}
