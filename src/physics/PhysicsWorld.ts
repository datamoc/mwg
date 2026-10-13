import Matter from 'matter-js';
import { FixedStepper } from '../core/FixedStepper.ts';
import { Signal } from '../core/Signal.ts';

export interface PhysicsOptions {
	/** gravity strength per axis; y grows downward. { x: 0, y: 9.8 } (the default) matches matter-js's own default pull */
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
	/** mass per unit area; matter-js's default when omitted */
	density?: number;
	angle?: number;
	/** a name for collision callbacks and lookups */
	label?: string;
}

export interface ConstraintOptions {
	/** 0 to 1, how rigidly the ends are held: 1 is a rod, a small value a spring; 1 when omitted */
	stiffness?: number;
	damping?: number;
	/** rest length; the distance between the attachment points when omitted */
	length?: number;
	/** attachment points in each body's local space; the body centre when omitted */
	pointA?: { x: number; y: number };
	pointB?: { x: number; y: number };
}

export type PhysicsBody = Matter.Body;
export type PhysicsConstraint = Matter.Constraint;

/**
 * Rigid bodies and constraints through matter-js, stepped on a fixed clock.
 *
 * The adapter is the framework side of using matter-js in a mwg game: it owns the `Engine`,
 * steps it with a `FixedStepper` so the simulation is the same at any display refresh rate,
 * and reports contacts through a `Signal`, while leaving the bodies themselves as plain
 * matter-js objects a game reads `position` and `angle` from to place its sprites. It is
 * renderer-free, so a game's headless tests can run the same world.
 *
 * `matter-js` is an optional peer dependency (`npm install matter-js`), imported only by this
 * module (`@datamoc/mw_games/physics`), so a game that never simulates physics never bundles it.
 * Constraints here are springs and rods; a game that needs breakable joints removes the
 * constraint itself when its own stress rule says so (`remove`).
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
	readonly engine: Matter.Engine;
	/** fires once per new contact between two bodies, with the matter-js bodies of the pair */
	readonly onContact = new Signal<{ a: PhysicsBody; b: PhysicsBody }>();
	private readonly stepper: FixedStepper;

	constructor(options: PhysicsOptions = {}) {
		this.engine = Matter.Engine.create();
		const gravity = options.gravity ?? { x: 0, y: 9.8 };
		//matter's gravity is a direction times `scale`; 9.8 maps to its own default scale of 0.001
		this.engine.gravity.x = Math.sign(gravity.x);
		this.engine.gravity.y = Math.sign(gravity.y);
		this.engine.gravity.scale = Math.max(Math.abs(gravity.x), Math.abs(gravity.y)) * 0.0001;
		this.stepper = new FixedStepper(options.step ?? 1 / 60, options.maxSubsteps ?? 5);
		Matter.Events.on(this.engine, 'collisionStart', (event: Matter.IEventCollision<Matter.Engine>) => {
			for (const pair of event.pairs) this.onContact.dispatch({ a: pair.bodyA, b: pair.bodyB });
		});
	}

	get bodies(): readonly PhysicsBody[] {
		return Matter.Composite.allBodies(this.engine.world);
	}

	get constraints(): readonly PhysicsConstraint[] {
		return Matter.Composite.allConstraints(this.engine.world);
	}

	/** how far into the next fixed step the clock is, 0 to 1, for interpolated drawing */
	get alpha(): number {
		return this.stepper.alpha;
	}

	/** a box centred on (x, y) */
	addBox(x: number, y: number, width: number, height: number, options: BodyOptions = {}): PhysicsBody {
		return this.add(Matter.Bodies.rectangle(x, y, width, height, options));
	}

	addCircle(x: number, y: number, radius: number, options: BodyOptions = {}): PhysicsBody {
		return this.add(Matter.Bodies.circle(x, y, radius, options));
	}

	/** joins two bodies, or a body to a fixed point in the world when `b` is a point */
	addConstraint(
		a: PhysicsBody,
		b: PhysicsBody | { x: number; y: number },
		options: ConstraintOptions = {},
	): PhysicsConstraint {
		const isBody = (value: PhysicsBody | { x: number; y: number }): value is PhysicsBody => 'position' in value;
		const constraint = Matter.Constraint.create({
			bodyA: a,
			...(isBody(b) ? { bodyB: b } : { pointB: b }),
			...(options.pointA ? { pointA: options.pointA } : {}),
			...(isBody(b) && options.pointB ? { pointB: options.pointB } : {}),
			stiffness: options.stiffness ?? 1,
			damping: options.damping ?? 0,
			...(options.length !== undefined ? { length: options.length } : {}),
		});
		Matter.Composite.add(this.engine.world, constraint);
		return constraint;
	}

	/** removes a body, or a constraint, from the simulation */
	remove(item: PhysicsBody | PhysicsConstraint): void {
		Matter.Composite.remove(this.engine.world, item);
	}

	/**
	 * Advances the simulation by `dt` seconds of real time, running as many fixed steps as that
	 * covers; call it from `Scene.update(dt)`.
	 *
	 * @returns how many fixed steps ran
	 */
	update(dt: number): number {
		return this.stepper.advance(dt, (step) => Matter.Engine.update(this.engine, step * 1000));
	}

	private add(body: PhysicsBody): PhysicsBody {
		Matter.Composite.add(this.engine.world, body);
		return body;
	}
}
