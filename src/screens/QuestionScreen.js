function loadStylesheet(path) {
  const href = new URL(path, import.meta.url).href;
  const alreadyLinked = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((link) => link.href === href);
  if (alreadyLinked) return;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = href;
  document.head.append(stylesheet);
}

const ageGroups = ["7세 ~ 13세", "14세 ~ 16세", "17세 ~ 19세", "성인"];
const knowledgeLevels = ["잘 모른다", "보통이다", "잘 아는 편이다", "매우 잘 안다"];

export function mountQuestionScreen(container, { onEnter }) {
  loadStylesheet("../../styles/question-screen.css");

  const screen = document.createElement("main");
  screen.className = "question-screen";
  screen.innerHTML = `
    <div class="question-screen__backdrop" aria-hidden="true"></div>
    <section class="question-panel" aria-labelledby="question-title">
      <header class="question-header">
        <p class="question-header__eyebrow">HISTORY EXHIBITION <span>—</span> PRELUDE</p>
        <h1 id="question-title">기록을 마주하기 전</h1>
        <p class="question-header__description">당신의 시선으로 기억을 따라가기 위한 짧은 질문입니다.</p>
      </header>

      <form class="question-form">
        <fieldset class="question-block">
          <legend><span class="question-block__index">01</span> 당신이 머물고 있는 시간</legend>
          <div class="age-timeline" role="group" aria-label="나이 선택">
            ${ageGroups.map((label, index) => `
              <button
                class="age-timeline__point"
                type="button"
                data-age="${index}"
                aria-pressed="${index === 0}"
              ><span>${label}</span></button>
            `).join("")}
          </div>
        </fieldset>

        <fieldset class="question-block question-block--depth">
          <label class="question-block__legend" for="knowledge-level">
            <span class="question-block__index">02</span> 3·1절에 대한 기억의 깊이
          </label>
          <output class="knowledge-value" for="knowledge-level" aria-live="polite">잘 모른다</output>
          <div class="depth-slider">
            <div class="depth-slider__track" aria-hidden="true">
              <span class="depth-slider__fill"></span>
            </div>
            <input
              class="depth-slider__input"
              id="knowledge-level"
              type="range"
              min="0"
              max="3"
              step="1"
              value="0"
              aria-label="3·1절에 대해 알고 있는 정도"
              aria-valuetext="잘 모른다"
            >
          </div>
          <div class="depth-slider__captions" aria-hidden="true">
            <span>처음 만나는 기록</span>
            <span>선명한 기억</span>
          </div>
        </fieldset>

        <button class="question-submit" type="submit">
          <span>기억 속으로 입장하기</span>
          <span class="question-submit__arrow" aria-hidden="true">→</span>
        </button>
        <p class="question-status" role="status" aria-live="polite"></p>
      </form>
    </section>
  `;
  container.replaceChildren(screen);

  const form = screen.querySelector(".question-form");
  const ageButtons = [...screen.querySelectorAll("[data-age]")];
  const knowledgeInput = screen.querySelector("#knowledge-level");
  const knowledgeValue = screen.querySelector(".knowledge-value");
  const sliderFill = screen.querySelector(".depth-slider__fill");
  const status = screen.querySelector(".question-status");
  let selectedAge = 0;

  function selectAge(event) {
    const button = event.currentTarget;
    selectedAge = Number(button.dataset.age);
    ageButtons.forEach((ageButton, index) => {
      ageButton.setAttribute("aria-pressed", String(index === selectedAge));
    });
    status.textContent = "";
  }

  function updateKnowledge() {
    const value = Number(knowledgeInput.value);
    const progress = (value / (Number(knowledgeInput.max) - Number(knowledgeInput.min))) * 100;
    knowledgeInput.setAttribute("aria-valuetext", knowledgeLevels[value]);
    knowledgeValue.textContent = knowledgeLevels[value];
    sliderFill.style.width = `${progress}%`;
    status.textContent = "";
  }

  function submitAnswers(event) {
    event.preventDefault();
    const answers = {
      ageGroup: selectedAge,
      knowledgeLevel: Number(knowledgeInput.value),
    };
    onEnter(answers);
    status.textContent = "응답이 저장되었습니다.";
  }

  ageButtons.forEach((button) => button.addEventListener("click", selectAge));
  knowledgeInput.addEventListener("input", updateKnowledge);
  form.addEventListener("submit", submitAnswers);
  updateKnowledge();

  return () => {
    ageButtons.forEach((button) => button.removeEventListener("click", selectAge));
    knowledgeInput.removeEventListener("input", updateKnowledge);
    form.removeEventListener("submit", submitAnswers);
    screen.remove();
  };
}