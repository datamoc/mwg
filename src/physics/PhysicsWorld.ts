import { FixedStepper } from '../core/FixedStepper.ts';
import { Signal } from '../core/Signal.ts';

export interface PhysicsOptions {
	/** gravity strength per axis; y grows downward. The default matches matter-js's historical default pull */
	gravity?: { x: number; y: number };
	/** the fixed simulation step in seconds; 1/60 when omitted */
	step?: number;
	/** steps one `update` may run before it drops the backlog; 5 when omitted */
	maxSubsteps?: number;
}

export interface BodyOptions {
	/** an immovable body: ground, anchors */
	isStatic?: boolean;
	/** 0 to 1, how much of its speed a bounce keeps; 0 when omitted */
	restitution?: number;
	friction?: number;
	/** mass per unit area; 1 when omitted */
	density?: number;
	/** initial rotation in radians; bodies never spin, this is a display offset for sprites */
	angle?: number;
	/** a name for collision callbacks and lookups */
	label?: string;
}

export interface ConstraintOptions {
	/** 0 to 1, how rigidly the ends are held: 1 is a rod, a small value a spring; 1 when omitted */
	stiffness?: number;
	/** 0 to 1, the share of radial oscillation removed per step; 0 when omitted */
	damping?: number;
	/** rest length; the distance between the attachment points when omitted */
	length?: number;
	/** attachment points in each body's local space; the body centre when omitted */
	pointA?: { x: number; y: number };
	pointB?: { x: number; y: number };
	/**
	 * Makes the joint breakable: once its two ends are further apart than the rest length times
	 * `1 + maxStretch`, the constraint is removed and `onBreak` fires. 0.2 lets a beam stretch 20%
	 * before it snaps. For a zero-length joint (a pin) it is the absolute distance instead.
	 * The strain is read after each step's solve, so a fully rigid joint (`stiffness` 1) is pulled
	 * back before it is measured under a light load: use a stiffness below 1, as a real beam has.
	 * Unbreakable when omitted.
	 */
	maxStretch?: number;
}

/** a rigid body: a circle or an axis-aligned box with mutable position and velocity */
export interface PhysicsBody {
	/** centre in world units; assign to teleport (velocity is left untouched) */
	position: { x: number; y: number };
	/** world units per second; assign to shove */
	velocity: { x: number; y: number };
	/** rotation in radians; never integrated, a display offset for sprites */
	angle: number;
	/** collision name, '' when unnamed */
	label: string;
	/** true for ground and anchors: infinite mass, never moves */
	readonly isStatic: boolean;
}

/** a distance joint between two bodies, or a body and a fixed world point */
export interface PhysicsConstraint {
	/** rest length both ends are held at */
	readonly length: number;
}

/**
 * Rigid bodies and constraints in plain TypeScript, stepped on a fixed clock.
 *
 * The framework side of game physics in a mwg game: it owns the solver, steps it with a
 * `FixedStepper` so the simulation is the same at any display refresh rate, and reports
 * contacts through a `Signal`, while leaving the bodies themselves as plain objects a game
 * reads `position` and `angle` from to place its sprites. It is renderer-free, so a game's
 * headless tests can run the same world. No third-party engine: semi-implicit Euler,
 * impulse contacts with restitution and Coulomb friction, and projected distance joints.
 *
 * Bodies never spin: `angle` stays where a game puts it (a display offset), collisions use
 * the unrotated shape, and joints rotate their attachment points by it. Circles and
 * axis-aligned boxes collide with each other in every pairing; that is the whole shape
 * catalogue, by design rather than by omission - a game needing polygons brings its own.
 *
 * Constraints are springs and rods. Give one a `maxStretch` and it breaks when pulled that far
 * past its rest length (`onBreak`); a game with a different stress rule reads `stretchOf` itself
 * and calls `remove`.
 *
 * @example
 * ```ts
 * import { PhysicsWorld } from '@datamoc/mw_games/physics';
 *
 * const world = new PhysicsWorld();
 * world.addBox(0, 300, 800, 20, { isStatic: true });
 * const crate = world.addBox(100, 0, 40, 40, { restitution: 0.3 });
 * world.update(1 / 30); // two fixed steps
 * console.log(crate.position.y > 0); // true: it has started to fall
 * ```
 */
export class PhysicsWorld {
	/** fires once per new contact between two bodies, with the bodies of the pair */
	readonly onContact = new Signal<{ a: PhysicsBody; b: PhysicsBody }>();
	/** fires when a breakable constraint passes its `maxStretch`; it is already removed from the world */
	readonly onBreak = new Signal<{ constraint: PhysicsConstraint; stretch: number }>();
	private readonly stepper: FixedStepper;
	private readonly gravity: { x: number; y: number };
	private readonly bodies_: SimulatedBody[] = [];
	private readonly constraints_: DistanceJoint[] = [];
	private touching = new Set<string>();
	private nextId = 1;

	constructor(options: PhysicsOptions = {}) {
		const gravity = options.gravity ?? { x: 0, y: 9.8 };
		//the option reads like matter-js's historic default pull; internally it scales to
		//world units per second squared (measured: matter drops ~413 units in the first
		//second at its own default, i.e. about 826 units/s^2, air drag aside)
		this.gravity = { x: gravity.x * GRAVITY_SCALE, y: gravity.y * GRAVITY_SCALE };
		this.stepper = new FixedStepper(options.step ?? 1 / 60, options.maxSubsteps ?? 5);
	}

	get bodies(): readonly PhysicsBody[] {
		return this.bodies_;
	}

	get constraints(): readonly PhysicsConstraint[] {
		return this.constraints_;
	}

	/** how far into the next fixed step the clock is, 0 to 1, for interpolated drawing */
	get alpha(): number {
		return this.stepper.alpha;
	}

	/** a box centred on (x, y) */
	addBox(x: number, y: number, width: number, height: number, options: BodyOptions = {}): PhysicsBody {
		return this.add(makeBody(`box ${width}x${height}`, { kind: 'box', width, height }, x, y, options));
	}

	addCircle(x: number, y: number, radius: number, options: BodyOptions = {}): PhysicsBody {
		return this.add(makeBody(`circle r=${radius}`, { kind: 'circle', radius }, x, y, options));
	}

	/** joins two bodies, or a body to a fixed point in the world when `b` is a point */
	addConstraint(
		a: PhysicsBody,
		b: PhysicsBody | { x: number; y: number },
		options: ConstraintOptions = {},
	): PhysicsConstraint {
		const isBody = (value: PhysicsBody | { x: number; y: number }): value is PhysicsBody => 'position' in value;
		const joint = new DistanceJoint(
			bodyOf(a, 'a'),
			isBody(b) ? bodyOf(b, 'b') : null,
			isBody(b) ? null : { x: b.x, y: b.y },
			options,
		);
		this.constraints_.push(joint);
		return joint;
	}

	/** removes a body (with its joints), or a constraint, from the simulation */
	remove(item: PhysicsBody | PhysicsConstraint): void {
		const bodyIndex = this.bodies_.indexOf(item as SimulatedBody);
		if (bodyIndex >= 0) {
			this.bodies_.splice(bodyIndex, 1);
			for (let index = this.constraints_.length - 1; index >= 0; index--) {
				if (this.constraints_[index].touches(item as SimulatedBody)) this.constraints_.splice(index, 1);
			}
			return;
		}
		const jointIndex = this.constraints_.indexOf(item as DistanceJoint);
		if (jointIndex >= 0) this.constraints_.splice(jointIndex, 1);
	}

	/**
	 * How far a constraint is stretched past its rest length, as a fraction of it (0.1 is 10%
	 * longer); for a zero-length joint, the distance between its ends. Negative when compressed.
	 */
	stretchOf(constraint: PhysicsConstraint): number {
		const joint = constraint as DistanceJoint;
		const a = joint.endA();
		const b = joint.endB();
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		return joint.length > 0 ? distance / joint.length - 1 : distance;
	}

	/**
	 * Advances the simulation by `dt` seconds of real time, running as many fixed steps as that
	 * covers; call it from `Scene.update(dt)`.
	 *
	 * @returns how many fixed steps ran
	 */
	update(dt: number): number {
		return this.stepper.advance(dt, (step) => {
			this.step(step);
			this.breakOverstretched();
		});
	}

	private step(h: number): void {
		for (const body of this.bodies_) {
			if (body.isStatic) continue;
			body.velocity.x += this.gravity.x * h;
			body.velocity.y += this.gravity.y * h;
			body.position.x += body.velocity.x * h;
			body.position.y += body.velocity.y * h;
		}
		for (const joint of this.constraints_) joint.solve();
		this.collide();
	}

	private collide(): void {
		const seen = new Set<string>();
		const list = this.bodies_;
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const a = list[i];
				const b = list[j];
				if (a.isStatic && b.isStatic) continue;
				const contact = findContact(a, b);
				if (!contact) continue;
				resolveContact(contact);
				const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
				seen.add(key);
				if (!this.touching.has(key)) this.onContact.dispatch({ a, b });
			}
		}
		this.touching = seen;
	}

	private breakOverstretched(): void {
		//collected first: removing while iterating would skip entries
		const snapped: [DistanceJoint, number][] = [];
		for (const joint of this.constraints_) {
			if (joint.breakLimit === undefined) continue;
			const stretch = this.stretchOf(joint);
			if (stretch > joint.breakLimit) snapped.push([joint, stretch]);
		}
		for (const [joint, stretch] of snapped) {
			this.remove(joint);
			this.onBreak.dispatch({ constraint: joint, stretch });
		}
	}

	private add(body: SimulatedBody): PhysicsBody {
		body.id = this.nextId++;
		this.bodies_.push(body);
		return body;
	}
}

/** world units per second squared per gravity unit; the default pull matches matter-js's historic one */
const GRAVITY_SCALE = 826 / 9.8;

type Shape = { kind: 'circle'; radius: number } | { kind: 'box'; width: number; height: number };

function shapeArea(shape: Shape): number {
	return shape.kind === 'circle' ? Math.PI * shape.radius * shape.radius : shape.width * shape.height;
}

class SimulatedBody implements PhysicsBody {
	id = 0;
	readonly position: { x: number; y: number };
	readonly velocity = { x: 0, y: 0 };
	angle: number;
	readonly label: string;
	readonly isStatic: boolean;
	readonly invMass: number;
	readonly restitution: number;
	readonly friction: number;
	readonly shape: Shape;

	constructor(shape: Shape, x: number, y: number, options: BodyOptions) {
		this.shape = shape;
		this.position = { x, y };
		this.angle = options.angle ?? 0;
		this.label = options.label ?? '';
		this.isStatic = options.isStatic ?? false;
		const density = options.density ?? 1;
		this.invMass = this.isStatic || !(density > 0) ? 0 : 1 / (density * shapeArea(shape));
		this.restitution = options.restitution ?? 0;
		this.friction = options.friction ?? 0.1;
	}
}

function makeBody(description: string, shape: Shape, x: number, y: number, options: BodyOptions): SimulatedBody {
	if (shape.kind === 'circle' ? !(shape.radius > 0) : !(shape.width > 0 && shape.height > 0)) {
		throw new RangeError(`a physics ${description} needs positive size`);
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError(`a physics ${description} needs a finite position, saw (${x}, ${y})`);
	}
	return new SimulatedBody(shape, x, y, options);
}

function bodyOf(value: PhysicsBody, name: string): SimulatedBody {
	if (value instanceof SimulatedBody) return value;
	throw new Error(`physics constraint end ${name} is not a body of this world`);
}

class DistanceJoint implements PhysicsConstraint {
	readonly length: number;
	readonly breakLimit: number | undefined;
	private readonly a: SimulatedBody;
	private readonly b: SimulatedBody | null;
	private readonly anchor: { x: number; y: number } | null;
	private readonly pointA: { x: number; y: number };
	private readonly pointB: { x: number; y: number };
	private readonly stiffness: number;
	private readonly damping: number;

	constructor(
		a: SimulatedBody,
		b: SimulatedBody | null,
		anchor: { x: number; y: number } | null,
		options: ConstraintOptions,
	) {
		this.a = a;
		this.b = b;
		if (anchor && (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))) {
			throw new RangeError(`a physics joint needs a finite anchor, saw (${anchor.x}, ${anchor.y})`);
		}
		this.anchor = anchor;
		this.pointA = { ...(options.pointA ?? { x: 0, y: 0 }) };
		this.pointB = { ...(options.pointB ?? { x: 0, y: 0 }) };
		this.stiffness = options.stiffness ?? 1;
		this.damping = options.damping ?? 0;
		const endA = this.endA();
		const endB = this.endB();
		this.length = options.length ?? Math.hypot(endA.x - endB.x, endA.y - endB.y);
		this.breakLimit = options.maxStretch;
	}

	touches(body: SimulatedBody): boolean {
		return this.a === body || this.b === body;
	}

	endA(): { x: number; y: number } {
		return turn(this.a, this.pointA);
	}

	endB(): { x: number; y: number } {
		return this.b ? turn(this.b, this.pointB) : { ...(this.anchor as { x: number; y: number }) };
	}

	/** one projection pass: stiff rods land on their rest length, soft joints close a share of the error */
	solve(): void {
		const a = this.endA();
		const b = this.endB();
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const distance = Math.hypot(dx, dy);
		if (distance === 0) return;
		const error = ((distance - this.length) / distance) * this.stiffness;
		const wa = this.a.invMass;
		const wb = this.b ? this.b.invMass : 0;
		const total = wa + wb;
		if (total === 0) return;
		this.a.position.x += dx * error * (wa / total);
		this.a.position.y += dy * error * (wa / total);
		if (this.b) {
			this.b.position.x -= dx * error * (wb / total);
			this.b.position.y -= dy * error * (wb / total);
		}
		//radial oscillation leaves through velocity, or a spring would ring forever
		const nx = dx / distance;
		const ny = dy / distance;
		const kill = Math.min(1, Math.max(0, this.stiffness + this.damping));
		if (kill === 0) return;
		const va = this.a.velocity;
		const vb = this.b ? this.b.velocity : { x: 0, y: 0 };
		const closing = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
		va.x += closing * kill * (wa / total) * nx;
		va.y += closing * kill * (wa / total) * ny;
		if (this.b) {
			this.b.velocity.x -= closing * kill * (wb / total) * nx;
			this.b.velocity.y -= closing * kill * (wb / total) * ny;
		}
	}
}

/** a constraint end in world space: the body's attachment point turned by its angle, or the fixed point itself */
function turn(body: SimulatedBody, local: { x: number; y: number }): { x: number; y: number } {
	const cos = Math.cos(body.angle);
	const sin = Math.sin(body.angle);
	return {
		x: body.position.x + local.x * cos - local.y * sin,
		y: body.position.y + local.x * sin + local.y * cos,
	};
}

interface Contact {
	a: SimulatedBody;
	b: SimulatedBody;
	nx: number;
	ny: number;
	penetration: number;
}

function findContact(a: SimulatedBody, b: SimulatedBody): Contact | null {
	const sa = a.shape;
	const sb = b.shape;
	if (sa.kind === 'circle' && sb.kind === 'circle') return circleCircle(a, sa.radius, b, sb.radius);
	if (sa.kind === 'circle') return circleBox(a, b, sa.radius, sb as { width: number; height: number });
	if (sb.kind === 'circle') {
		const contact = circleBox(b, a, sb.radius, sa as { width: number; height: number });
		//the helper reports ball first: swap back so the normal runs from a to b
		if (contact) return { a, b, nx: -contact.nx, ny: -contact.ny, penetration: contact.penetration };
		return null;
	}
	return boxBox(a, sa as { width: number; height: number }, b, sb as { width: number; height: number });
}

function circleCircle(a: SimulatedBody, ra: number, b: SimulatedBody, rb: number): Contact | null {
	const dx = b.position.x - a.position.x;
	const dy = b.position.y - a.position.y;
	const distance = Math.hypot(dx, dy);
	if (distance >= ra + rb) return null;
	if (distance === 0) return { a, b, nx: 1, ny: 0, penetration: ra + rb };
	return { a, b, nx: dx / distance, ny: dy / distance, penetration: ra + rb - distance };
}

/**
 * Ball first, box second: the normal runs from the ball toward the box. A centre on or
 * inside the edge leaves along the least-penetrated axis instead.
 */
function circleBox(
	ball: SimulatedBody,
	boxBody: SimulatedBody,
	radius: number,
	box: { width: number; height: number },
): Contact | null {
	const hw = box.width / 2;
	const hh = box.height / 2;
	const dx = ball.position.x - boxBody.position.x;
	const dy = ball.position.y - boxBody.position.y;
	const cx = Math.max(-hw, Math.min(hw, dx));
	const cy = Math.max(-hh, Math.min(hh, dy));
	const px = dx - cx;
	const py = dy - cy;
	const distance = Math.hypot(px, py);
	if (distance === 0) {
		const ox = hw - Math.abs(dx);
		const oy = hh - Math.abs(dy);
		const exitX = ox < oy;
		const nx = exitX ? -(Math.sign(dx) || 1) : 0;
		const ny = exitX ? 0 : -(Math.sign(dy) || 1);
		return { a: ball, b: boxBody, nx, ny, penetration: Math.min(ox, oy) + radius };
	}
	if (distance >= radius) return null;
	return { a: ball, b: boxBody, nx: -px / distance, ny: -py / distance, penetration: radius - distance };
}

function boxBox(
	a: SimulatedBody,
	sa: { width: number; height: number },
	b: SimulatedBody,
	sb: { width: number; height: number },
): Contact | null {
	const ox = (sa.width + sb.width) / 2 - Math.abs(a.position.x - b.position.x);
	if (ox <= 0) return null;
	const oy = (sa.height + sb.height) / 2 - Math.abs(a.position.y - b.position.y);
	if (oy <= 0) return null;
	if (ox < oy) {
		const sign = Math.sign(b.position.x - a.position.x) || 1;
		return { a, b, nx: sign, ny: 0, penetration: ox };
	}
	const sign = Math.sign(b.position.y - a.position.y) || 1;
	return { a, b, nx: 0, ny: sign, penetration: oy };
}

function resolveContact({ a, b, nx, ny, penetration }: Contact): void {
	const total = a.invMass + b.invMass;
	if (total === 0) return;
	//depenetrate fully: with restitution handled below, nothing re-sinks a resting body
	a.position.x -= nx * penetration * (a.invMass / total);
	a.position.y -= ny * penetration * (a.invMass / total);
	b.position.x += nx * penetration * (b.invMass / total);
	b.position.y += ny * penetration * (b.invMass / total);
	const rvx = b.velocity.x - a.velocity.x;
	const rvy = b.velocity.y - a.velocity.y;
	const closing = rvx * nx + rvy * ny;
	if (closing >= 0) return;
	//slow grazes do not bounce, or stacks would jitter forever
	const restitution = -closing > 1 ? Math.max(a.restitution, b.restitution) : 0;
	const impulse = (-(1 + restitution) * closing) / total;
	a.velocity.x -= impulse * nx * a.invMass;
	a.velocity.y -= impulse * ny * a.invMass;
	b.velocity.x += impulse * nx * b.invMass;
	b.velocity.y += impulse * ny * b.invMass;
	const friction = Math.sqrt(a.friction * b.friction);
	if (friction > 0) {
		const tvx = rvx - closing * nx;
		const tvy = rvy - closing * ny;
		const slide = Math.hypot(tvx, tvy);
		if (slide > 0) {
			const grip = Math.min(slide / total, friction * impulse);
			a.velocity.x += (tvx / slide) * grip * a.invMass;
			a.velocity.y += (tvy / slide) * grip * a.invMass;
			b.velocity.x -= (tvx / slide) * grip * b.invMass;
			b.velocity.y -= (tvy / slide) * grip * b.invMass;
		}
	}
}
