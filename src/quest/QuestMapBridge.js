/**
 * 메인 3D 맵 ↔ 3·1운동 퀘스트 시스템 연결 어댑터.
 *
 * - 이 파일은 오직 src/quest 에 배치한다.
 * - 팀원의 3D scene / player / NPC 모델은 생성하거나 수정하지 않는다.
 * - 기존 src/quest/questSystem.js 의 진행 상태와 localStorage 키를 재사용한다.
 * - 메인 맵 담당자가 통합 시 entry point에서 단 한 번 설치한다.
 */
import { QuestSystem } from './questSystem.js';

const SURVEY_KEY = 'history_exhibition_survey';
const IDS = ['A', 'B', 'C', 'U'];
const LABELS = {
  A: '독립운동가',
  B: '날짜를 아는 시민',
  C: '장소를 아는 시민',
  U: '전단지를 전달받을 시민',
};
const LEVEL_LABELS = { easy: '쉬움', normal: '보통', hard: '어려움' };
const DATE_OPTIONS = [
  ['1919-03-01', '1919년 3월 1일'],
  ['1945-08-15', '1945년 8월 15일'],
  ['1910-08-29', '1910년 8월 29일'],
  ['1920-03-01', '1920년 3월 1일'],
];
const PLACE_OPTIONS = [
  ['tapgol', '서울 탑골공원'],
  ['gwanghwamun', '서울 광화문'],
  ['seodaemun', '서대문형무소'],
  ['namsan', '남산공원'],
];

export function difficultyFromKnowledge(value) {
  // 기존 Exhibition 패치와 동일: 0~1 쉬움, 2 보통, 3 어려움
  if (!Number.isInteger(value) || value < 0 || value > 3) return 'normal';
  return value <= 1 ? 'easy' : value === 2 ? 'normal' : 'hard';
}

export function normalizeSurvey(answers) {
  if (!answers || !Number.isInteger(answers.ageGroup) ||
      !Number.isInteger(answers.knowledgeLevel) ||
      answers.ageGroup < 0 || answers.ageGroup > 3 ||
      answers.knowledgeLevel < 0 || answers.knowledgeLevel > 3) return null;
  return {
    ageGroup: answers.ageGroup,
    knowledgeLevel: answers.knowledgeLevel,
    difficulty: difficultyFromKnowledge(answers.knowledgeLevel),
  };
}

export function horizontalDistance(a, b) {
  if (!a || !b || ![a.x, a.z, b.x, b.z].every(Number.isFinite)) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function nearestNpc(playerPosition, npcPositions) {
  let bestId = null;
  let bestDistance = Infinity;
  for (const id of IDS) {
    const distance = horizontalDistance(playerPosition, npcPositions?.[id]);
    if (distance < bestDistance) {
      bestId = id;
      bestDistance = distance;
    }
  }
  return { id: bestId, distance: bestDistance };
}

function applyStyle(element, cssText) {
  element.style.cssText = cssText;
  return element;
}
function el(tag, text = '', css = '') {
  const result = document.createElement(tag);
  result.textContent = text;
  if (css) applyStyle(result, css);
  return result;
}
function actionButton(text, onClick) {
  const button = el('button', text,
    'border:1px solid #c2c8d5;border-radius:5px;padding:9px 12px;background:#fff;color:#172033;cursor:pointer;margin:3px 5px 3px 0;');
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/**
 * @param {object} config
 * @param {object} config.player - 팀 맵의 플레이어 THREE.Object3D (position 필요)
 * @param {object} config.npcObjects - { A, B, C, U } 각각 팀 맵 NPC 객체 (또는 {x,y,z} 좌표 객체)
 * @param {object} [config.THREE] - 부모 변환이 있는 Object3D 좌표 / 레이캐스팅용 THREE 네임스페이스
 * @param {object} [config.camera] - 클릭 대화 사용 시 3D 카메라
 * @param {HTMLElement} [config.domElement] - 클릭 대화 사용 시 renderer.domElement
 * @param {boolean} [config.allowNpcClick=false] - 기본값은 범위 내 E키 상호작용
 * @param {number} [config.interactionDistance=1.9] - 3D 맵 세계 좌표 단위 기준
 * @param {number} [config.collisionRadius=0.5] - 팀 이동 코드에서 canMoveTo 사용 시 NPC 겹침 방지
 * @param {object} [config.survey] - 팀 질문 화면에서 반환한 {ageGroup,knowledgeLevel}
 * @param {function} [config.onComplete] - 퀘스트 완료 시 통합 담당자에게 알리는 콜백
 */
export function installQuestOnTeamMap(config = {}) {
  const {
    player,
    npcObjects,
    THREE = null,
    camera = null,
    domElement = null,
    allowNpcClick = false,
    interactionDistance = 1.9,
    collisionRadius = 0.5,
    onComplete = null,
    onStateChange = null,
    quest: suppliedQuest = null,
  } = config;

  if (!player || !player.position) throw new Error('QuestMapBridge: 팀 맵의 player 객체가 필요합니다.');
  for (const id of IDS) {
    if (!npcObjects?.[id]) throw new Error(`QuestMapBridge: NPC ${id} 객체 또는 좌표가 필요합니다.`);
  }
  if (!Number.isFinite(interactionDistance) || interactionDistance <= 0) {
    throw new Error('QuestMapBridge: interactionDistance는 양수여야 합니다.');
  }
  if (allowNpcClick && (!THREE?.Raycaster || !THREE?.Vector2 || !camera || !domElement)) {
    throw new Error('QuestMapBridge: 모델 클릭에는 THREE, camera, renderer.domElement가 필요합니다.');
  }

  const quest = suppliedQuest ?? new QuestSystem();
  let survey = null;
  try { survey = normalizeSurvey(JSON.parse(localStorage.getItem(SURVEY_KEY) || 'null')); }
  catch { /* 기존 설문이 없거나 깨졌다면 팀 설문 입력을 기다린다. */ }
  let currentNpc = null;
  let destroyed = false;
  let nearbySnapshot = '';

  // Object3D가 부모 Group 안에 있을 때는 반드시 월드 좌표를 사용한다.
  function worldPosition(ref) {
    if (!ref) return null;
    if (ref.getWorldPosition && THREE?.Vector3) {
      if (ref.updateWorldMatrix) ref.updateWorldMatrix(true, false);
      return ref.getWorldPosition(new THREE.Vector3());
    }
    return ref.position || ref;
  }
  function getPositions() {
    const result = {};
    for (const id of IDS) result[id] = worldPosition(npcObjects[id]);
    return result;
  }
  function closest() { return nearestNpc(worldPosition(player), getPositions()); }
  function canMoveTo(candidate) {
    if (!candidate || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) return false;
    for (const pos of Object.values(getPositions())) {
      if (horizontalDistance(candidate, pos) < collisionRadius) return false;
    }
    return true;
  }

  const root = applyStyle(document.createElement('div'), 'position:fixed;inset:0;z-index:100;pointer-events:none;font-family:system-ui,sans-serif;');
  const status = applyStyle(el('div'), 'position:absolute;top:12px;right:12px;max-width:320px;background:#151e2de8;color:#fff;padding:9px 12px;border-radius:8px;font-size:13px;');
  const hint = applyStyle(el('div'), 'position:absolute;bottom:15px;left:50%;transform:translateX(-50%);max-width:90vw;background:#151e2de8;color:#fff;padding:9px 14px;border-radius:8px;font-size:13px;text-align:center;');
  const veil = applyStyle(el('div'), 'position:absolute;inset:0;background:#0009;display:none;pointer-events:auto;align-items:center;justify-content:center;padding:16px;');
  const panel = applyStyle(el('section'), 'width:min(480px,94vw);max-height:85vh;overflow:auto;background:#1b2434;border:1px solid #8391ac;border-radius:12px;color:#fff;padding:22px;box-sizing:border-box;box-shadow:0 14px 35px #0008;');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const heading = applyStyle(el('h2'), 'font-size:19px;margin:0 0 14px;');
  const message = applyStyle(el('p'), 'font-size:15px;line-height:1.65;margin:0 0 16px;white-space:pre-wrap;');
  const actions = el('div');
  panel.append(heading, message, actions);
  veil.appendChild(panel);
  root.append(status, hint, veil);
  document.body.appendChild(root);

  function emitChange() {
    refresh();
    if (typeof onStateChange === 'function') onStateChange(quest.getState());
  }
  function refresh() {
    if (destroyed) return;
    const state = quest.getState();
    const difficulty = LEVEL_LABELS[survey?.difficulty || 'normal'];
    status.textContent = `퀘스트: ${state.status === 'completed' ? '완료' : state.status === 'in_progress' ? '진행 중' : '시작 전'} · 날짜 ${state.clues.time ? '✓' : '–'} · 장소 ${state.clues.place ? '✓' : '–'} · 난이도 ${difficulty}`;
    const { id, distance } = closest();
    const info = id && Number.isFinite(distance) ? `NPC ${id}까지 ${distance.toFixed(1)} (E키 범위 ${interactionDistance})` : 'NPC 위치 미확인';
    const extra = id && distance <= interactionDistance ? ' · E키로 대화' : ' · 더 가까이 다가가세요';
    const next = info + extra;
    if (nearbySnapshot !== next) {
      hint.textContent = next;
      nearbySnapshot = next;
    }
    hint.style.display = currentNpc ? 'none' : 'block';
  }
  function setSurvey(answers) {
    const data = normalizeSurvey(answers);
    if (!data) throw new Error('QuestMapBridge: 설문은 { ageGroup: 0~3, knowledgeLevel: 0~3 } 형식이어야 합니다.');
    survey = data;
    try { localStorage.setItem(SURVEY_KEY, JSON.stringify(data)); }
    catch (error) { console.warn('설문 저장 실패:', error); }
    refresh();
    return { ...data };
  }

  function closeDialog() {
    if (destroyed) return;
    currentNpc = null;
    veil.style.display = 'none';
    refresh();
  }
  function appendButton(text, callback) { actions.appendChild(actionButton(text, callback)); }
  function selectInput(labelText, options) {
    const wrap = applyStyle(el('label'), 'display:block;margin:10px 0;font-size:14px;');
    wrap.appendChild(el('div', labelText, 'margin-bottom:4px;'));
    const select = applyStyle(el('select'), 'width:100%;padding:10px;background:white;color:black;border-radius:5px;');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '선택해주세요';
    select.appendChild(empty);
    for (const [value, name] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = name;
      select.appendChild(option);
    }
    wrap.appendChild(select);
    actions.appendChild(wrap);
    return select;
  }
  function answerOptions(all, level) {
    const count = level === 'easy' ? 2 : level === 'hard' ? 4 : 3;
    return all.slice(0, count);
  }
  function showDialog(id) {
    if (destroyed || !IDS.includes(id)) return false;
    currentNpc = id;
    const state = quest.getState();
    heading.textContent = `NPC ${id} — ${LABELS[id]}`;
    actions.replaceChildren();

    if (id === 'A') {
      if (state.status === 'not_started') {
        message.textContent = '3·1운동을 알릴 전단지가 필요합니다. NPC B·C에게 날짜와 장소 단서를 얻어 주세요.';
        appendButton('퀘스트 시작', () => { if (quest.startQuest()) emitChange(); showDialog('A'); });
      } else if (state.status === 'completed') {
        message.textContent = '전단지 전달이 완료됐군요! 3·1운동의 역사를 기억해 주세요.';
      } else if (state.leafletCompleted) {
        message.textContent = '전단지가 완성됐습니다. NPC U에게 전달해 주세요.';
      } else if (quest.hasAllClues()) {
        message.textContent = `날짜와 장소 단서를 바탕으로 전단지를 만들어 주세요. (난이도 ${LEVEL_LABELS[survey?.difficulty || 'normal']})`;
        const difficulty = survey?.difficulty || 'normal';
        const date = selectInput('3·1운동 시작 날짜', answerOptions(DATE_OPTIONS, difficulty));
        const place = selectInput('3·1운동 주요 역사 현장', answerOptions(PLACE_OPTIONS, difficulty));
        appendButton('전단지 제작', () => {
          if (date.value !== '1919-03-01' || place.value !== 'tapgol') {
            message.textContent = '정답이 아닙니다. NPC B·C에게서 획득한 단서를 다시 확인해 주세요.';
            return;
          }
          quest.submitAnswer('time', true);
          quest.submitAnswer('place', true);
          emitChange();
          showDialog('A');
        });
      } else {
        message.textContent = `단서를 모으세요. 날짜 ${state.clues.time ? '획득' : '미획득'} / 장소 ${state.clues.place ? '획득' : '미획득'}.`;
      }
    } else if (id === 'B' || id === 'C') {
      if (state.status === 'not_started') {
        message.textContent = '먼저 NPC A에게서 퀘스트를 시작해 주세요.';
      } else {
        const type = id === 'B' ? 'time' : 'place';
        message.textContent = type === 'time' ? '3·1운동 시작 날짜: 1919년 3월 1일' : '3·1운동 주요 역사 현장: 서울 탑골공원';
        if (!state.clues[type] && state.status === 'in_progress') {
          appendButton('단서 기록', () => { if (quest.collectClue(id)) emitChange(); showDialog(id); });
        } else {
          message.textContent += '\n이미 기록한 단서입니다.';
        }
      }
    } else if (id === 'U') {
      if (state.status === 'completed') {
        message.textContent = '전단지를 잘 받았습니다! 퀘스트가 완료되었습니다.';
      } else if (state.status === 'not_started') {
        message.textContent = '먼저 NPC A에게 퀘스트를 받아 주세요.';
      } else if (!state.leafletCompleted) {
        message.textContent = 'NPC B·C에게서 단서를 모은 다음 NPC A에게 전단지를 제작해 달라고 해 주세요.';
      } else {
        message.textContent = '전단지를 저에게 전달해 주시겠어요?';
        appendButton('전단지 전달', () => {
          if (quest.deliverLeaflet('U')) {
            emitChange();
            if (typeof onComplete === 'function') onComplete(quest.getState());
          }
          showDialog('U');
        });
      }
    }

    appendButton('닫기', closeDialog);
    veil.style.display = 'flex';
    hint.style.display = 'none';
    return true;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') { if (currentNpc) closeDialog(); return; }
    if (event.key.toLowerCase() !== 'e' || event.repeat || currentNpc) return;
    if (typeof config.canInteract === 'function' && !config.canInteract()) return;
    const target = event.target;
    if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target?.tagName)) return;
    const result = closest();
    if (result.id && result.distance <= interactionDistance) {
      event.preventDefault();
      showDialog(result.id);
    }
  }
  window.addEventListener('keydown', onKeyDown);

  function onSurveyCompleted(event) {
    if (event.detail) {
      try { setSurvey(event.detail); } catch (error) { console.warn(error); }
    }
  }
  window.addEventListener('history-exhibition:survey-completed', onSurveyCompleted);

  let clickHandler = null;
  if (allowNpcClick) {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const targetLookup = [];
    for (const id of IDS) {
      const item = npcObjects[id];
      if (item?.isObject3D) targetLookup.push({ id, item });
    }
    clickHandler = (event) => {
      if (currentNpc || !targetLookup.length) return;
      const rect = domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
                  -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObjects(targetLookup.map(({ item }) => item), true)) {
        const npc = targetLookup.find(({ item }) => isDescendant(hit.object, item));
        if (npc) { showDialog(npc.id); break; }
      }
    };
    domElement.addEventListener('click', clickHandler);
  }
  function isDescendant(object, rootObject) {
    let current = object;
    while (current) { if (current === rootObject) return true; current = current.parent; }
    return false;
  }

  if (config.survey) setSurvey(config.survey);
  refresh();

  return {
    update: refresh,
    closeDialog,
    showDialog,
    getNearestNpc: closest,
    isDialogOpen: () => currentNpc !== null,
    getQuestState: () => quest.getState(),
    getDifficulty: () => survey?.difficulty || 'normal',
    getSurvey: () => survey ? { ...survey } : null,
    setSurvey,
    canMoveTo,
    dispose() {
      if (destroyed) return;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('history-exhibition:survey-completed', onSurveyCompleted);
      if (clickHandler) domElement.removeEventListener('click', clickHandler);
      root.remove();
      destroyed = true;
    },
  };
}
