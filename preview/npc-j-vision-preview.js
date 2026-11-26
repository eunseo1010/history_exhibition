import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SETTINGS = Object.freeze({
  sightDistance: 4,
  fieldOfViewDegrees: 80,
  speed: 0.65,
  waypointCount: 16,
});

const canvas = document.querySelector('#scene');
const statusElement = document.querySelector('#status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfc8c0);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(7, 9, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.HemisphereLight(0xfff4dc, 0x5d6b5a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(5, 10, 4);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 24),
  new THREE.MeshStandardMaterial({ color: 0x7a9d62, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

for (let i = 0; i < 140; i++) {
  const grass = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.28, 3),
    new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x5d7e47 : 0x88a66a }),
  );
  const angle = (i * 2.399963) % (Math.PI * 2);
  const radius = 1.8 + (i * 0.113) % 7;
  grass.position.set(Math.cos(angle) * radius, 0.14, Math.sin(angle) * radius);
  grass.rotation.y = i * 0.37;
  scene.add(grass);
}

const npcJ = new THREE.Group();
npcJ.name = 'NPC_J_preview';
npcJ.position.set(0, 0, 0);
scene.add(npcJ);

new GLTFLoader().load('/models/NPC_J.glb', (gltf) => {
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const targetHeight = 1.7;
  if (size.y > 0) gltf.scene.scale.setScalar(targetHeight / size.y);
  gltf.scene.position.y = -bounds.min.y * (targetHeight / size.y);
  npcJ.add(gltf.scene);
});

const player = new THREE.Group();
player.position.set(-3.2, 0, 2.4);
const playerBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.32, 0.75, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x5f8fc7 }),
);
playerBody.position.y = 0.7;
player.add(playerBody);
scene.add(player);

function createSectorGeometry(radius, angleDegrees, segments = 48) {
  const halfAngle = THREE.MathUtils.degToRad(angleDegrees / 2);
  const positions = [0, 0, 0];
  for (let i = 0; i <= segments; i++) {
    const angle = -halfAngle + (i / segments) * halfAngle * 2;
    positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  }
  const indices = [];
  for (let i = 1; i <= segments; i++) indices.push(0, i, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const sector = new THREE.Mesh(
  createSectorGeometry(SETTINGS.sightDistance, SETTINGS.fieldOfViewDegrees),
  new THREE.MeshBasicMaterial({
    color: 0xff3131,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
sector.renderOrder = 20;
sector.position.set(0, 0.025, 0);
scene.add(sector);

const borderPositions = [];
const halfAngle = THREE.MathUtils.degToRad(SETTINGS.fieldOfViewDegrees / 2);
for (let i = 0; i <= 48; i++) {
  const angle = -halfAngle + (i / 48) * halfAngle * 2;
  borderPositions.push(
    Math.sin(angle) * SETTINGS.sightDistance,
    0,
    Math.cos(angle) * SETTINGS.sightDistance,
  );
}
borderPositions.push(
  0, 0, 0,
  Math.sin(-halfAngle) * SETTINGS.sightDistance, 0,
  Math.cos(-halfAngle) * SETTINGS.sightDistance,
  0, 0, 0,
  Math.sin(halfAngle) * SETTINGS.sightDistance, 0,
  Math.cos(halfAngle) * SETTINGS.sightDistance,
);
const borderGeometry = new THREE.BufferGeometry();
borderGeometry.setAttribute('position', new THREE.Float32BufferAttribute(borderPositions, 3));
const border = new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({
  color: 0xff3030,
  transparent: true,
  opacity: 0.95,
  depthTest: true,
  depthWrite: false,
}));
border.renderOrder = 21;
border.position.set(0, 0.032, 0);
scene.add(border);

const path = [];
for (let i = 0; i < SETTINGS.waypointCount; i++) {
  const angle = (i / SETTINGS.waypointCount) * Math.PI * 2;
  path.push(new THREE.Vector3(Math.cos(angle) * 5.2, 0, Math.sin(angle) * 5.2));
}
let waypointIndex = 0;
const forward = new THREE.Vector3(0, 0, 1);

function isInView(npcPosition, facing, targetPosition) {
  const dx = targetPosition.x - npcPosition.x;
  const dz = targetPosition.z - npcPosition.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance > SETTINGS.sightDistance) return false;
  if (distance < 0.0001) return true;
  const facingLength = Math.hypot(facing.x, facing.z);
  const cosine = (dx * facing.x + dz * facing.z) / (distance * facingLength);
  return cosine >= Math.cos((SETTINGS.fieldOfViewDegrees * Math.PI) / 360);
}

const keys = new Set();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  let remaining = SETTINGS.speed * dt;
  while (remaining > 0.00001) {
    const goal = path[waypointIndex];
    const dx = goal.x - npcJ.position.x;
    const dz = goal.z - npcJ.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.0001) {
      waypointIndex = (waypointIndex + 1) % path.length;
      continue;
    }
    const move = Math.min(remaining, distance);
    const nx = npcJ.position.x + (dx / distance) * move;
    const nz = npcJ.position.z + (dz / distance) * move;
    npcJ.position.set(nx, 0, nz);
    forward.set(dx / distance, 0, dz / distance);
    npcJ.rotation.y = Math.atan2(forward.x, forward.z);
    remaining -= move;
    if (move >= distance - 0.00001) waypointIndex = (waypointIndex + 1) % path.length;
  }

  const playerMove = new THREE.Vector3();
  if (keys.has('KeyW')) playerMove.z -= 1;
  if (keys.has('KeyS')) playerMove.z += 1;
  if (keys.has('KeyA')) playerMove.x -= 1;
  if (keys.has('KeyD')) playerMove.x += 1;
  if (playerMove.lengthSq() > 0) {
    playerMove.normalize().multiplyScalar(3.2 * dt);
    const candidate = player.position.clone().add(playerMove);
    candidate.x = THREE.MathUtils.clamp(candidate.x, -10, 10);
    candidate.z = THREE.MathUtils.clamp(candidate.z, -10, 10);
    player.position.copy(candidate);
  }

  sector.position.set(npcJ.position.x, 0.025, npcJ.position.z);
  border.position.set(npcJ.position.x, 0.032, npcJ.position.z);
  sector.rotation.y = npcJ.rotation.y;
  border.rotation.y = npcJ.rotation.y;

  const detected = isInView(npcJ.position, forward, player.position);
  statusElement.textContent = detected ? '시야 안 - 감지 판정 일치' : '시야 밖';
  statusElement.style.color = detected ? '#ff8585' : '#ffd9d9';

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
