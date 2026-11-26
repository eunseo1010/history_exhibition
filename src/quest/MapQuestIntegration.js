import * as THREE from 'three';
import { installQuestOnTeamMap, normalizeSurvey } from './QuestMapBridge.js';
import { QuestSystem } from './questSystem.js';
import { installNpcJPatrol, NPC_J_SETTINGS } from './NpcJPatrol.js';

const NPC_IDS = ['A', 'B', 'C', 'U'];
const WALL_THICKNESS = { minX: 1.0, maxX: 0.8, minZ: 0.9, maxZ: 0.9 };
const SOLID_ROOTS = new Set([
  'Pavilion', 'House', 'Wood', 'Brick_Wall', 'Stairs', 'Gate_Frame',
  'Gate_L_Door', 'Gate_R_Door', 'Small_bowl', 'Jar_1', 'Well', 'Jar_2',
  'Brazier', 'Straw_Bag', 'Low_Wooden_Bench', 'Radish_Bowl', 'Carrier', 'Broom',
  'Tree_Zelkova', 'Tree_Dark_Zelkova',
]);
const TREE_TRUNK_MATERIALS = new Set(['M_Zelkova_03', 'M_Zelkova_01']);
const MOVE_SPEED = 3.3;
const INTERACTION_DISTANCE = 1.9;
const surveyKey = 'history_exhibition_survey';

function node(tag, text, css = '') {
  const result = document.createElement(tag);
  result.textContent = text;
  if (css) result.style.cssText = css;
  return result;
}
function btn(label, fn) {
  const item = node('button', label, 'border:1px solid #b5c2cc;border-radius:6px;background:#fff;color:#112;padding:8px 10px;cursor:pointer;');
  item.type = 'button';
  item.addEventListener('click', fn);
  return item;
}

/**
 * Adds a playable WASD quest layer to the teammate's existing orbit-view map.
 * The map, NPC models, lighting, and existing OrbitControls stay unchanged.
 * Assumes NPC models are already loaded by addNpcs() in src/main.js.
 */
export function installMapQuestIntegration({ scene, camera, controls, modelRoot, npcObjects,
  mapBounds, groundNames, requestRender, resetMapView }) {
  for (const id of NPC_IDS) {
    if (!npcObjects[id]) throw new Error(`퀘스트 시작 실패: NPC ${id} 객체가 없습니다.`);
  }

  const stairsMesh = modelRoot.getObjectByName('Stairs');
  if (!stairsMesh?.isMesh) throw new Error('계단 이동에 필요한 Stairs 메시를 찾지 못했습니다.');
  const surfaces = [];
  modelRoot.traverse((object) => {
    if (object.isMesh &&
        (groundNames.has(object.name) || object === stairsMesh ||
         object.parent?.name === 'Stairs_Pavers')) {
      surfaces.push(object);
    }
  });
  if (!surfaces.length) throw new Error('퀘스트 이동 지면을 찾지 못했습니다.');

  scene.updateMatrixWorld(true);
  const mainField = modelRoot.getObjectByName('Main_Field');
  const brickWall = modelRoot.getObjectByName('Brick_Wall');
  if (!mainField || !brickWall) {
    throw new Error('맵 외곽 이동 제한에 필요한 Main_Field 또는 Brick_Wall 오브젝트가 없습니다.');
  }
  const fieldBounds = new THREE.Box3().setFromObject(mainField);
  const wallBounds = new THREE.Box3().setFromObject(brickWall);
  const walkBounds = new THREE.Box3(
    new THREE.Vector3(
      wallBounds.min.x + WALL_THICKNESS.minX,
      fieldBounds.min.y,
      wallBounds.min.z + WALL_THICKNESS.minZ,
    ),
    new THREE.Vector3(
      wallBounds.max.x - WALL_THICKNESS.maxX,
      fieldBounds.max.y,
      wallBounds.max.z - WALL_THICKNESS.maxZ,
    ),
  );
  const cameraBounds = new THREE.Box3(
    new THREE.Vector3(
      walkBounds.min.x + 0.15,
      wallBounds.min.y,
      walkBounds.min.z + 0.15,
    ),
    new THREE.Vector3(
      walkBounds.max.x - 0.15,
      wallBounds.max.y,
      walkBounds.max.z - 0.15,
    ),
  );
  const ray = new THREE.Raycaster();
  const collisionRay = new THREE.Raycaster();
  ray.far = mapBounds.getSize(new THREE.Vector3()).y + 100;
  const top = mapBounds.max.y + 10;
  const npcAPos = npcObjects.A.getWorldPosition(new THREE.Vector3());
  const npcHeight = new THREE.Box3().setFromObject(npcObjects.A).getSize(new THREE.Vector3()).y;
  const height = THREE.MathUtils.clamp(npcHeight * 0.65, 0.75, 1.7);
  const playerRadius = height * 0.32 + 0.02;
  const safeBounds = new THREE.Box3(
    new THREE.Vector3(
      walkBounds.min.x + playerRadius,
      fieldBounds.min.y,
      walkBounds.min.z + playerRadius,
    ),
    new THREE.Vector3(
      walkBounds.max.x - playerRadius,
      fieldBounds.max.y,
      walkBounds.max.z - playerRadius,
    ),
  );
  const collisionSlices = [0.1, 0.3, 0.55, 0.78, 0.98, 1.1, 1.17]
    .map((fraction) => {
      const y = height * fraction;
      const bodyBottom = height * 0.055;
      const bodyTop = height * 0.805;
      let radius = 0;
      if (y >= bodyBottom && y <= bodyTop) {
        const bodyProgress = (y - bodyBottom) / (bodyTop - bodyBottom);
        radius = THREE.MathUtils.lerp(height * 0.32, height * 0.24, bodyProgress);
      }
      const headRadius = height * 0.21;
      const headDistance = Math.abs(y - height * 0.98);
      if (headDistance < headRadius) {
        radius = Math.max(radius, Math.sqrt(headRadius ** 2 - headDistance ** 2));
      }
      return { y, radius: radius + 0.02 };
    })
    .filter((slice) => slice.radius > 0.02);
  const stairTopLevels = new Set();
  const stairPositions = stairsMesh.geometry.getAttribute('position');
  const stairIndices = stairsMesh.geometry.index;
  const stairVertexCount = stairIndices ? stairIndices.count : stairPositions.count;
  for (let index = 0; index < stairVertexCount; index += 3) {
    const ia = stairIndices ? stairIndices.getX(index) : index;
    const ib = stairIndices ? stairIndices.getX(index + 1) : index + 1;
    const ic = stairIndices ? stairIndices.getX(index + 2) : index + 2;
    const a = new THREE.Vector3().fromBufferAttribute(stairPositions, ia).applyMatrix4(stairsMesh.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(stairPositions, ib).applyMatrix4(stairsMesh.matrixWorld);
    const c = new THREE.Vector3().fromBufferAttribute(stairPositions, ic).applyMatrix4(stairsMesh.matrixWorld);
    const normalY = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
    if (normalY > 0.95) stairTopLevels.add(Number(((a.y + b.y + c.y) / 3).toFixed(3)));
  }
  const sortedStairLevels = [...stairTopLevels].sort((a, b) => a - b);
  let maxStairRise = 0;
  for (let index = 1; index < sortedStairLevels.length; index += 1) {
    maxStairRise = Math.max(maxStairRise, sortedStairLevels[index] - sortedStairLevels[index - 1]);
  }
  if (maxStairRise <= 0) throw new Error('Stairs 메시에서 계단 표면 높이를 계산하지 못했습니다.');
  maxStairRise += 0.025;
  const player = new THREE.Group();
  player.name = 'QUEST_PLAYER';
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.24, height * 0.32, height * 0.75, 12),
    new THREE.MeshStandardMaterial({ color: 0x187ee1 }),
  );
  body.position.y = height * 0.43;
  body.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(height * 0.21, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf7c69a }),
  );
  head.position.y = height * 0.98;
  head.castShadow = true;
  player.add(body, head);

  function groundInfoAt(x, z) {
    if (x < walkBounds.min.x || x > walkBounds.max.x ||
        z < walkBounds.min.z || z > walkBounds.max.z) return null;
    ray.set(new THREE.Vector3(x, top, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? { y: hit.point.y, object: hit.object } : null;
  }

  function groundAt(x, z) {
    return groundInfoAt(x, z)?.y ?? null;
  }

  const npcJObject = scene.getObjectByName('NPC_J');
  const solidColliders = [];
  function addSolidCollider(object, label, dynamic = false) {
    if (!object.isMesh) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (!bounds.isEmpty()) solidColliders.push({ object, bounds, label, dynamic });
  }
  modelRoot.traverse((object) => {
    if (!object.isMesh) return;
    let root = object;
    while (root && root !== modelRoot && !SOLID_ROOTS.has(root.name)) root = root.parent;
    if (!root || root === modelRoot) return;
    if (root.name === 'Tree_Zelkova' || root.name === 'Tree_Dark_Zelkova') {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => TREE_TRUNK_MATERIALS.has(material?.name))) return;
    }
    addSolidCollider(object, root.name.replaceAll('_', ' '));
  });
  for (const id of NPC_IDS) {
    npcObjects[id].traverse((object) => addSolidCollider(object, `NPC ${id}`));
  }
  if (npcJObject) {
    npcJObject.traverse((object) => addSolidCollider(object, 'NPC J', true));
  }

  function firstSolidCollision(from, to, fromGround, toGround, movementDirection) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.0001) return null;
    const probeGrounds = [0.25, 0.5, 0.75, 1].map((fraction) =>
      groundInfoAt(
        to.x + movementDirection.x * playerRadius * fraction,
        to.z + movementDirection.z * playerRadius * fraction,
      ));
    const heightChange = Math.abs(to.y - from.y);
    const frontStepAvailable = probeGrounds.some((ground) =>
      ground?.object === stairsMesh && Math.abs(ground.y - from.y) <= maxStairRise);
    const stairStepAllowed = heightChange <= maxStairRise &&
      [fromGround, toGround, ...probeGrounds].some((ground) => ground?.object === stairsMesh) &&
      (toGround?.object === stairsMesh || frontStepAvailable || fromGround?.object === stairsMesh);
    const rayDirection = new THREE.Vector3(dx / distance, 0, dz / distance);
    const sweptBounds = new THREE.Box3(
      new THREE.Vector3(
        Math.min(from.x, to.x) - playerRadius,
        from.y + height * 0.055,
        Math.min(from.z, to.z) - playerRadius,
      ),
      new THREE.Vector3(
        Math.max(from.x, to.x) + playerRadius,
        from.y + height * 1.19,
        Math.max(from.z, to.z) + playerRadius,
      ),
    );
    const nearby = solidColliders.filter((collider) => {
      if (collider.dynamic) collider.bounds.setFromObject(collider.object);
      return collider.bounds.intersectsBox(sweptBounds);
    });
    if (!nearby.length) return null;

    collisionRay.far = distance + 0.025;
    for (const slice of collisionSlices) {
      for (let sample = 0; sample <= 16; sample++) {
        const angle = sample === 16 ? 0 : (sample / 16) * Math.PI * 2;
        const offsetX = sample === 16 ? 0 : Math.cos(angle) * slice.radius;
        const offsetZ = sample === 16 ? 0 : Math.sin(angle) * slice.radius;
        const origin = new THREE.Vector3(
          from.x + offsetX,
          from.y + slice.y,
          from.z + offsetZ,
        );
        const rayBounds = new THREE.Box3(
          new THREE.Vector3(
            origin.x + Math.min(0, dx),
            origin.y,
            origin.z + Math.min(0, dz),
          ),
          new THREE.Vector3(
            origin.x + Math.max(0, dx),
            origin.y,
            origin.z + Math.max(0, dz),
          ),
        );
        collisionRay.set(origin, rayDirection);
        for (const collider of nearby) {
          if (!collider.bounds.intersectsBox(rayBounds)) continue;
          const hit = collisionRay.intersectObject(collider.object, false)[0];
          if (!hit || hit.distance > distance + 0.025) continue;
          if (collider.object === stairsMesh && stairStepAllowed) continue;
          return collider.label;
        }
      }
    }
    return null;
  }

  function constrainCamera() {
    const previousX = camera.position.x;
    const previousZ = camera.position.z;
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x, cameraBounds.min.x, cameraBounds.max.x,
    );
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z, cameraBounds.min.z, cameraBounds.max.z,
    );
    if (camera.position.x !== previousX || camera.position.z !== previousZ) {
      camera.lookAt(controls.target);
    }
  }

  controls.addEventListener('change', constrainCamera);

  // Find a walkable position near NPC A but outside E-interaction range.
  const offsets = [[0, 2.8], [2.8, 0], [-2.8, 0], [0, -2.8], [0, 1.9]];
  let spawnFound = false;
  for (const [dx, dz] of offsets) {
    const x = npcAPos.x + dx;
    const z = npcAPos.z + dz;
    const y = groundAt(x, z);
    if (y === null) continue;
    player.position.set(x, y, z);
    spawnFound = true;
    break;
  }
  if (!spawnFound) {
    player.position.copy(npcAPos); // fallback, no invalid coordinates
    console.warn('퀘스트 플레이어의 지면 시작 위치를 찾지 못해 NPC A 위치를 사용합니다.');
  }
  scene.add(player);
  const playerSpawn = player.position.clone();

  let gameOver = false;
  let npcJPatrol = null;
  let surveyOpen = false;
  let follow = true;
  const held = new Set();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const moveDirection = new THREE.Vector3();
  const quest = new QuestSystem();
  const bridge = installQuestOnTeamMap({
    player, npcObjects, THREE, camera,
    interactionDistance: INTERACTION_DISTANCE,
    collisionRadius: playerRadius,
    quest,
    canInteract: () => !surveyOpen && !gameOver,
    onStateChange: requestRender,
    onComplete: requestRender,
  });

  const bar = node('div', '', 'position:fixed;left:12px;top:12px;z-index:80;max-width:calc(100vw - 24px);padding:10px;background:#182434eb;border-radius:10px;color:#fff;font:13px/1.5 system-ui;display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
  const instruction = node('span', 'WASD: 이동 · E: 가까운 NPC와 대화 · 마우스: 맵 회전/확대');
  const difficultyText = node('span', '난이도: 보통', 'font-weight:700;');
  const surveyButton = btn('설문', openSurvey);
  const focusButton = btn('플레이어 보기', focusPlayer);
  const overviewButton = btn('전체 맵', () => { follow = false; resetMapView(); requestRender(); });
  const npcJText = node('span', `NPC J: 중앙 순찰 · 시야 ${NPC_J_SETTINGS.sightDistance} · 전방 ${NPC_J_SETTINGS.fieldOfViewDegrees}°`);
  const resetButton = btn('퀘스트 초기화', () => {
    if (!window.confirm('현재 브라우저의 퀘스트 진행 기록만 초기화할까요?')) return;
    bridge.closeDialog();
    quest.resetQuest();
    bridge.update();
    requestRender();
  });
  bar.append(instruction, difficultyText, npcJText, surveyButton, focusButton, overviewButton, resetButton);
  document.body.appendChild(bar);

  const jWarning = node('div', '⚠ NPC J의 시야에 들어왔습니다! 숨거나 벗어나세요.',
    'position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#891d1de9;color:white;font:700 16px system-ui;padding:12px 18px;border-radius:9px;z-index:150;display:none;max-width:90vw;text-align:center;');
  document.body.appendChild(jWarning);

  const gameOverScreen = node('div', '',
    'position:fixed;inset:0;background:#060b14e8;z-index:240;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;');
  const gameOverPanel = node('section', '',
    'width:min(440px,95vw);text-align:center;background:#1a2332;border:1px solid #9aa5b5;border-radius:16px;padding:28px;color:#fff;font:16px/1.7 system-ui;box-shadow:0 18px 48px #0008;');
  gameOverPanel.append(
    node('h2', 'GAME OVER', 'color:#ff8585;font:800 30px system-ui;margin:0 0 12px;'),
    node('p', '일본군에게 발각되었습니다. 중앙 순찰 경로와 시야를 피해 이동하세요.\n다시 시도해도 수집한 단서와 퀘스트 기록은 유지됩니다.', 'white-space:pre-line;margin:0 0 18px;'),
    btn('다시 시도', () => {
      player.position.copy(playerSpawn);
      npcJPatrol?.reset();
      gameOver = false;
      held.clear();
      jWarning.style.display = 'none';
      gameOverScreen.style.display = 'none';
      focusPlayer();
      bridge.update();
      requestRender();
    }),
  );
  gameOverScreen.appendChild(gameOverPanel);
  document.body.appendChild(gameOverScreen);

  if (npcJObject) {
    npcJPatrol = installNpcJPatrol({
      THREE, npcJ: npcJObject, player, modelRoot, groundAt, otherNpcs: npcObjects,
      isPaused: () => surveyOpen || bridge.isDialogOpen() || gameOver,
      onWarning: (visible) => { jWarning.style.display = visible && !gameOver ? 'block' : 'none'; },
      onCaught: () => {
        if (quest.isCompleted() || gameOver) return;
        gameOver = true;
        held.clear();
        jWarning.style.display = 'none';
        gameOverScreen.style.display = 'flex';
        requestRender();
      },
    });
    if (!npcJPatrol.hasRoute) npcJText.textContent = '⚠ NPC J 순찰 경로를 찾지 못했습니다: 지면 좌표 확인 필요';
  } else {
    npcJText.textContent = '⚠ NPC J 모델을 찾지 못했습니다';
    console.warn('NPC_J 모델이 없어 순찰과 게임 오버 기능을 시작하지 않았습니다.');
  }

  const surveyBackdrop = node('div', '', 'position:fixed;inset:0;background:#0d1420df;z-index:120;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;');
  const surveyForm = node('form', '', 'background:#192437;color:#fff;border:1px solid #95a7bc;padding:22px;border-radius:12px;width:min(430px,92vw);display:grid;gap:12px;font:15px/1.6 system-ui;');
  surveyForm.appendChild(node('h2', '3·1운동 역사 퀘스트 입장 설문', 'margin:0;font-size:20px;'));
  surveyForm.appendChild(node('p', '역사 지식 수준에 따라 전단지 퀴즈 난이도가 달라집니다.', 'margin:0;'));

  function select(label, options) {
    const wrap = node('label', label, 'display:grid;gap:6px;');
    const input = node('select', '', 'background:#fff;color:#141820;padding:10px;border:1px solid #9baab8;border-radius:6px;');
    for (let i = 0; i < options.length; i++) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = options[i];
      input.appendChild(option);
    }
    wrap.appendChild(input);
    surveyForm.appendChild(wrap);
    return input;
  }
  const ages = select('연령대', ['7세 ~ 13세', '14세 ~ 16세', '17세 ~ 19세', '성인']);
  const knowledges = select('3·1절에 대한 지식 수준', ['잘 모른다', '보통이다', '잘 아는 편이다', '매우 잘 안다']);
  const surveyActions = node('div', '', 'display:flex;gap:8px;flex-wrap:wrap;');
  const save = node('button', '설문 저장하고 입장', 'padding:10px;background:#e0edf8;color:#152339;border:0;border-radius:7px;cursor:pointer;');
  save.type = 'submit';
  surveyActions.appendChild(save);
  surveyActions.appendChild(btn('나중에 응답', closeSurvey));
  surveyForm.appendChild(surveyActions);
  surveyBackdrop.appendChild(surveyForm);
  document.body.appendChild(surveyBackdrop);

  function refreshDifficulty() {
    const levels = { easy: '쉬움', normal: '보통', hard: '어려움' };
    difficultyText.textContent = `난이도: ${levels[bridge.getDifficulty()]}`;
  }
  function openSurvey() {
    const saved = bridge.getSurvey();
    if (saved) {
      ages.value = String(saved.ageGroup);
      knowledges.value = String(saved.knowledgeLevel);
    }
    held.clear();
    surveyOpen = true;
    surveyBackdrop.style.display = 'flex';
  }
  function closeSurvey() {
    surveyOpen = false;
    surveyBackdrop.style.display = 'none';
  }
  function onSubmit(event) {
    event.preventDefault();
    const raw = { ageGroup: Number(ages.value), knowledgeLevel: Number(knowledges.value) };
    if (!normalizeSurvey(raw)) return;
    bridge.setSurvey(raw);
    refreshDifficulty();
    closeSurvey();
  }
  surveyForm.addEventListener('submit', onSubmit);
  refreshDifficulty();
  if (!bridge.getSurvey()) openSurvey();

  function focusPlayer() {
    follow = true;
    const position = player.position;
    controls.target.set(position.x, position.y + height * 0.65, position.z);
    camera.position.copy(controls.target).add(new THREE.Vector3(8, 10, 7));
    controls.minDistance = 9;
    controls.maxDistance = 18;
    controls.update();
    constrainCamera();
    requestRender();
  }
  function isTextInput(element) {
    return element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName);
  }
  function keyboardKey(event) {
    const codeKeys = {
      KeyW: 'w',
      KeyA: 'a',
      KeyS: 's',
      KeyD: 'd',
      ArrowUp: 'arrowup',
      ArrowDown: 'arrowdown',
      ArrowLeft: 'arrowleft',
      ArrowRight: 'arrowright',
    };
    return codeKeys[event.code] ?? event.key?.toLowerCase();
  }
  function keyDown(event) {
    const key = keyboardKey(event);
    if (isTextInput(event.target) || surveyOpen || bridge.isDialogOpen() || gameOver) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      held.add(key);
      if (key.startsWith('arrow')) event.preventDefault();
      requestRender();
    }
  }
  function keyUp(event) {
    const key = keyboardKey(event);
    if (key) held.delete(key);
  }
  function blur() { held.clear(); }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);
  focusPlayer();

  function update(delta) {
    const locked = surveyOpen || bridge.isDialogOpen() || gameOver;
    if (locked) held.clear();
    const x = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft'));
    const z = Number(held.has('s') || held.has('arrowdown')) - Number(held.has('w') || held.has('arrowup'));
    let changed = false;
    if (!locked && (x !== 0 || z !== 0) && delta > 0) {
      camera.getWorldDirection(cameraForward);
      cameraForward.y = 0;
      if (cameraForward.lengthSq() < 0.000001) {
        cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
        cameraRight.y = 0;
        if (cameraRight.lengthSq() < 0.000001) cameraRight.set(1, 0, 0);
        cameraRight.normalize();
        cameraForward.crossVectors(worldUp, cameraRight).normalize();
      } else {
        cameraForward.normalize();
        cameraRight.crossVectors(cameraForward, worldUp).normalize();
      }
      moveDirection
        .set(0, 0, 0)
        .addScaledVector(cameraRight, x)
        .addScaledVector(cameraForward, -z);
      if (moveDirection.lengthSq() > 1) moveDirection.normalize();
      const oldPosition = player.position.clone();
      const fromGround = groundInfoAt(oldPosition.x, oldPosition.z);
      const stepX = moveDirection.x * MOVE_SPEED * delta;
      const stepZ = moveDirection.z * MOVE_SPEED * delta;
      const candidates = [[oldPosition.x + stepX, oldPosition.z + stepZ]];
      if (stepX !== 0 && stepZ !== 0) {
        candidates.push([oldPosition.x + stepX, oldPosition.z]);
        candidates.push([oldPosition.x, oldPosition.z + stepZ]);
      }

      for (const [candidateX, candidateZ] of candidates) {
        const nextX = THREE.MathUtils.clamp(
          candidateX, safeBounds.min.x, safeBounds.max.x,
        );
        const nextZ = THREE.MathUtils.clamp(
          candidateZ, safeBounds.min.z, safeBounds.max.z,
        );
        if (Math.hypot(nextX - oldPosition.x, nextZ - oldPosition.z) < 0.0001) continue;
        const nextGround = groundInfoAt(nextX, nextZ);
        if (!nextGround) continue;
        const attemptDirection = new THREE.Vector3(
          nextX - oldPosition.x, 0, nextZ - oldPosition.z,
        ).normalize();
        if (firstSolidCollision(
              oldPosition,
              { x: nextX, y: nextGround.y, z: nextZ },
              fromGround,
              nextGround,
              attemptDirection,
            ) ||
            !bridge.canMoveTo({ x: nextX, z: nextZ }) ||
            (npcJPatrol && !npcJPatrol.canPlayerMoveTo(nextX, nextZ))) continue;

        player.position.set(nextX, nextGround.y, nextZ);
        player.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
        if (follow) {
          const diff = player.position.clone().sub(oldPosition);
          camera.position.add(diff);
          controls.target.add(diff);
          constrainCamera();
        } else {
          focusPlayer();
        }
        changed = true;
        break;
      }
    }
    const npcJChanged = npcJPatrol?.update(delta, !quest.isCompleted()) ?? false;
    bridge.update();
    return changed || npcJChanged || (!locked && held.size > 0);
  }
  return {
    update,
    focusPlayer,
    dispose() {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      controls.removeEventListener('change', constrainCamera);
      bridge.dispose();
      npcJPatrol?.dispose();
      jWarning.remove();
      gameOverScreen.remove();
      bar.remove();
      surveyBackdrop.remove();
      scene.remove(player);
      body.geometry.dispose();
      body.material.dispose();
      head.geometry.dispose();
      head.material.dispose();
    },
  };
}
