
import * as THREE from 'three';
import { questSystem } from './QuestSystem.js';

// =====================================
// 1. 기본 3D 설정
// =====================================

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.style.fontFamily = 'Arial, sans-serif';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x252b35);

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

const renderer = new THREE.WebGLRenderer({
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

document.body.appendChild(renderer.domElement);

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x7d8490,
    2.3
  )
);

const sunlight = new THREE.DirectionalLight(
  0xffffff,
  2.2
);

sunlight.position.set(5, 12, 7);
scene.add(sunlight);

// =====================================
// 2. 재질 및 전시관
// =====================================

const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0xe9e3d8
});

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0xb8ad9b
});

const woodMaterial = new THREE.MeshStandardMaterial({
  color: 0x79583f
});

const blueMaterial = new THREE.MeshStandardMaterial({
  color: 0x54748c
});

const goldMaterial = new THREE.MeshStandardMaterial({
  color: 0xd5ad63
});

const obstacles = [];

function box(
  width,
  height,
  depth,
  x,
  y,
  z,
  material,
  solid = false
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material
  );

  mesh.position.set(x, y, z);
  scene.add(mesh);

  if (solid) {
    obstacles.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });
  }

  return mesh;
}

// 바닥
box(30, 0.2, 30, 0, -0.1, 0, floorMaterial);

// 외벽
box(30, 4, 0.3, 0, 2, -15, wallMaterial, true);
box(30, 4, 0.3, 0, 2, 15, wallMaterial, true);
box(0.3, 4, 30, -15, 2, 0, wallMaterial, true);
box(0.3, 4, 30, 15, 2, 0, wallMaterial, true);

// 전시실 구분 벽: 양쪽에 출입구
box(4.5, 4, 0.3, -12.75, 2, 0, wallMaterial, true);
box(7.5, 4, 0.3, -3.75, 2, 0, wallMaterial, true);
box(7.5, 4, 0.3, 3.75, 2, 0, wallMaterial, true);
box(4.5, 4, 0.3, 12.75, 2, 0, wallMaterial, true);

box(3, 1.2, 0.3, -9, 3.4, 0, wallMaterial);
box(3, 1.2, 0.3, 9, 3.4, 0, wallMaterial);

// 두 전시실 사이 벽
box(0.3, 4, 15, 0, 2, -7.5, wallMaterial, true);

// =====================================
// 3. 3인칭 캐릭터
// =====================================

const player = new THREE.Group();
player.position.set(0, 0, 9);
scene.add(player);

const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.36, 0.85, 6, 12),
  blueMaterial
);
body.position.y = 1.05;
player.add(body);

const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0xf1c9a8
  })
);
head.position.y = 1.95;
player.add(head);

const hair = new THREE.Mesh(
  new THREE.SphereGeometry(0.29, 16, 16),
  new THREE.MeshStandardMaterial({
    color: 0x292324
  })
);
hair.position.y = 2.09;
hair.scale.y = 0.55;
player.add(hair);

// 캐릭터의 앞쪽 표시
const front = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.3, 0.08),
  goldMaterial
);
front.position.set(0, 1.2, 0.37);
player.add(front);

// =====================================
// 4. NPC와 전시물 만들기
// =====================================

const interactables = [];

function makeNPC(x, z) {
  const npc = new THREE.Group();
  npc.position.set(x, 0, z);

  const npcBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.9, 6, 12),
    new THREE.MeshStandardMaterial({
      color: 0x7d604f
    })
  );

  npcBody.position.y = 1.05;
  npc.add(npcBody);

  const npcHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xeec4a3
    })
  );

  npcHead.position.y = 2;
  npc.add(npcHead);

  scene.add(npc);

  interactables.push({
    type: 'npc',
    name: '전시관 안내원',
    object: npc
  });
}

function makeExhibit(
  x,
  z,
  title,
  clueId,
  description
) {
  // 전시대
  box(2.8, 1, 1.7, x, 0.5, z, woodMaterial, true);

  // 전시물
  const exhibit = new THREE.Group();
  exhibit.position.set(x, 1.35, z);

  const artifact = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.16, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xf0d9a7
    })
  );

  exhibit.add(artifact);

  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.25),
    goldMaterial
  );

  marker.position.y = 0.75;
  exhibit.add(marker);

  scene.add(exhibit);

  interactables.push({
    type: 'clue',
    name: title,
    clueId,
    description,
    object: exhibit,
    marker
  });
}

// NPC: 로비
makeNPC(0, 5);

// 왼쪽 전시실
makeExhibit(
  -10,
  -8,
  '독립선언서',
  'clue_01',
  '1919년 3월 1일, 독립 의지를 알린 역사적 선언문입니다.'
);

makeExhibit(
  -5,
  -8,
  '태극기',
  'clue_02',
  '3·1운동 당시 독립을 향한 열망을 상징합니다.'
);

// 오른쪽 전시실
makeExhibit(
  8,
  -8,
  '만세운동 기록',
  'clue_03',
  '전국으로 확산된 독립 만세 운동의 기록입니다.'
);

// =====================================
// 5. 화면 UI
// =====================================

const ui = document.createElement('div');

ui.innerHTML = `
  <div id="quest-hud">
    <strong>3·1운동의 흔적을 찾아서</strong>
    <p id="quest-objective"></p>
    <p id="quest-progress"></p>
  </div>

  <div id="controls-hud">
    WASD 이동 · 마우스 드래그 시점 회전 · E 상호작용
  </div>

  <div id="interaction-prompt"></div>

  <div id="dialog-overlay">
    <div id="dialog-box">
      <h2 id="dialog-title"></h2>
      <p id="dialog-text"></p>
      <div id="dialog-buttons"></div>
    </div>
  </div>

  <div id="toast"></div>
`;

document.body.appendChild(ui);

const style = document.createElement('style');

style.textContent = `
  #quest-hud {
    position: fixed;
    top: 20px;
    left: 20px;
    width: 290px;
    padding: 18px;
    color: white;
    background: rgba(15, 20, 30, 0.85);
    border-radius: 12px;
    line-height: 1.5;
    pointer-events: none;
  }

  #quest-hud strong {
    font-size: 18px;
  }

  #quest-hud p {
    margin: 10px 0 0;
    font-size: 14px;
  }

  #controls-hud {
    position: fixed;
    bottom: 20px;
    left: 20px;
    color: white;
    background: rgba(15, 20, 30, 0.8);
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    pointer-events: none;
  }

  #interaction-prompt {
    display: none;
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    background: rgba(15, 20, 30, 0.9);
    padding: 14px 22px;
    border: 1px solid #d5ad63;
    border-radius: 10px;
    font-size: 16px;
    pointer-events: none;
  }

  #dialog-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    align-items: center;
    justify-content: center;
  }

  #dialog-box {
    width: min(500px, 85vw);
    padding: 28px;
    background: #303947;
    color: white;
    border-radius: 14px;
    line-height: 1.7;
  }

  #dialog-box h2 {
    margin-top: 0;
    color: #f0d18e;
  }

  #dialog-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 20px;
  }

  #dialog-buttons button {
    border: none;
    border-radius: 8px;
    padding: 12px 18px;
    background: #e6bf76;
    color: #20242c;
    font-weight: bold;
    cursor: pointer;
  }

  #toast {
    display: none;
    position: fixed;
    top: 22%;
    left: 50%;
    transform: translateX(-50%);
    padding: 16px 25px;
    background: rgba(20, 35, 30, 0.95);
    color: #9df0b5;
    border-radius: 10px;
    font-weight: bold;
    text-align: center;
    pointer-events: none;
  }
`;

document.head.appendChild(style);

const objectiveEl = document.getElementById('quest-objective');
const progressEl = document.getElementById('quest-progress');
const promptEl = document.getElementById('interaction-prompt');
const overlay = document.getElementById('dialog-overlay');
const dialogTitle = document.getElementById('dialog-title');
const dialogText = document.getElementById('dialog-text');
const dialogButtons = document.getElementById('dialog-buttons');
const toast = document.getElementById('toast');

let dialogOpen = false;
let toastTimeout;

function showToast(message) {
  toast.textContent = message;
  toast.style.display = 'block';

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

function closeDialog() {
  overlay.style.display = 'none';
  dialogOpen = false;
}

function showDialog(title, text, actions) {
  dialogOpen = true;

  dialogTitle.textContent = title;
  dialogText.textContent = text;
  dialogButtons.replaceChildren();

  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = action.label;

    button.addEventListener('click', () => {
      action.onClick();
    });

    dialogButtons.appendChild(button);
  }

  overlay.style.display = 'flex';
}

// =====================================
// 6. 퀘스트 시스템 연결
// =====================================

questSystem.subscribe((state) => {
  objectiveEl.textContent = state.objective;

  progressEl.textContent =
    `단서 수집: ${state.collectedCount} / ${state.totalCount}`;

  for (const item of interactables) {
    if (item.type !== 'clue') continue;

    const collected = state.clues.some(
      clue =>
        clue.id === item.clueId &&
        clue.collected
    );

    item.marker.visible = !collected;
  }
});

function interactWith(item) {
  const state = questSystem.getState();

  // NPC 대화
  if (item.type === 'npc') {
    if (state.status === 'not_started') {
      showDialog(
        '전시관 안내원',
        '어서 오세요. 1919년 3·1운동의 역사를 살펴보고, 전시관에 남겨진 세 가지 단서를 찾아주시겠어요?',
        [
          {
            label: '퀘스트 시작',
            onClick: () => {
              questSystem.startQuest();
              closeDialog();
              showToast('새로운 퀘스트가 시작되었습니다!');
            }
          },
          {
            label: '나중에',
            onClick: closeDialog
          }
        ]
      );
    } else if (state.status === 'in_progress') {
      showDialog(
        '전시관 안내원',
        '전시실에 있는 독립선언서, 태극기, 만세운동 기록을 조사해 주세요.',
        [
          {
            label: '확인',
            onClick: closeDialog
          }
        ]
      );
    } else {
      showDialog(
        '전시관 안내원',
        '모든 단서를 찾으셨군요! 3·1운동의 역사를 기억해 주셔서 감사합니다.',
        [
          {
            label: '대화 종료',
            onClick: closeDialog
          }
        ]
      );
    }

    return;
  }

  // 전시물 조사
  const collected = state.clues.some(
    clue =>
      clue.id === item.clueId &&
      clue.collected
  );

  const actions = [];

  if (state.status === 'in_progress' && !collected) {
    actions.push({
      label: '단서 수집',
      onClick: () => {
        const success = questSystem.collectClue(item.clueId);
        closeDialog();

        if (success) {
          if (questSystem.isCompleted()) {
            showToast('퀘스트 완료! 모든 단서를 수집했습니다.');
          } else {
            showToast(`${item.name} 단서를 수집했습니다!`);
          }
        }
      }
    });
  }

  actions.push({
    label: '닫기',
    onClick: closeDialog
  });

  let message = item.description;

  if (state.status === 'not_started') {
    message += '\n\n먼저 안내 NPC와 대화해 주세요.';
  } else if (collected) {
    message += '\n\n이미 수집한 단서입니다.';
  }

  showDialog(item.name, message, actions);
}

// =====================================
// 7. 이동 및 마우스 카메라
// =====================================

const keys = {};

let cameraYaw = 0;
let cameraPitch = 0.35;
let dragging = false;

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  dragging = true;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointerup', () => {
  dragging = false;
});

renderer.domElement.addEventListener('pointercancel', () => {
  dragging = false;
});

window.addEventListener('blur', () => {
  dragging = false;

  for (const key in keys) {
    keys[key] = false;
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging || dialogOpen) return;

  // 갑작스러운 카메라 회전 방지
  const dx = THREE.MathUtils.clamp(
    event.movementX, -35, 35
  );

  const dy = THREE.MathUtils.clamp(
    event.movementY, -35, 35
  );

  cameraYaw -= dx * 0.004;
  cameraPitch += dy * 0.003;

  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch,
    -0.15,
    0.75
  );
});

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;

  if (
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)
  ) {
    event.preventDefault();
  }

  if (event.code === 'Escape' && dialogOpen) {
    closeDialog();
  }

  if (event.code === 'KeyE' && !event.repeat && !dialogOpen) {
    const nearest = findNearestInteractable();

    if (nearest) {
      interactWith(nearest);
    }
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

function canMoveTo(x, z) {
  const radius = 0.43;

  for (const obstacle of obstacles) {
    const nearestX = THREE.MathUtils.clamp(
      x,
      obstacle.minX,
      obstacle.maxX
    );

    const nearestZ = THREE.MathUtils.clamp(
      z,
      obstacle.minZ,
      obstacle.maxZ
    );

    const dx = x - nearestX;
    const dz = z - nearestZ;

    if (dx * dx + dz * dz < radius * radius) {
      return false;
    }
  }

  return true;
}

function findNearestInteractable() {
  let nearest = null;
  let nearestDistance = 2.7;

  for (const item of interactables) {
    const dx = player.position.x - item.object.position.x;
    const dz = player.position.z - item.object.position.z;

    const distance = Math.hypot(dx, dz);

    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  return nearest;
}

// =====================================
// 8. 애니메이션
// =====================================

const clock = new THREE.Clock();

const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

const cameraBlockers = scene.children.filter(
  object =>
    object.isMesh &&
    object.geometry?.type === 'BoxGeometry'
);

function updateCamera(delta) {
  cameraTarget.set(
    player.position.x,
    1.5,
    player.position.z
  );

  const distance = 5.2;

  desiredCamera.set(
    cameraTarget.x + Math.sin(cameraYaw) *
      Math.cos(cameraPitch) * distance,

    cameraTarget.y + Math.sin(cameraPitch) * distance + 0.8,

    cameraTarget.z + Math.cos(cameraYaw) *
      Math.cos(cameraPitch) * distance
  );

  // 카메라가 벽을 통과하지 않도록 거리 조절
  const direction = desiredCamera.clone().sub(cameraTarget);
  const length = direction.length();

  raycaster.set(
    cameraTarget,
    direction.clone().normalize()
  );

  raycaster.far = length;

  const hits = raycaster.intersectObjects(
    cameraBlockers,
    false
  );

  if (hits.length > 0) {
    const safeDistance = Math.max(
      0.6,
      hits[0].distance - 0.25
    );

    desiredCamera.copy(cameraTarget).add(
      direction.normalize().multiplyScalar(safeDistance)
    );
  }

  const smoothing = 1 - Math.exp(-12 * delta);

  camera.position.lerp(desiredCamera, smoothing);
  camera.lookAt(cameraTarget);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  if (!dialogOpen) {
    const forward = new THREE.Vector3(
      -Math.sin(cameraYaw),
      0,
      -Math.cos(cameraYaw)
    );

    const right = new THREE.Vector3(
      Math.cos(cameraYaw),
      0,
      -Math.sin(cameraYaw)
    );

    const movement = new THREE.Vector3();

    if (keys.KeyW) movement.add(forward);
    if (keys.KeyS) movement.sub(forward);
    if (keys.KeyD) movement.add(right);
    if (keys.KeyA) movement.sub(right);

    if (movement.lengthSq() > 0) {
      movement.normalize();

      const speed = 4.5 * delta;

      const nextX = player.position.x + movement.x * speed;
      const nextZ = player.position.z + movement.z * speed;

      if (canMoveTo(nextX, player.position.z)) {
        player.position.x = nextX;
      }

      if (canMoveTo(player.position.x, nextZ)) {
        player.position.z = nextZ;
      }

      // 캐릭터가 이동 방향을 바라보도록 회전
      const targetAngle = Math.atan2(
        movement.x,
        movement.z
      );

      const angleDifference = Math.atan2(
        Math.sin(targetAngle - player.rotation.y),
        Math.cos(targetAngle - player.rotation.y)
      );

      player.rotation.y +=
        angleDifference * Math.min(1, delta * 12);
    }
  }

  const nearest = dialogOpen
    ? null
    : findNearestInteractable();

  if (nearest) {
    promptEl.style.display = 'block';
    promptEl.textContent = `E  |  ${nearest.name} 상호작용`;
  } else {
    promptEl.style.display = 'none';
  }

  updateCamera(delta);
  renderer.render(scene, camera);
}

updateCamera(1);
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
});
