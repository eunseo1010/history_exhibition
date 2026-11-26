import * as THREE from 'three';

const FOG_COLOR = 0xf1c4ad;
const FOG_DENSITY = 0.0032;

const FOREST_LAYOUT = [
  [-0.95, 0.05],
  [-0.72, 0.42],
  [-0.46, -0.3],
  [-0.18, 0.68],
  [0.12, -0.48],
  [0.36, 0.28],
  [0.62, -0.2],
  [0.84, 0.5],
  [1.05, -0.38],
];

const HILL_LAYOUT = [
  [-0.98, 0.7, 0.95],
  [-0.72, 0.48, 0.72],
  [-0.42, 0.82, 0.58],
  [-0.12, 0.52, 0.85],
  [0.18, 0.76, 0.64],
  [0.48, 0.55, 0.92],
  [0.78, 0.86, 0.72],
  [1.02, 0.58, 0.88],
];

const TOWN_LAYOUT = [
  [-0.86, 0.18, 0.8],
  [-0.62, 0.42, 0.62],
  [-0.35, 0.2, 0.92],
  [0.12, 0.3, 0.76],
  [0.38, 0.52, 0.58],
  [0.68, 0.24, 0.88],
  [0.9, 0.43, 0.66],
];

function makeMaterial(color, roughness = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness,
  });
}

export function addMapEnvironment(scene, mapBounds) {
  const size = mapBounds.getSize(new THREE.Vector3());
  const mapRadius = Math.max(size.x, size.z) * 0.5;
  if (!Number.isFinite(mapRadius) || mapRadius <= 0) {
    throw new Error('배경 환경을 배치할 맵 크기를 확인할 수 없습니다.');
  }

  const groundY = mapBounds.min.y + size.y * 0.12;
  const background = new THREE.Group();
  background.name = 'DISTANT_MAP_ENVIRONMENT';

  const outerRadius = mapRadius * 16;
  const groundShape = new THREE.Shape();
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    const point = new THREE.Vector2(
      Math.cos(angle) * outerRadius,
      Math.sin(angle) * outerRadius,
    );
    if (index === 0) groundShape.moveTo(point.x, point.y);
    else groundShape.lineTo(point.x, point.y);
  }
  groundShape.closePath();

  const halfWidth = Math.max(size.x * 0.5 - 1.5, 0.5);
  const halfDepth = Math.max(size.z * 0.5 - 1.5, 0.5);
  const mapCenter = mapBounds.getCenter(new THREE.Vector3());
  const footprint = new THREE.Path();
  footprint.moveTo(mapCenter.x - halfWidth, mapCenter.z - halfDepth);
  footprint.lineTo(mapCenter.x - halfWidth, mapCenter.z + halfDepth);
  footprint.lineTo(mapCenter.x + halfWidth, mapCenter.z + halfDepth);
  footprint.lineTo(mapCenter.x + halfWidth, mapCenter.z - halfDepth);
  footprint.closePath();
  groundShape.holes.push(footprint);

  const ground = new THREE.Mesh(
    new THREE.ShapeGeometry(groundShape),
    makeMaterial(0x9b7759),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = false;
  background.add(ground);

  const hillGeometry = new THREE.IcosahedronGeometry(1, 1);
  const hillMaterials = [
    makeMaterial(0xa58b68),
    makeMaterial(0xb29a78),
    makeMaterial(0x92755b),
  ];
  for (const [direction, distanceScale, sizeScale] of HILL_LAYOUT) {
    const angle = direction * Math.PI;
    const distance = mapRadius * (3.4 + distanceScale * 0.9);
    const radius = mapRadius * (0.62 + sizeScale * 0.34);
    const height = mapRadius * (0.3 + sizeScale * 0.2);
    const hill = new THREE.Mesh(
      hillGeometry,
      hillMaterials[Math.round(sizeScale * 10) % hillMaterials.length],
    );
    hill.position.set(Math.sin(angle) * distance, groundY + height * 0.5, Math.cos(angle) * distance);
    hill.scale.set(radius, height, radius);
    hill.rotation.y = direction * 2.3;
    background.add(hill);
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.17, 0.26, 1, 5);
  const foliageGeometry = new THREE.ConeGeometry(0.72, 1, 6, 1);
  const trunkMaterial = makeMaterial(0x80664c);
  const foliageMaterials = [
    makeMaterial(0x657d61),
    makeMaterial(0x73866a),
    makeMaterial(0x829176),
  ];
  for (const [direction, distanceScale, sizeScale] of FOREST_LAYOUT) {
    const angle = direction * Math.PI;
    const distance = mapRadius * (2.05 + distanceScale * 0.34);
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const treeHeight = mapRadius * (0.2 + sizeScale * 0.045);
    const treeCount = 1 + (Math.round((direction + 1) * 5) % 3);

    for (let index = 0; index < treeCount; index += 1) {
      const offset = (index - (treeCount - 1) / 2) * mapRadius * 0.12;
      const tree = new THREE.Group();
      tree.position.set(x + offset, groundY, z - offset * 0.6);
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = treeHeight * 0.24;
      trunk.scale.set(treeHeight * 0.12, treeHeight * 0.48, treeHeight * 0.12);
      const foliage = new THREE.Mesh(
        foliageGeometry,
        foliageMaterials[(index + Math.round((direction + 1) * 3)) % foliageMaterials.length],
      );
      foliage.position.y = treeHeight * 0.62;
      foliage.scale.set(treeHeight * 0.5, treeHeight * 0.8, treeHeight * 0.5);
      tree.add(trunk, foliage);
      background.add(tree);
    }
  }

  const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
  const roofGeometry = new THREE.ConeGeometry(0.72, 0.48, 4, 1);
  const buildingMaterials = [
    makeMaterial(0xa89b80),
    makeMaterial(0x958a77),
    makeMaterial(0xb2a58b),
  ];
  const roofMaterial = makeMaterial(0x887567);
  for (const [direction, distanceScale, sizeScale] of TOWN_LAYOUT) {
    const angle = direction * Math.PI;
    const distance = mapRadius * (3.05 + distanceScale * 0.5);
    const width = mapRadius * (0.18 + sizeScale * 0.08);
    const height = mapRadius * (0.18 + sizeScale * 0.12);
    const building = new THREE.Group();
    building.position.set(
      Math.sin(angle) * distance,
      groundY,
      Math.cos(angle) * distance,
    );
    const body = new THREE.Mesh(
      buildingGeometry,
      buildingMaterials[Math.round(sizeScale * 10) % buildingMaterials.length],
    );
    body.position.y = height * 0.5;
    body.scale.set(width, height, width * 0.8);
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + width * 0.18;
    roof.scale.set(width * 0.9, width * 0.45, width * 0.9);
    roof.rotation.y = Math.PI / 4;
    building.add(body, roof);
    background.add(building);
  }

  scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
  scene.add(background);

  return { farClip: mapRadius * 40, group: background };
}
