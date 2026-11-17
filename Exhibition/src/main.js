import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import './style.css';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090a0b);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.64;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const environment = new THREE.PMREMGenerator(renderer);
scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.16;

scene.add(new THREE.HemisphereLight(0xc9d2dc, 0x171311, 0.12));

const keyLight = new THREE.DirectionalLight(0xe4d9c7, 0.85);
keyLight.position.set(-90, 150, 100);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 500;
keyLight.shadow.bias = -0.00015;
keyLight.shadow.normalBias = 0.025;
scene.add(keyLight);

const warmLight = new THREE.PointLight(0xffa66d, 450, 130, 2);
warmLight.castShadow = false;
scene.add(warmLight);
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0xffc28e,
  toneMapped: true,
});
const glowSource = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 12, 8),
  glowMaterial,
);
scene.add(glowSource);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.5, 0.88));
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 500;
controls.maxPolarAngle = Math.PI * 0.49;

function createMarbleTexture() {
  const size = 1024;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  if (!context) {
    throw new Error('대리석 텍스처 캔버스를 만들 수 없습니다.');
  }

  context.fillStyle = '#d9d4ca';
  context.fillRect(0, 0, size, size);

  let seed = 193;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 9000; i += 1) {
    const shade = random() > 0.5 ? 255 : 96;
    const alpha = 0.012 + random() * 0.024;
    context.fillStyle = `rgba(${shade}, ${shade - 2}, ${shade - 5}, ${alpha})`;
    const x = random() * size;
    const y = random() * size;
    const radius = 0.2 + random() * 1.2;
    context.fillRect(x, y, radius, radius);
  }

  for (let i = 0; i < 54; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = size * (0.18 + random() * 0.72);
    const drift = (random() - 0.5) * size * 0.4;
    const alpha = 0.1 + random() * 0.13;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(
      x + drift * 0.35,
      y + length * 0.28,
      x - drift * 0.45,
      y + length * 0.72,
      x + drift,
      y + length,
    );
    context.strokeStyle = `rgba(106, 105, 101, ${alpha})`;
    context.lineWidth = 0.9 + random() * 2.6;
    context.stroke();

    if (i % 3 === 0) {
      context.beginPath();
      context.moveTo(x + drift * 0.2, y + length * 0.52);
      context.bezierCurveTo(
        x + drift * 0.6,
        y + length * 0.58,
        x + drift * 0.8,
        y + length * 0.69,
        x + drift * 1.3,
        y + length * 0.76,
      );
      context.strokeStyle = `rgba(132, 125, 115, ${alpha * 0.55})`;
      context.lineWidth = 0.6;
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.7, 0.7);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function assignMaterial(root, name, material) {
  const object = root.getObjectByName(name);
  if (!object) {
    console.warn(`모델에서 ${name} 오브젝트를 찾지 못했습니다.`);
    return null;
  }
  object.traverse((child) => {
    if (child.isMesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

const marbleMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xe9e3d8,
  map: createMarbleTexture(),
  roughness: 0.34,
  metalness: 0.025,
  clearcoat: 0.16,
  clearcoatRoughness: 0.42,
});
const metalMaterial = new THREE.MeshStandardMaterial({
  color: 0xb29470,
  metalness: 0.9,
  roughness: 0.29,
});
const controlsTarget = new THREE.Vector3();
const modelLoader = new GLTFLoader();

modelLoader.load(
  '/models/Exhibition_map.glb',
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    const map = assignMaterial(model, 'Exhibition_map', marbleMaterial);
    assignMaterial(model, 'One', metalMaterial);
    assignMaterial(model, 'Two', metalMaterial);

    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z);
    const mapBounds = map ? new THREE.Box3().setFromObject(map) : bounds;
    const one = model.getObjectByName('One');
    const two = model.getObjectByName('Two');
    const displayBounds = new THREE.Box3();
    if (one) displayBounds.expandByObject(one);
    if (two) displayBounds.expandByObject(two);
    if (displayBounds.isEmpty()) displayBounds.copy(bounds);
    displayBounds.getCenter(controlsTarget);

    warmLight.position.set(
      THREE.MathUtils.clamp(controlsTarget.x, mapBounds.min.x, mapBounds.max.x),
      THREE.MathUtils.clamp(
        controlsTarget.y + displayBounds.getSize(new THREE.Vector3()).y * 0.35,
        mapBounds.min.y,
        mapBounds.max.y,
      ),
      mapBounds.min.z + mapBounds.getSize(new THREE.Vector3()).z * 0.14,
    );
    glowSource.position.copy(warmLight.position);
    glowSource.scale.setScalar(Math.max(largestDimension * 0.0025, 0.15));

    keyLight.target.position.copy(controlsTarget);
    scene.add(keyLight.target);
    keyLight.shadow.camera.left = -largestDimension * 0.7;
    keyLight.shadow.camera.right = largestDimension * 0.7;
    keyLight.shadow.camera.top = largestDimension * 0.7;
    keyLight.shadow.camera.bottom = -largestDimension * 0.7;
    keyLight.shadow.camera.updateProjectionMatrix();

    const displaySize = displayBounds.getSize(new THREE.Vector3());
    camera.position.set(
      controlsTarget.x + largestDimension * 0.25,
      controlsTarget.y + largestDimension * 0.85,
      controlsTarget.z + largestDimension * 0.45,
    );
    camera.near = Math.max(0.1, largestDimension / 1000);
    camera.far = largestDimension * 8;
    camera.updateProjectionMatrix();
    controls.target.copy(controlsTarget);
    controls.minDistance = largestDimension * 0.18;
    controls.maxDistance = largestDimension * 3.2;
    controls.update();

    status.hidden = true;
  },
  undefined,
  (error) => {
    console.error('전시 모델을 불러오지 못했습니다.', error);
    status.textContent = '모델을 불러오지 못했습니다. 개발자 도구의 오류를 확인해 주세요.';
  },
);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  composer.render();
});
