import { mountQuestionScreen } from "./screens/QuestionScreen.js";
import { mountStartScreen } from "./screens/StartScreen.js";

const app = document.querySelector("#app");

if (!(app instanceof HTMLElement)) {
  throw new Error("앱을 표시할 #app 요소를 찾을 수 없습니다.");
}

let unmountCurrentScreen = () => {};
let surveyAnswers = null;

function showStartScreen() {
  unmountCurrentScreen();
  unmountCurrentScreen = mountStartScreen(app, showQuestionScreen);
}

function showQuestionScreen() {
  unmountCurrentScreen();
  unmountCurrentScreen = mountQuestionScreen(app, {
    onEnter: showNextStep,
  });
}

let isEnteringGame = false;
async function showNextStep(answers) {
  if (isEnteringGame) return;
  isEnteringGame = true;
  surveyAnswers = answers;

  // 기존 QuestMapBridge에서 사용하는 동일한 설문 저장 키
  try {
    localStorage.setItem('history_exhibition_survey', JSON.stringify(answers));
  } catch (error) {
    console.warn('설문 임시 저장 실패:', error);
  }

  unmountCurrentScreen();
  app.innerHTML = `
    <main id="viewer" aria-label="탑골공원 3D 퀘스트 게임">
      <canvas id="scene" aria-label="탑골공원 3D 장면"></canvas>
      <div id="loading" role="status" aria-live="polite">3D 맵을 불러오는 중...</div>
      <p class="controls-hint">WASD 이동 · E 대화 · 일본군(NPC J)의 시야를 피하세요</p>
    </main>
  `;
  unmountCurrentScreen = () => app.replaceChildren();

  try {
    await import('./quest/TeamMapGame.js');
  } catch (error) {
    console.error('3D 게임 시작 실패:', error);
    const loading = document.querySelector('#loading');
    if (loading) {
      loading.textContent = '3D 게임 시작 오류: ' + (error?.message || error);
      loading.classList.add('loading-error');
    }
    isEnteringGame = false;
  }
}

showStartScreen();
