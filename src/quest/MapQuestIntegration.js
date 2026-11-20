import * as THREE from 'three';
import { installQuestOnTeamMap, normalizeSurvey } from './QuestMapBridge.js';
import { QuestSystem } from './questSystem.js';
import { installNpcJPatrol, NPC_J_SETTINGS } from './NpcJPatrol.js';

const NPC_IDS = ['A', 'B', 'C', 'U'];
const GROUND_MARGIN = 0.35;
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

  const surfaces = [];
  modelRoot.traverse((object) => {
    if (object.isMesh && groundNames.has(object.name)) surfaces.push(object);
  });
  if (!surfaces.length) throw new Error('퀘스트 이동 지면을 찾지 못했습니다.');

  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.far = mapBounds.getSize(new THREE.Vector3()).y + 100;
  const top = mapBounds.max.y + 10;
  const npcAPos = npcObjects.A.getWorldPosition(new THREE.Vector3());
  const npcHeight = new THREE.Box3().setFromObject(npcObjects.A).getSize(new THREE.Vector3()).y;
  const height = THREE.MathUtils.clamp(npcHeight * 0.65, 0.75, 1.7);
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

  function groundAt(x, z) {
    if (x < mapBounds.min.x + GROUND_MARGIN || x > mapBounds.max.x - GROUND_MARGIN ||
        z < mapBounds.min.z + GROUND_MARGIN || z > mapBounds.max.z - GROUND_MARGIN) return null;
    ray.set(new THREE.Vector3(x, top, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? hit.point.y : null;
  }

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
  let follow = false;
  const held = new Set();
  const quest = new QuestSystem();
  const bridge = installQuestOnTeamMap({
    player, npcObjects, THREE, camera,
    interactionDistance: INTERACTION_DISTANCE,
    collisionRadius: Math.min(0.55, height * 0.45),
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

  const npcJObject = scene.getObjectByName('NPC_J');
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
    controls.target.set(position.x, position.y + height * 0.7, position.z);
    camera.position.copy(controls.target).add(new THREE.Vector3(7, 6, 9));
    controls.update();
    requestRender();
  }
  function isTextInput(element) {
    return element?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element?.tagName);
  }
  function keyDown(event) {
    const key = event.key.toLowerCase();
    if (isTextInput(event.target) || surveyOpen || bridge.isDialogOpen() || gameOver) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      held.add(key);
      if (key.startsWith('arrow')) event.preventDefault();
      requestRender();
    }
  }
  function keyUp(event) { held.delete(event.key.toLowerCase()); }
  function blur() { held.clear(); }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', blur);

  function update(delta) {
    const locked = surveyOpen || bridge.isDialogOpen() || gameOver;
    if (locked) held.clear();
    const x = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft'));
    const z = Number(held.has('s') || held.has('arrowdown')) - Number(held.has('w') || held.has('arrowup'));
    let changed = false;
    if (!locked && (x !== 0 || z !== 0) && delta > 0) {
      const length = Math.hypot(x, z);
      const oldPosition = player.position.clone();
      const nextX = oldPosition.x + (x / length) * MOVE_SPEED * delta;
      const nextZ = oldPosition.z + (z / length) * MOVE_SPEED * delta;
      const nextY = groundAt(nextX, nextZ);
      if (nextY !== null && bridge.canMoveTo({ x: nextX, z: nextZ }) &&
          (!npcJPatrol || npcJPatrol.canPlayerMoveTo(nextX, nextZ))) {
        player.position.set(nextX, nextY, nextZ);
        player.rotation.y = Math.atan2(x, z);
        if (follow) {
          const diff = player.position.clone().sub(oldPosition);
          camera.position.add(diff);
          controls.target.add(diff);
        }
        changed = true;
      }
    }
    const npcJChanged = npcJPatrol?.update(delta, !quest.isCompleted()) ?? false;
    bridge.update();
    return changed || npcJChanged || (!locked && held.size > 0);
  }
  return {
    update,
    dispose() {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
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
