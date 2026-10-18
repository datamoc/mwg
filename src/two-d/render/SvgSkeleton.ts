import { readSvgSource } from '../../assets/SvgSource.ts';
import { loadSvgParts } from '../../assets/SvgParts.ts';
import { resolve, type Mixer, type SkeletonBones } from '../../skeleton/index.ts';
import { SkeletalSprite } from './SkeletalSprite.ts';
import type { Texture2D } from './Types2D.ts';

export interface SvgBoneBinding {
	bone: string;
	/** SVG group id; defaults to the bone name. */
	group?: string;
	/** Pivot in root SVG user coordinates. Overrides options.pivots and SVG data attributes. */
	pivot?: { x: number; y: number };
	/** Artwork's rest angle in degrees; defaults to the bone's resolved rest angle. */
	rotation?: number;
}

export interface SvgSkeletonOptions {
	skeleton: SkeletonBones;
	/** Draw order. Omit to bind matching named groups in SVG document order. */
	bindings?: readonly SvgBoneBinding[];
	/** Root SVG user coordinates, keyed by group id (e.g. from a game's art manifest). */
	pivots?: Readonly<Record<string, { x: number; y: number }>>;
	resolution?: number;
	mixer?: Mixer;
}

export interface LoadedSvgSkeleton {
	sprite: SkeletalSprite;
	/** Borrowed cached textures. Destroy sprites first, then releaseSvgParts once all users are done. */
	textures: Readonly<Record<string, Texture2D>>;
}

/**
 * Load authored SVG limbs, normalize each around its pivot, and bind them to a skeleton.
 * Uses SVG data-pivot-x / data-pivot-y attributes or pivots supplied by the game. Art is
 * rotated back from its rest angle before rasterization, so rest poses reconstruct the drawing
 * and posed limbs turn around their joints. Separately bound descendant groups are removed
 * from parent parts, avoiding duplicate limbs; ancestor transforms and shared defs/styles survive.
 * Requires browser DOMParser and XMLSerializer. Compiled asset paths work directly under file://.
 * @example
 * ```ts
 * import { create } from '@datamoc/mwg/skeleton';
 * import { loadSvgSkeleton } from '@datamoc/mwg/two-d/render';
 * import { releaseSvgParts } from '@datamoc/mwg/assets';
 * const loaded = await loadSvgSkeleton('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="10"><g id="arm" data-pivot-x="0" data-pivot-y="5"><rect width="30" height="10"/></g></svg>', {
 *   skeleton: create([{ name: 'arm', length: 30, origin: { x: 0, y: 5 } }]), resolution: 2,
 * });
 * loaded.sprite.apply({ arm: 45 });
 * loaded.sprite.destroy({ children: true });
 * await releaseSvgParts(loaded.textures);
 * ```
 */
export async function loadSvgSkeleton(source: string, options: SvgSkeletonOptions): Promise<LoadedSvgSkeleton> {
	if (options.mixer && options.mixer.skeleton !== options.skeleton)
		throw new Error('SVG skeleton mixer must use the supplied skeleton');
	const text = await readSvgSource(source);
	const document = new DOMParser().parseFromString(text, 'image/svg+xml');
	const root = document.documentElement;
	if (document.querySelector('parsererror') || root.localName !== 'svg')
		throw new Error('SVG skeleton needs a valid svg root');
	const viewBox = root
		.getAttribute('viewBox')
		?.trim()
		.split(/[\s,]+/)
		.map(Number) ?? [0, 0, Number(root.getAttribute('width')), Number(root.getAttribute('height'))];
	if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0)
		throw new Error('SVG skeleton needs a finite viewBox or positive numeric width and height');
	const groups = new Map<string, Element>();
	for (const group of root.querySelectorAll('g[id]')) {
		if (groups.has(group.id)) throw new Error(`duplicate SVG skeleton group ${group.id}`);
		groups.set(group.id, group);
	}
	const rest = new Map(resolve(options.skeleton).map((bone) => [bone.name, bone]));
	const bindings: readonly SvgBoneBinding[] =
		options.bindings ?? [...groups.keys()].filter((name) => rest.has(name)).map((bone) => ({ bone }));
	if (!bindings.length) throw new Error('SVG skeleton found no matching bone groups');
	const selected = new Set(bindings.map((binding) => binding.group ?? binding.bone));
	const bones = new Set<string>();
	const sources: { bone: string; svg: string }[] = [];
	const serializer = new XMLSerializer();
	for (const binding of bindings) {
		const id = binding.group ?? binding.bone;
		if (bones.has(binding.bone)) throw new Error(`duplicate SVG binding for bone ${binding.bone}`);
		bones.add(binding.bone);
		const bone = rest.get(binding.bone);
		if (!bone) throw new Error(`SVG binding names no bone ${binding.bone}`);
		const group = groups.get(id);
		if (!group) throw new Error(`SVG skeleton missing group ${id}`);
		const pivot = binding.pivot ??
			options.pivots?.[id] ?? {
				x: group.hasAttribute('data-pivot-x') ? Number(group.getAttribute('data-pivot-x')) : NaN,
				y: group.hasAttribute('data-pivot-y') ? Number(group.getAttribute('data-pivot-y')) : NaN,
			};
		const rotation = binding.rotation ?? bone.angle;
		if (![pivot.x, pivot.y, rotation].every(Number.isFinite))
			throw new Error(`SVG skeleton group ${id} needs a finite pivot and rest angle`);
		const farX = Math.max(Math.abs(viewBox[0] - pivot.x), Math.abs(viewBox[0] + viewBox[2] - pivot.x));
		const farY = Math.max(Math.abs(viewBox[1] - pivot.y), Math.abs(viewBox[1] + viewBox[3] - pivot.y));
		const radius = Math.ceil(Math.hypot(farX, farY)) + 1;
		const isolated = root.cloneNode(false) as Element;
		isolated.setAttribute('viewBox', `${-radius} ${-radius} ${radius * 2} ${radius * 2}`);
		isolated.setAttribute('width', String(radius * 2));
		isolated.setAttribute('height', String(radius * 2));
		for (const shared of root.querySelectorAll('defs, style')) isolated.appendChild(shared.cloneNode(true));
		const drawing = group.cloneNode(true) as Element;
		for (const descendant of drawing.querySelectorAll('g[id]'))
			if (selected.has(descendant.id)) descendant.remove();
		let wrapped = drawing;
		for (let ancestor = group.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
			const wrapper = ancestor.cloneNode(false) as Element;
			wrapper.appendChild(wrapped);
			wrapped = wrapper;
		}
		const centered = document.createElementNS(root.namespaceURI, 'g');
		centered.setAttribute('id', 'mwg-part');
		centered.setAttribute('transform', `rotate(${-rotation}) translate(${-pivot.x} ${-pivot.y})`);
		centered.appendChild(wrapped);
		isolated.appendChild(centered);
		sources.push({ bone: binding.bone, svg: serializer.serializeToString(isolated) });
	}
	const textures: Record<string, Texture2D> = Object.create(null);
	// All authoring errors above fail before loading textures or allocating display objects.
	for (const part of sources)
		textures[part.bone] = (await loadSvgParts(part.svg, { resolution: options.resolution }))['mwg-part'];
	const sprite = new SkeletalSprite(options.skeleton, options.mixer);
	for (const part of sources) {
		const member = sprite.bind(part.bone, textures[part.bone]);
		member.anchor.set(0.5);
		member.label = part.bone;
	}
	sprite.apply({});
	return { sprite, textures: Object.freeze(textures) };
}
