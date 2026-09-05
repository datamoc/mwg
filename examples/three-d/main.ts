import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder.pure.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import {
	Character3D,
	Engine3D,
	createTileGrid3D,
	createHeightmapTerrain3D,
	gridPoint3D,
	buildHeightIndex,
	resolveCapsuleAgainstGrid,
} from '../../src/three-d/index.ts';
import type { GridCell3D } from '../../src/three-d/index.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('3D example needs #game canvas');

const game = new Engine3D({ canvas, clearColor: [0.035, 0.065, 0.09] });
game.camera.setTarget(new Vector3(5, 0, 2));
game.camera.radius = 20;

const squareCells: GridCell3D[] = [];
for (let y = 0; y < 9; y++) {
	for (let x = 0; x < 10; x++) {
		const edge = x === 0 || y === 0 || x === 9 || y === 8;
		const ridge = x >= 6 && y >= 5 ? 2 : x === 5 && y >= 5 ? 1 : 0;
		squareCells.push({ x, y, height: edge ? 1 : ridge });
	}
}
createTileGrid3D(game.scene, squareCells, {
	shape: 'square', tileSize: 1, heightStep: 0.7, tileColor: 0x679c68, columnColor: 0x395b42,
});

const hexCells: GridCell3D[] = [];
for (let x = 0; x < 5; x++) {
	for (let y = 0; y < 5; y++) hexCells.push({ x, y, height: (x + y) % 4 === 0 ? 1 : 0 });
}
createTileGrid3D(game.scene, hexCells, {
	shape: 'hex', tileSize: 0.7, heightStep: 0.55, origin: [10.5, 0, -1.5],
	tileColor: 0x4c8299, columnColor: 0x315668,
});

//a rolling hill, generated rather than downloaded: greyscale pixel bytes from a sine field,
//the same "computed, not borrowed" shape as tools/make-example-assets.mjs's own art
const heightmapSize = 33;
const heightmapData = new Uint8Array(heightmapSize * heightmapSize * 4);
for (let y = 0; y < heightmapSize; y++) {
	for (let x = 0; x < heightmapSize; x++) {
		const nx = x / (heightmapSize - 1) - 0.5;
		const ny = y / (heightmapSize - 1) - 0.5;
		const height = Math.max(0, Math.cos(Math.hypot(nx, ny) * Math.PI * 1.6)) * 255;
		const pixel = (y * heightmapSize + x) * 4;
		heightmapData[pixel] = heightmapData[pixel + 1] = heightmapData[pixel + 2] = height;
		heightmapData[pixel + 3] = 255;
	}
}
const hill = createHeightmapTerrain3D(
	game.scene,
	{ data: heightmapData, width: heightmapSize, height: heightmapSize },
	{ width: 8, depth: 8, minHeight: 0, maxHeight: 2.5 }
);
hill.position.set(-8, 0, 8);
const hillMaterial = new StandardMaterial('hill-material', game.scene);
hillMaterial.diffuseColor = Color3.FromHexString('#8a9c6a');
hill.material = hillMaterial;

const heroRoot = new TransformNode('mesh-character', game.scene);
const body = CreateCapsule('hero-body', { height: 1.25, radius: 0.3 }, game.scene);
body.parent = heroRoot;
body.position.y = 0.75;
const heroMaterial = new StandardMaterial('hero-material', game.scene);
heroMaterial.diffuseColor = Color3.FromHexString('#f0b35b');
body.material = heroMaterial;

//real collision, not a path-authoring workaround: this is item 144's own fix. The path below
//cuts diagonally straight across the raised ridge (`x >= 6 && y >= 5`) between two flat
//waypoints on purpose, the exact line that used to clip through the column's side - now
//resolveCapsuleAgainstGrid stops the hero flush against it instead, the same way
//rpg.Collision stops a 2D mover at a solid tile's edge
const squareHeights = buildHeightIndex(squareCells);
const hero = new Character3D(heroRoot, [], (from, to) =>
	resolveCapsuleAgainstGrid(from, to, { shape: 'square', heights: squareHeights, maxStepUp: 0 })
);

const path = [[1, 1], [8, 1], [8, 4], [2, 6], [1, 1]] as const;
let pathIndex = 0;
function nextHeroTarget(): void {
	const [x, y] = path[pathIndex++ % path.length];
	const point = gridPoint3D('square', x, y, 1);
	hero.moveTo(point.x, point.y, point.z, 2.2);
}
nextHeroTarget();

const markerSvg = btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="96"><path fill="#d8f2ff" stroke="#18364a" stroke-width="4" d="M32 3 59 31 48 88 16 88 5 31Z"/><circle cx="23" cy="37" r="5"/><circle cx="43" cy="37" r="5"/><path stroke="#18364a" stroke-width="4" d="M21 58q11 10 22 0"/></svg>');
const billboard = Character3D.billboard(game.scene, {
	texture: `data:image/svg+xml;base64,${markerSvg}`, width: 0.8, height: 1.2,
});
billboard.node.position.copyFrom(new Vector3(12.5, 0.9, 1.5));

game.start((deltaSeconds) => {
	if (!hero.update(deltaSeconds)) nextHeroTarget();
});
