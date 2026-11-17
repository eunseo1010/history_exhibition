import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import './style.css';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const scene = new THREE.Scene();
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 1024;
skyCanvas.height = 768;
const skyContext = skyCanvas.getContext('2d');

if (!skyContext) {
  throw new Error('낮 하늘 배경을 생성할 수 없습니다.');
}

function drawSkyBackground() {
  skyCanvas.height = Math.round(
    (skyCanvas.width * window.innerHeight) / window.innerWidth,
  );
  const gradient = skyContext.createLinearGradient(
    0,
    0,
    0,
    skyCanvas.height,
  );
  gradient.addColorStop(0, '#72b7ee');
  gradient.addColorStop(0.55, '#b9def4');
  gradient.addColorStop(1, '#e5f1f8');
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
}

drawSkyBackground();

const skyBackground = new THREE.CanvasTexture(skyCanvas);
skyBackground.colorSpace = THREE.SRGBColorSpace;
scene.background = skyBackground;

const sunCanvas = document.createElement('canvas');
sunCanvas.width = 128;
sunCanvas.height = 128;
const sunContext = sunCanvas.getContext('2d');

if (!sunContext) {
  throw new Error('태양 효과를 생성할 수 없습니다.');
}

const sunGlow = sunContext.createRadialGradient(64, 64, 0, 64, 64, 64);
sunGlow.addColorStop(0, 'rgba(255, 213, 127, 0.36)');
sunGlow.addColorStop(0.35, 'rgba(255, 193, 91, 0.2)');
sunGlow.addColorStop(1, 'rgba(255, 172, 58, 0)');
sunContext.fillStyle = sunGlow;
sunContext.fillRect(0, 0, sunCanvas.width, sunCanvas.height);

const sunDisc = sunContext.createRadialGradient(64, 64, 0, 64, 64, 19);
sunDisc.addColorStop(0, 'rgba(255, 232, 147, 0.96)');
sunDisc.addColorStop(0.68, 'rgba(255, 207, 102, 0.9)');
sunDisc.addColorStop(1, 'rgba(255, 178, 62, 0)');
sunContext.fillStyle = sunDisc;
sunContext.fillRect(45, 45, 38, 38);

const sunTexture = new THREE.CanvasTexture(sunCanvas);
sunTexture.colorSpace = THREE.SRGBColorSpace;
const sunSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: sunTexture,
    color: 0xffc94a,
    depthWrite: false,
    opacity: 0.9,
    toneMapped: false,
    transparent: true,
  }),
);
sunSprite.renderOrder = 1;
scene.add(sunSprite);

const glowCanvas = document.createElement('canvas');
glowCanvas.width = 128;
glowCanvas.height = 128;
const glowContext = glowCanvas.getContext('2d');

if (!glowContext) {
  throw new Error('창문 빛 번짐 효과를 생성할 수 없습니다.');
}

const glowGradient = glowContext.createRadialGradient(64, 64, 4, 64, 64, 64);
glowGradient.addColorStop(0, 'rgba(255, 193, 113, 0.55)');
glowGradient.addColorStop(0.35, 'rgba(255, 163, 76, 0.28)');
glowGradient.addColorStop(1, 'rgba(255, 150, 65, 0)');
glowContext.fillStyle = glowGradient;
glowContext.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

const windowGlowTexture = new THREE.CanvasTexture(glowCanvas);
windowGlowTexture.colorSpace = THREE.SRGBColorSpace;
const windowGlowMaterial = new THREE.SpriteMaterial({
  map: windowGlowTexture,
  color: 0xffb967,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.38,
  toneMapped: false,
  transparent: true,
});

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

scene.add(new THREE.HemisphereLight(0xfff4e5, 0x59634f, 1.15));

const keyLight = new THREE.DirectionalLight(0xfff2dc, 2.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.00015;
keyLight.shadow.normalBias = 0.015;
keyLight.shadow.radius = 3;
keyLight.shadow.autoUpdate = false;
scene.add(keyLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ambientOcclusion = new SSAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight,
);
ambientOcclusion.kernelRadius = 12;
composer.addPass(ambientOcclusion);
composer.addPass(new OutputPass());

const ambientOcclusionResolutionScale = 0.75;

function resizeAmbientOcclusion(width, height) {
  const resolutionScale =
    renderer.getPixelRatio() * ambientOcclusionResolutionScale;
  ambientOcclusion.setSize(
    Math.ceil(width * resolutionScale),
    Math.ceil(height * resolutionScale),
  );
}

resizeAmbientOcclusion(window.innerWidth, window.innerHeight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

let renderRequest = null;

function requestRender() {
  if (renderRequest === null) {
    renderRequest = window.requestAnimationFrame(renderFrame);
  }
}

function renderFrame() {
  renderRequest = null;
  const controlsChanged = controls.update();
  updateSunPosition();
  composer.render();

  if (controlsChanged) {
    requestRender();
  }
}

controls.addEventListener('change', requestRender);

let modelRadius = 1;
let hasModel = false;
let modelBounds;

function updateSunPosition() {
  const distance = camera.far * 0.85;
  const visibleHeight =
    2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const visibleWidth = visibleHeight * camera.aspect;
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
    camera.quaternion,
  );
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

  sunSprite.position
    .copy(camera.position)
    .addScaledVector(direction, distance)
    .addScaledVector(right, visibleWidth * 0.28)
    .addScaledVector(up, visibleHeight * 0.26);
  sunSprite.scale.setScalar(visibleHeight * 0.055);
}

function frameModel(bounds) {
  modelBounds = bounds;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  modelRadius = Math.max(sphere.radius, 0.01);

  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(
    Math.tan(verticalFov / 2) * camera.aspect,
  );
  const distance =
    (modelRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.15;

  camera.near = Math.max(modelRadius / 1000, 0.01);
  camera.far = distance + modelRadius * 10;
  camera.position
    .set(1, 0.72, 1.25)
    .normalize()
    .multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = modelRadius * 0.1;
  controls.maxDistance = distance * 10;
  controls.update();
  updateSunPosition();
}

function configureModelLighting(model, bounds, placement) {
  const centeredBounds = bounds.clone().translate(placement.position);
  const sphere = centeredBounds.getBoundingSphere(new THREE.Sphere());
  const center = centeredBounds.getCenter(new THREE.Vector3());
  const radius = Math.max(sphere.radius, 0.01);
  const sunDirection = new THREE.Vector3(-0.65, 1, 0.55).normalize();

  keyLight.position.copy(center).addScaledVector(sunDirection, radius * 2.5);
  keyLight.target.position.copy(center);
  scene.add(keyLight.target);

  const shadowCamera = keyLight.shadow.camera;
  const shadowExtent = radius * 1.15;
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = Math.max(radius * 0.005, 0.1);
  shadowCamera.far = radius * 5;
  shadowCamera.updateProjectionMatrix();

  ambientOcclusion.minDistance = radius * 0.0002;
  ambientOcclusion.maxDistance = radius * 0.006;

  model.traverse((object) => {
    if (!object.isMesh) return;

    const isDenseGrass = /_Grass_Blades$/.test(object.name);
    object.castShadow = !isDenseGrass;
    object.receiveShadow = true;
  });

  keyLight.shadow.needsUpdate = true;
}

function addWarmInteriorLights(model) {
  const pavilion = model.getObjectByName('Pavilion');
  const house = model.getObjectByName('House');

  if (!pavilion || !house) {
    throw new Error('실내 조명 대상인 Pavilion 또는 House 오브젝트를 찾지 못했습니다.');
  }

  const addInteriorLight = (object, heightFraction, intensity, distance) => {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const light = new THREE.PointLight(0xffc28a, intensity, distance, 2);

    light.position.set(
      center.x,
      bounds.min.y + size.y * heightFraction,
      center.z,
    );
    scene.add(light);
    return light;
  };

  const pavilionLight = addInteriorLight(pavilion, 0.24, 48, 10);
  addInteriorLight(house, 0.4, 20, 10);

  const pavilionGlowMaterial = windowGlowMaterial.clone();
  pavilionGlowMaterial.opacity = 0.24;
  const pavilionGlow = new THREE.Sprite(pavilionGlowMaterial);
  pavilionGlow.position.copy(pavilionLight.position);
  pavilionGlow.scale.set(2.4, 2.4, 1);
  scene.add(pavilionGlow);

  house.updateWorldMatrix(true, false);
  const windowNormal = new THREE.Vector3(1, 0, 0)
    .transformDirection(house.matrixWorld);

  for (const side of [-1, 1]) {
    const windowPosition = house.localToWorld(
      new THREE.Vector3(-7.77, 118.1, side * 74),
    );
    windowPosition.addScaledVector(windowNormal, 0.025);

    const glow = new THREE.Sprite(windowGlowMaterial);
    glow.position.copy(windowPosition);
    glow.scale.set(1.7, 2, 1);
    scene.add(glow);

    const spill = new THREE.PointLight(0xffb875, 6, 4.5, 2);
    spill.position.copy(windowPosition).addScaledVector(windowNormal, -0.18);
    scene.add(spill);
  }
}

const npcPlacements = [
  { name: 'NPC_A', file: 'NPC_A.glb', x: -0.5, z: 10.3, direction: [0, 1] },
  { name: 'NPC_B', file: 'NPC_B.glb', x: -8.8, z: 0.2, direction: [1, 0] },
  { name: 'NPC_C', file: 'NPC_C.glb', x: -8.2, z: -9, direction: [1, 1] },
  { name: 'NPC_J', file: 'NPC_J.glb', x: 9, z: -5, direction: [-1, 1] },
  { name: 'NPC_U', file: 'NPC_U.glb', x: 0, z: -7, direction: [0, -1] },
];

const groundSurfaceNames = new Set([
  'Center_Grass',
  'Center_Grass_Blades',
  'Center_Pavement',
  'Center_Pavement_Pavers',
  'Main_Field',
  'Main_Grass',
  'Main_Grass_Blades',
  'Pavement',
  'Pavement_Pavers',
  'Stairs_Pavers',
]);

function addNpcs(model, mapBounds, mapCenter) {
  const wood = model.getObjectByName('Wood');
  if (!wood) {
    throw new Error('NPC 크기 기준인 Wood 오브젝트를 찾지 못했습니다.');
  }

  const woodBounds = new THREE.Box3().setFromObject(wood);
  const woodHeight = woodBounds.getSize(new THREE.Vector3()).y;
  if (!Number.isFinite(woodHeight) || woodHeight <= 0) {
    throw new Error('Wood 오브젝트의 높이를 확인할 수 없습니다.');
  }

  const groundSurfaces = [];
  model.traverse((object) => {
    if (object.isMesh && groundSurfaceNames.has(object.name)) {
      groundSurfaces.push(object);
    }
  });
  if (groundSurfaces.length === 0) {
    throw new Error('NPC 배치에 사용할 지면 메시를 찾지 못했습니다.');
  }
  scene.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  raycaster.far = mapBounds.getSize(new THREE.Vector3()).y + 100;
  const loader = new GLTFLoader();

  return Promise.all(
    npcPlacements.map(
      (placement) =>
        new Promise((resolve, reject) => {
          loader.load(
            `${import.meta.env.BASE_URL}models/${placement.file}`,
            (gltf) => {
              const characterBounds = new THREE.Box3().setFromObject(gltf.scene);
              const characterSize = characterBounds.getSize(new THREE.Vector3());
              if (!Number.isFinite(characterSize.y) || characterSize.y <= 0) {
                reject(new Error(`${placement.file}의 높이를 확인할 수 없습니다.`));
                return;
              }

              const targetX = placement.x - mapCenter.x;
              const targetZ = placement.z - mapCenter.z;
              const origin = new THREE.Vector3(
                targetX,
                mapBounds.max.y - mapCenter.y + 1,
                targetZ,
              );
              raycaster.set(origin, new THREE.Vector3(0, -1, 0));
              const groundHit = raycaster.intersectObjects(groundSurfaces, false)[0];
              if (!groundHit) {
                reject(
                  new Error(
                    `${placement.name} 위치(${placement.x}, ${placement.z})에서 지면을 찾지 못했습니다.`,
                  ),
                );
                return;
              }

              const root = new THREE.Group();
              root.name = placement.name;
              root.position.set(
                targetX,
                groundHit.point.y,
                targetZ,
              );
              root.rotation.y = Math.atan2(
                placement.direction[0],
                placement.direction[1],
              );
              root.scale.setScalar(woodHeight / characterSize.y);
              gltf.scene.position.set(
                -characterBounds.getCenter(new THREE.Vector3()).x,
                -characterBounds.min.y,
                -characterBounds.getCenter(new THREE.Vector3()).z,
              );
              gltf.scene.traverse((object) => {
                if (object.isMesh) {
                  object.castShadow = true;
                  object.receiveShadow = true;
                }
              });
              root.add(gltf.scene);
              scene.add(root);
              resolve();
            },
            undefined,
            (error) => reject(new Error(`${placement.file}을(를) 불러오지 못했습니다.`, { cause: error })),
          );
        }),
    ),
  );
}

const loader = new GLTFLoader();
loader.load(
  `${import.meta.env.BASE_URL}models/Map.glb`,
  (gltf) => {
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const placement = new THREE.Group();

    placement.position.copy(center).negate();
    placement.add(gltf.scene);
    scene.add(placement);

    configureModelLighting(gltf.scene, bounds, placement);
    addWarmInteriorLights(gltf.scene);
    addNpcs(gltf.scene, bounds, center)
      .then(() => {
        hasModel = true;
        frameModel(bounds);
        loading.hidden = true;
        requestRender();
      })
      .catch((error) => {
        console.error('NPC 캐릭터를 불러오거나 배치하지 못했습니다.', error);
        loading.textContent = `NPC 캐릭터를 불러오지 못했습니다: ${error.message}`;
        loading.classList.add('loading-error');
      });
  },
  (event) => {
    if (event.total > 0) {
      const percent = Math.round((event.loaded / event.total) * 100);
      loading.textContent = `3D 맵을 불러오는 중... ${percent}%`;
    } else {
      const megabytes = (event.loaded / (1024 * 1024)).toFixed(0);
      loading.textContent = `3D 맵을 불러오는 중... ${megabytes}MB`;
    }
  },
  (error) => {
    console.error('Map.glb를 불러오지 못했습니다.', error);
    loading.textContent =
      '3D 맵을 불러오지 못했습니다. public/models/Map.glb 파일을 확인해 주세요.';
    loading.classList.add('loading-error');
  },
);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  drawSkyBackground();
  skyBackground.needsUpdate = true;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  resizeAmbientOcclusion(width, height);

  if (hasModel && modelBounds) {
    frameModel(modelBounds);
  }

  requestRender();
}

window.addEventListener('resize', resize);
requestRender();
