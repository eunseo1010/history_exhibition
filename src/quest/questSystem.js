
const STORAGE_KEY = "history_exhibition_quest";

const INITIAL_STATE = {
  status: "not_started",
  clues: {
    time: false,
    place: false,
  },
  answers: {
    time: false,
    place: false,
  },
  leafletCompleted: false,
  delivered: false,
};

function createInitialState() {
  return structuredClone(INITIAL_STATE);
}

export class QuestSystem {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        return createInitialState();
      }

      const parsed = JSON.parse(saved);

      return {
        ...createInitialState(),
        ...parsed,
        clues: {
          ...INITIAL_STATE.clues,
          ...parsed.clues,
        },
        answers: {
          ...INITIAL_STATE.answers,
          ...parsed.answers,
        },
      };
    } catch (error) {
      console.warn("퀘스트 불러오기 실패:", error);
      return createInitialState();
    }
  }

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(this.state)
      );
    } catch (error) {
      console.warn("퀘스트 저장 실패:", error);
    }
  }

  startQuest() {
    if (this.state.status !== "not_started") {
      return false;
    }

    this.state.status = "in_progress";
    this.save();

    console.log("3.1운동 전단지 퀘스트 시작!");
    return true;
  }

  collectClue(npcId) {
    if (this.state.status !== "in_progress") {
      return false;
    }

    const clueType = {
      B: "time",
      C: "place",
    }[npcId];

    if (!clueType || this.state.clues[clueType]) {
      return false;
    }

    this.state.clues[clueType] = true;
    this.save();

    console.log(`${npcId}에게서 단서를 획득했습니다.`);
    return true;
  }

  hasAllClues() {
    return (
      this.state.clues.time &&
      this.state.clues.place
    );
  }

  submitAnswer(type, isCorrect) {
    if (
      this.state.status !== "in_progress" ||
      !this.hasAllClues() ||
      !["time", "place"].includes(type) ||
      typeof isCorrect !== "boolean" ||
      this.state.answers[type]
    ) {
      return false;
    }

    if (!isCorrect) {
      return false;
    }

    this.state.answers[type] = true;

    if (
      this.state.answers.time &&
      this.state.answers.place
    ) {
      this.state.leafletCompleted = true;
      console.log("전단지가 완성되었습니다!");
    }

    this.save();
    return true;
  }

  deliverLeaflet(npcId) {
    if (
      npcId !== "U" ||
      this.state.status !== "in_progress" ||
      !this.state.leafletCompleted
    ) {
      return false;
    }

    this.state.delivered = true;
    this.state.status = "completed";
    this.save();

    console.log("퀘스트 성공! 전시를 활성화할 수 있습니다.");
    return true;
  }

  isCompleted() {
    return this.state.status === "completed";
  }

  getState() {
    return structuredClone(this.state);
  }

  resetQuest() {
    this.state = createInitialState();
    this.save();
  }
}

export const questSystem = new QuestSystem();
