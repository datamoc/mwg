import { clamp } from '../core/Math.ts';
import { Signal } from '../core/Signal.ts';

/**
 * Construction options for `XpbdWorld`. Units are the game's own: gravity, stiffness and strength share one scale.
 */
export interface XpbdOptions {
	/** downward acceleration in units per second squared; 520 when omitted (a 1-unit-per-pixel scale) */
	gravity?: number;
	/** substeps per `step`; 16 when omitted. More is stiffer and steadier, and costs linearly */
	substeps?: number;
	/** constraint iterations per substep; 2 when omitted */
	iterations?: number;
	/** the frame time one `step` advances, in seconds; 1/60 when omitted */
	step?: number;
	/** velocity damping per second (exponential); 2.5 when omitted. Raise it while a structure settles */
	damping?: number;
	/** time constant of the load smoothing used for breaking, in seconds; 0.06 when omitted */
	smoothing?: number;
	/** how much of a node's sideways motion the ground removes while it touches, 0 to 1; 0.5 when omitted */
	groundFriction?: number;
}

/** the ground a node cannot sink below: a height (y grows downward), or a height at each x */
export type XpbdGround = number | ((x: number) => number);

/** What `XpbdWorld.addNode` takes: a position in world units and an optional mass. */
export interface XpbdNodeSpec {
	x: number;
	y: number;
	/** an anchor that never moves */
	fixed?: boolean;
	/** point mass; 1 when omitted. Link `mass` is added on top */
	mass?: number;
}

/** What `XpbdWorld.addLink` takes. `a` and `b` are node indices as returned by `addNode`. */
export interface XpbdLinkSpec<T = undefined> {
	a: number;
	b: number;
	/** spring stiffness: force per unit of stretch ratio. Higher is more rigid */
	stiffness: number;
	/** rest length; the current distance between the nodes when omitted */
	rest?: number;
	/** mass of the link itself, shared evenly between its two nodes */
	mass?: number;
	/** a cable: pulls when stretched and goes slack, without pushing, when compressed */
	tensionOnly?: boolean;
	/** the load it carries in compression before breaking; also in tension unless `tensionStrength` is set. Unbreakable when omitted */
	strength?: number;
	/** the load it carries in tension before breaking, when that differs from `strength` */
	tensionStrength?: number;
	/** the game's own payload for this link (a material, a source index), kept on `XpbdLink.data` */
	data?: T;
}

/**
 * A live point mass in `XpbdWorld.nodes`. Mutate `x`/`y` between steps to drag a node; velocity is in units per second.
 */
export interface XpbdNode {
	x: number;
	y: number;
	fixed: boolean;
	vx: number;
	vy: number;
	/** inverse mass, 0 for a fixed node */
	w: number;
}

/**
 * A live spring in `XpbdWorld.links`: its spec, resolved (`rest` filled in) and the load state the last step left. A `broken` link carries no load but keeps its index.
 */
export interface XpbdLink<T = undefined> {
	a: number;
	b: number;
	stiffness: number;
	rest: number;
	tensionOnly: boolean;
	strength: number | undefined;
	tensionStrength: number | undefined;
	broken: boolean;
	/** the force it carried over the last step, positive in tension, negative in compression */
	force: number;
	/** smoothed load as a fraction of what it can carry; it breaks above 1 */
	ratio: number;
	/** the payload given to `addLink`, untouched by the solver */
	data: T | undefined;
}

/**
 * A deterministic structure solver: point masses joined by springs, solved with extended
 * position-based dynamics (XPBD), with the force in every link read back so a link can break
 * at a real load rather than at a stretch.
 *
 * The method (Macklin, Muller and Chentanaput's XPBD) moves each node freely for a substep,
 * then corrects positions so every link returns to its rest length, with a compliance of
 * `rest / stiffness / dt^2`: a link behaves as a spring of the stated stiffness whatever the
 * step or iteration count, and the correction's Lagrange multiplier divided by `dt^2` is the
 * force it carried. Steps are fixed and nothing is random, so the same structure and the same
 * calls give the same result on every machine, which is what replaying or validating a
 * player's bridge needs.
 *
 * It is the engine of Pontifex (a bridge-building game), generalised: the vehicle, the water
 * and the levels stay in the game, and what is here is only nodes, links, forces and breaking.
 * Unlike `PhysicsWorld` it has no rigid bodies or collisions: nodes and links only.
 *
 * @example
 * ```ts
 * import { XpbdWorld } from '@datamoc/mw_games/physics/xpbd';
 *
 * const world = new XpbdWorld({ gravity: 520 });
 * const wall = world.addNode({ x: 0, y: 0, fixed: true });
 * const weight = world.addNode({ x: 40, y: 0, mass: 1 });
 * const rope = world.addLink({ a: wall, b: weight, stiffness: 2e4, strength: 900 });
 * world.breaking = true;
 * for (let i = 0; i < 120; i++) world.step();
 * console.log(world.links[rope].broken, world.nodes[weight].y > 0);
 * ```
 *
 * A bridge is a truss: beams are links, a cable is a link with `tensionOnly: true` (it pulls when
 * stretched and goes slack when pushed), and a link with a `strength` breaks at that load. A bare
 * chain of planks has no vertical stiffness and only sags like a rope, so the deck needs triangles.
 *
 * @example
 * ```ts
 * import { XpbdWorld } from '@datamoc/mw_games/physics/xpbd';
 *
 * //a Warren truss between two abutments, with a cart of `cartMass` at midspan
 * function loadBridge(cartMass: number): { sag: number; broken: number; peakLoad: number } {
 * 	const world = new XpbdWorld({ gravity: 520 });
 * 	const spacing = 50;
 * 	const bottom: number[] = [];
 * 	for (let i = 0; i <= 6; i++) bottom.push(world.addNode({ x: i * spacing, y: 0, fixed: i === 0 || i === 6 }));
 * 	const top: number[] = [];
 * 	for (let i = 0; i < 6; i++) top.push(world.addNode({ x: i * spacing + spacing / 2, y: -45 }));
 *
 * 	const beam = (a: number, b: number): void => {
 * 		world.addLink({ a, b, stiffness: 6e4, strength: 16000 });
 * 	};
 * 	for (let i = 0; i < 6; i++) beam(bottom[i], bottom[i + 1]); //the deck
 * 	for (let i = 0; i < 5; i++) beam(top[i], top[i + 1]); //the upper chord
 * 	for (let i = 0; i < 6; i++) {
 * 		beam(bottom[i], top[i]); //the diagonals
 * 		beam(top[i], bottom[i + 1]);
 * 	}
 *
 * 	//the cart rests on the deck and the chord; without a `strength` its links cannot break
 * 	const cart = world.addNode({ x: 150, y: -6, mass: cartMass });
 * 	world.addLink({ a: cart, b: bottom[3], stiffness: 6e4 });
 * 	world.addLink({ a: cart, b: top[2], stiffness: 6e4 });
 *
 * 	world.breaking = true;
 * 	for (let i = 0; i < 360; i++) world.step();
 * 	return {
 * 		sag: Math.max(...bottom.map((node) => world.nodes[node].y)),
 * 		broken: world.links.filter((link) => link.broken).length,
 * 		peakLoad: Math.max(...world.links.map((link) => link.ratio)), //1 is the breaking point
 * 	};
 * }
 *
 * console.log(loadBridge(2)); //holds, a little sag
 * console.log(loadBridge(20)); //too heavy: beams break
 * ```
 */
export class XpbdWorld<T = undefined> {
	readonly nodes: XpbdNode[] = [];
	readonly links: XpbdLink<T>[] = [];
	/** fires once for a link that passed its strength, which has already stopped carrying load */
	readonly onBreak = new Signal<{ link: number; x: number; y: number }>();
	/** links break only while this is true, so a structure can settle under its own weight first */
	breaking = false;
	/** the highest smoothed load ratio across the links at the last step, for a strain gauge */
	peakRatio = 0;
	gravity: number;
	damping: number;
	/** nodes are held on or above this; null for none. Water, a gorge or a cliff face is the game's own business */
	ground: XpbdGround | null = null;
	groundFriction: number;
	private readonly frame: number;
	private readonly substeps: number;
	private readonly iterations: number;
	private readonly smoothing: number;
	private readonly forces: { x: number; y: number }[] = [];
	private readonly masses: number[] = [];
	private readonly lambda: number[] = [];
	private readonly accumulated: number[] = [];

	constructor(options: XpbdOptions = {}) {
		this.gravity = options.gravity ?? 520;
		this.damping = options.damping ?? 2.5;
		this.groundFriction = options.groundFriction ?? 0.5;
		this.frame = options.step ?? 1 / 60;
		this.substeps = Math.max(1, Math.floor(options.substeps ?? 16));
		this.iterations = Math.max(1, Math.floor(options.iterations ?? 2));
		this.smoothing = options.smoothing ?? 0.06;
	}

	/** adds a node and returns its index */
	addNode(spec: XpbdNodeSpec): number {
		const mass = spec.mass ?? 1;
		if (!(mass > 0) && !spec.fixed) throw new Error('a moving node needs a positive mass');
		this.nodes.push({ x: spec.x, y: spec.y, fixed: spec.fixed ?? false, vx: 0, vy: 0, w: 0 });
		this.masses.push(mass);
		this.forces.push({ x: 0, y: 0 });
		this.refreshInverseMass();
		return this.nodes.length - 1;
	}

	/** adds a link between two existing nodes and returns its index */
	addLink(spec: XpbdLinkSpec<T>): number {
		const a = this.nodes[spec.a];
		const b = this.nodes[spec.b];
		if (!a || !b) throw new Error('a link needs two existing nodes');
		const rest = spec.rest ?? Math.hypot(a.x - b.x, a.y - b.y);
		if (!(rest > 0)) throw new Error('a link needs a positive rest length');
		if (!(spec.stiffness > 0)) throw new Error('a link needs a positive stiffness');
		const share = (spec.mass ?? 0) / 2;
		this.masses[spec.a] += share;
		this.masses[spec.b] += share;
		this.links.push({
			a: spec.a,
			b: spec.b,
			stiffness: spec.stiffness,
			rest,
			tensionOnly: spec.tensionOnly ?? false,
			strength: spec.strength,
			tensionStrength: spec.tensionStrength,
			broken: false,
			force: 0,
			ratio: 0,
			data: spec.data,
		});
		this.lambda.push(0);
		this.accumulated.push(0);
		this.refreshInverseMass();
		return this.links.length - 1;
	}

	/** breaks a link now, as if it had passed its strength: it stops carrying load and `onBreak` fires. A broken link is left alone */
	breakLink(index: number): void {
		const link = this.links[index];
		if (!link || link.broken) return;
		link.broken = true;
		const p = this.nodes[link.a];
		const q = this.nodes[link.b];
		this.onBreak.dispatch({ link: index, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
	}

	/** indices of the unbroken links with an endpoint or a crossing inside the box (a ship's hull, a blast area) */
	linksInBox(left: number, top: number, right: number, bottom: number): number[] {
		const hits: number[] = [];
		this.links.forEach((link, i) => {
			if (link.broken) return;
			const p = this.nodes[link.a];
			const q = this.nodes[link.b];
			if (segmentCrossesBox(p.x, p.y, q.x, q.y, left, top, right, bottom)) hits.push(i);
		});
		return hits;
	}

	/** indices of the unbroken links whose segment passes within `radius` of a point, nearest first */
	linksNear(x: number, y: number, radius: number): number[] {
		const hits: { index: number; distance: number }[] = [];
		this.links.forEach((link, index) => {
			if (link.broken) return;
			const p = this.nodes[link.a];
			const q = this.nodes[link.b];
			const dx = q.x - p.x;
			const dy = q.y - p.y;
			const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
			const distance = Math.hypot(p.x + dx * t - x, p.y + dy * t - y);
			if (distance <= radius) hits.push({ index, distance });
		});
		return hits.sort((m, n) => m.distance - n.distance || m.index - n.index).map((hit) => hit.index);
	}

	/** Dynamic solver state and queued forces, for comparing runs with the same configuration. Game payloads and the ground callback are not captured. */
	snapshot(): { nodes: number[][]; links: number[][]; forces: number[][] } {
		return {
			nodes: this.nodes.map((node) => [node.x, node.y, node.vx, node.vy, node.w, node.fixed ? 1 : 0]),
			links: this.links.map((link) => [link.broken ? 1 : 0, link.force, link.ratio]),
			forces: this.forces.map((force) => [force.x, force.y]),
		};
	}

	/** a 32-bit FNV-1a hash of `snapshot()`'s exact bits: equal for equal states, whatever the machine */
	hash(): string {
		const { nodes, links, forces } = this.snapshot();
		const view = new DataView(new ArrayBuffer(8));
		let h = 0x811c9dc5;
		for (const value of [nodes.length, links.length, ...nodes.flat(), ...links.flat(), ...forces.flat()]) {
			view.setFloat64(0, value);
			for (let i = 0; i < 8; i++) h = Math.imul(h ^ view.getUint8(i), 0x01000193);
		}
		return (h >>> 0).toString(16).padStart(8, '0');
	}

	/** an external force on a node for the next `step` only (a wheel's weight, wind) */
	applyForce(node: number, fx: number, fy: number): void {
		this.forces[node].x += fx;
		this.forces[node].y += fy;
	}

	/** advances one frame: the substeps, then the link loads and any breaking */
	step(): void {
		const dt = this.frame / this.substeps;
		this.accumulated.fill(0);
		for (let s = 0; s < this.substeps; s++) this.substep(dt);
		for (const force of this.forces) {
			force.x = 0;
			force.y = 0;
		}
		this.settleLoads();
	}

	private refreshInverseMass(): void {
		this.nodes.forEach((node, i) => {
			node.w = node.fixed ? 0 : 1 / this.masses[i];
		});
	}

	private substep(dt: number): void {
		const damp = Math.exp(-this.damping * dt);
		const previous = this.nodes.map((node) => ({ x: node.x, y: node.y }));
		this.nodes.forEach((node, i) => {
			if (node.fixed) return;
			const force = this.forces[i];
			node.vx = (node.vx + force.x * node.w * dt) * damp;
			node.vy = (node.vy + (force.y * node.w + this.gravity) * dt) * damp;
			node.x += node.vx * dt;
			node.y += node.vy * dt;
		});
		this.lambda.fill(0);
		for (let iteration = 0; iteration < this.iterations; iteration++) {
			this.links.forEach((link, i) => {
				if (link.broken) return;
				const p = this.nodes[link.a];
				const q = this.nodes[link.b];
				const w = p.w + q.w;
				if (w === 0) return;
				const dx = q.x - p.x;
				const dy = q.y - p.y;
				const length = Math.hypot(dx, dy) || 1e-9;
				const c = length - link.rest;
				if (link.tensionOnly && c < 0 && this.lambda[i] >= 0) return;
				const alpha = link.rest / link.stiffness / (dt * dt);
				const delta = (-c - alpha * this.lambda[i]) / (w + alpha);
				this.lambda[i] += delta;
				const nx = dx / length;
				const ny = dy / length;
				p.x -= p.w * delta * nx;
				p.y -= p.w * delta * ny;
				q.x += q.w * delta * nx;
				q.y += q.w * delta * ny;
			});
		}
		this.collideWithGround(previous);
		this.nodes.forEach((node, i) => {
			if (node.fixed) return;
			node.vx = (node.x - previous[i].x) / dt;
			node.vy = (node.y - previous[i].y) / dt;
		});
		this.links.forEach((_, i) => {
			this.accumulated[i] += -this.lambda[i] / (dt * dt);
		});
	}

	/** lifts any node that sank below the ground back onto it, and takes some of its sideways motion with it */
	private collideWithGround(previous: { x: number; y: number }[]): void {
		const ground = this.ground;
		if (ground === null) return;
		this.nodes.forEach((node, i) => {
			if (node.fixed) return;
			const surface = typeof ground === 'number' ? ground : ground(node.x);
			if (node.y <= surface) return;
			node.y = surface;
			node.x -= (node.x - previous[i].x) * this.groundFriction;
		});
	}

	/** averages each link's force over the substeps, smooths the load ratio and breaks what passed its strength */
	private settleLoads(): void {
		const blend = 1 - Math.exp(-this.frame / this.smoothing);
		let peak = 0;
		this.links.forEach((link, i) => {
			if (link.broken) return;
			link.force = this.accumulated[i] / this.substeps;
			const limit = link.force > 0 ? (link.tensionStrength ?? link.strength) : link.strength;
			const instant = limit === undefined ? 0 : Math.abs(link.force) / limit;
			link.ratio += (instant - link.ratio) * blend;
			peak = Math.max(peak, link.ratio);
			if (this.breaking && link.ratio > 1) this.breakLink(i);
		});
		this.peakRatio = peak;
	}
}

/** Liang-Barsky: does the segment touch the axis-aligned box */
function segmentCrossesBox(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	left: number,
	top: number,
	right: number,
	bottom: number,
): boolean {
	let enter = 0;
	let leave = 1;
	const dx = x1 - x0;
	const dy = y1 - y0;
	for (const [p, q] of [
		[-dx, x0 - left],
		[dx, right - x0],
		[-dy, y0 - top],
		[dy, bottom - y0],
	]) {
		if (p === 0) {
			if (q < 0) return false;
			continue;
		}
		const t = q / p;
		if (p < 0) enter = Math.max(enter, t);
		else leave = Math.min(leave, t);
		if (enter > leave) return false;
	}
	return true;
}
