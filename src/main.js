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

function showNextStep(answers) {
  surveyAnswers = answers;
  unmountCurrentScreen();

  const nextStep = document.createElement("main");
  nextStep.className = "question-screen";
  nextStep.innerHTML = `
    <section class="question-panel" aria-labelledby="next-step-title">
      <header class="question-header">
        <p class="question-header__eyebrow">HISTORY EXHIBITION <span>—</span> NEXT</p>
        <h1 id="next-step-title">응답이 저장되었습니다</h1>
        <p class="question-header__description">다음 단계는 준비 중입니다.</p>
      </header>
    </section>
  `;
  app.replaceChildren(nextStep);
  unmountCurrentScreen = () => nextStep.remove();
}

showStartScreen();
