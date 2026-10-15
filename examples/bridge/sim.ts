import { XpbdWorld } from '../../src/physics/xpbd.ts';

/**
 * The bridge game with no renderer in it: levels as data, the beams a player has placed, the
 * structure they make, and a vehicle that crosses it. `main.ts` only draws what is here, and
 * the tests import this file alone.
 */

/** a point a beam can join: the two banks are `fixed`, everything else is free to sag */
export interface Joint {
	x: number;
	y: number;
	fixed?: boolean;
}

export interface Level {
	name: string;
	joints: Joint[];
	/** the joints the vehicle drives over, left to right */
	deck: number[];
	budget: number;
	costPerMetre: number;
	/** the vehicle's mass; its weight is mass times gravity, spread over the deck under it */
	vehicleMass: number;
	/** how far the deck may drop under the vehicle before the vehicle falls through */
	maxSag: number;
}

/** a beam is a pair of joint indices; a third element `true` makes it a cable: half the price, pulls but never pushes */
export type Beam = readonly [a: number, b: number, cable?: boolean];

export interface CrossingResult {
	crossed: boolean;
	sag: number;
	broken: number;
	peakLoad: number;
	cost: number;
}

export const UNITS_PER_METRE = 25;
export const LONGEST_BEAM = 130;
const GRAVITY = 520;
const BEAM = { stiffness: 3e5, strength: 16000 };
const VEHICLE_SPEED = 55;
const SETTLE_STEPS = 60;
/** frames a failed bridge keeps falling, so the collapse and any breaking can be seen */
const COLLAPSE_STEPS = 90;

/**
 * A level for a gap of `spans` bays: a deck along y = 0 anchored at both ends (and at any `piers`),
 * with a row of upper joints between the deck joints for triangles to land on.
 */
function gapLevel(name: string, spans: number, budget: number, vehicleMass: number, piers: number[] = []): Level {
	const joints: Joint[] = [];
	for (let i = 0; i <= spans; i++) {
		joints.push({ x: i * 50, y: 0, fixed: i === 0 || i === spans || piers.includes(i) });
	}
	for (let i = 0; i < spans; i++) joints.push({ x: i * 50 + 25, y: -60 });
	return {
		name,
		joints,
		deck: Array.from({ length: spans + 1 }, (_, i) => i),
		budget,
		costPerMetre: 20,
		vehicleMass,
		maxSag: 30,
	};
}

export const LEVELS: Level[] = [
	gapLevel('Short span', 6, 1200, 2),
	gapLevel('Wide gorge', 8, 1600, 2.5),
	gapLevel('The pier', 10, 1850, 8, [5]),
];

export function beamLength(level: Level, [a, b]: Beam): number {
	return Math.hypot(level.joints[a].x - level.joints[b].x, level.joints[a].y - level.joints[b].y);
}

export function beamCost(level: Level, beam: Beam): number {
	const price = (beamLength(level, beam) / UNITS_PER_METRE) * level.costPerMetre;
	return Math.round(beam[2] ? price / 2 : price);
}

export function totalCost(level: Level, beams: readonly Beam[]): number {
	return beams.reduce((sum, beam) => sum + beamCost(level, beam), 0);
}

/** why a beam cannot be added, or null when it can */
export function beamProblem(level: Level, beams: readonly Beam[], beam: Beam): string | null {
	const [a, b] = beam;
	if (a === b || !level.joints[a] || !level.joints[b]) return 'a beam joins two different joints';
	if (beams.some(([c, d]) => (c === a && d === b) || (c === b && d === a))) return 'that beam is already there';
	if (beamLength(level, beam) > LONGEST_BEAM) return 'too long for one beam';
	if (totalCost(level, beams) + beamCost(level, beam) > level.budget) return 'over budget';
	return null;
}

/**
 * Build actions are plain strings, which is what `core.Recorder` records: `beam:a:b` adds a
 * beam, `cable:a:b` a cable, `clear` removes them all. Returns the new beam list, or the same one when the action
 * does nothing (an unknown action, or a beam that is not allowed).
 */
export function applyAction(level: Level, beams: readonly Beam[], action: string): readonly Beam[] {
	if (action === 'clear') return [];
	const [verb, a, b] = action.split(':');
	if (verb !== 'beam' && verb !== 'cable') return beams;
	const beam: Beam = [Number(a), Number(b), verb === 'cable'];
	return beamProblem(level, beams, beam) === null ? [...beams, beam] : beams;
}

/** the Warren truss for a level: a chord above, a chord along the deck, and the diagonals between */
export function warrenBeams(level: Level): Beam[] {
	const spans = level.deck.length - 1;
	const top = (i: number): number => level.deck.length + i;
	const beams: Beam[] = [];
	for (let i = 0; i < spans; i++) beams.push([i, i + 1], [i, top(i)], [top(i), i + 1]);
	for (let i = 0; i < spans - 1; i++) beams.push([top(i), top(i + 1)]);
	return beams;
}

export interface Bridge {
	world: XpbdWorld;
	/** the world's link index for each beam, in the order given */
	links: number[];
}

/** the structure a list of beams makes: one node per joint, one link per beam */
export function buildBridge(level: Level, beams: readonly Beam[]): Bridge {
	const world = new XpbdWorld({ gravity: GRAVITY });
	for (const joint of level.joints) world.addNode({ x: joint.x, y: joint.y, fixed: joint.fixed });
	const links = beams.map(([a, b, cable]) => world.addLink({ a, b, tensionOnly: cable === true, ...BEAM }));
	return { world, links };
}

/** a vehicle driving over the deck, one `step` per frame; `cross` runs it to the end */
export class Crossing {
	readonly level: Level;
	readonly beams: readonly Beam[];
	readonly bridge: Bridge;
	/** how far along the deck the vehicle is, in world units from the first deck joint */
	distance = 0;
	fell = false;
	private collapse = 0;
	private sag = 0;
	private peakLoad = 0;
	private frames = 0;
	private readonly restY: number[];
	private readonly length: number;

	constructor(level: Level, beams: readonly Beam[]) {
		this.level = level;
		this.beams = beams;
		this.bridge = buildBridge(level, beams);
		this.restY = level.deck.map((joint) => level.joints[joint].y);
		this.length = level.joints[level.deck[level.deck.length - 1]].x - level.joints[level.deck[0]].x;
	}

	get done(): boolean {
		return this.collapse >= COLLAPSE_STEPS || (!this.fell && this.distance >= this.length);
	}

	/** the vehicle's position and the deck segment under it, from the joints as they are now */
	where(): { x: number; y: number; index: number; t: number } {
		const nodes = this.bridge.world.nodes;
		const deck = this.level.deck;
		const x0 = this.level.joints[deck[0]].x + this.distance;
		let index = 0;
		while (index < deck.length - 2 && nodes[deck[index + 1]].x < x0) index++;
		const left = nodes[deck[index]];
		const right = nodes[deck[index + 1]];
		const t = Math.min(1, Math.max(0, (x0 - left.x) / (right.x - left.x)));
		return { x: x0, y: left.y + (right.y - left.y) * t, index, t };
	}

	step(): void {
		const world = this.bridge.world;
		this.frames++;
		world.breaking = this.frames > SETTLE_STEPS;
		if (world.breaking) {
			const { index, t } = this.where();
			const weight = this.level.vehicleMass * GRAVITY;
			world.applyForce(this.level.deck[index], 0, weight * (1 - t));
			world.applyForce(this.level.deck[index + 1], 0, weight * t);
			if (!this.fell) this.distance += VEHICLE_SPEED / 60;
		}
		world.step();
		this.peakLoad = Math.max(this.peakLoad, world.peakRatio);
		this.level.deck.forEach((joint, i) => {
			if (!this.fell) this.sag = Math.max(this.sag, world.nodes[joint].y - this.restY[i]);
		});
		if (world.breaking && this.sag > this.level.maxSag) this.fell = true;
		if (this.fell) this.collapse++;
	}

	result(): CrossingResult {
		const { world } = this.bridge;
		return {
			crossed: !this.fell && this.distance >= this.length,
			sag: Math.round(this.sag * 10) / 10,
			broken: world.links.filter((link) => link.broken).length,
			peakLoad: Math.round(this.peakLoad * 1000) / 1000,
			cost: totalCost(this.level, this.beams),
		};
	}
}

export function cross(level: Level, beams: readonly Beam[]): CrossingResult {
	const crossing = new Crossing(level, beams);
	while (!crossing.done) crossing.step();
	return crossing.result();
}

/** colour for a link's `ratio`: green when idle, through yellow, to red at the breaking point */
export function ratioColour(ratio: number): number {
	const t = Math.min(1, Math.max(0, ratio));
	const red = Math.round(80 + 175 * Math.min(1, t * 2));
	const green = Math.round(200 - 140 * Math.max(0, t * 2 - 1));
	return (red << 16) | (green << 8) | 70;
}

/** one line for the player: how the crossing went */
export function describe(level: Level, result: CrossingResult): string {
	const load = `peak load ${Math.round(result.peakLoad * 100)}%`;
	if (result.crossed) return `Crossed! cost ${result.cost}, sag ${result.sag}, ${load}`;
	return `Failed: sag ${result.sag} (limit ${level.maxSag}), ${result.broken} beam(s) broke, ${load}`;
}
