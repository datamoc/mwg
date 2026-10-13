import { Signal } from '../core/Signal.ts';

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
}

export interface XpbdNodeSpec {
	x: number;
	y: number;
	/** an anchor that never moves */
	fixed?: boolean;
	/** point mass; 1 when omitted. Link `mass` is added on top */
	mass?: number;
}

export interface XpbdLinkSpec {
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
}

export interface XpbdNode {
	x: number;
	y: number;
	fixed: boolean;
	vx: number;
	vy: number;
	/** inverse mass, 0 for a fixed node */
	w: number;
}

export interface XpbdLink {
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
 * Unlike `PhysicsWorld` it has no rigid bodies or collisions and no `matter-js` dependency.
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
 */
export class XpbdWorld {
	readonly nodes: XpbdNode[] = [];
	readonly links: XpbdLink[] = [];
	/** fires once for a link that passed its strength, which has already stopped carrying load */
	readonly onBreak = new Signal<{ link: number; x: number; y: number }>();
	/** links break only while this is true, so a structure can settle under its own weight first */
	breaking = false;
	/** the highest smoothed load ratio across the links at the last step, for a strain gauge */
	peakRatio = 0;
	gravity: number;
	damping: number;
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
	addLink(spec: XpbdLinkSpec): number {
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
		});
		this.lambda.push(0);
		this.accumulated.push(0);
		this.refreshInverseMass();
		return this.links.length - 1;
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
		this.nodes.forEach((node, i) => {
			if (node.fixed) return;
			node.vx = (node.x - previous[i].x) / dt;
			node.vy = (node.y - previous[i].y) / dt;
		});
		this.links.forEach((_, i) => {
			this.accumulated[i] += -this.lambda[i] / (dt * dt);
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
			if (this.breaking && link.ratio > 1) {
				link.broken = true;
				const p = this.nodes[link.a];
				const q = this.nodes[link.b];
				this.onBreak.dispatch({ link: i, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
			}
		});
		this.peakRatio = peak;
	}
}
