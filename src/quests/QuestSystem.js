
/**
 * 3·1운동 역사 전시관 퀘스트 시스템
 *
 * 기능
 * 1. 퀘스트 시작
 * 2. 전시물 단서 수집
 * 3. 진행 상황 확인
 * 4. 퀘스트 완료
 * 5. 퀘스트 초기화
 *
 * 전시관 화면과 독립적으로 동작하도록 설계
 */

export class QuestSystem {
  constructor() {
    // 퀘스트 진행 상태
    this.status = 'not_started';

    // 현재 수집한 단서
    this.collectedClues = new Set();

    // 수집해야 하는 단서
    // 실제 전시물과 연결할 때 변경 가능
    this.clues = [
      {
        id: 'clue_01',
        title: '독립선언서',
        description:
          '1919년 3월 1일 독립을 선언한 역사적 문서'
      },
      {
        id: 'clue_02',
        title: '태극기',
        description:
          '독립 만세 운동에서 사용된 상징'
      },
      {
        id: 'clue_03',
        title: '만세운동 기록',
        description:
          '전국으로 확산된 독립 만세 운동의 기록'
      }
    ];

    // 상태 변경을 화면에 전달하는 함수
    this.listeners = new Set();
  }

  // ===================================
  // 상태 변경 알림
  // ===================================

  subscribe(callback) {
    this.listeners.add(callback);

    // 현재 상태 즉시 전달
    callback(this.getState());

    // 구독 해제 함수 반환
    return () => {
      this.listeners.delete(callback);
    };
  }

  notify() {
    const state = this.getState();

    for (const callback of this.listeners) {
      callback(state);
    }
  }

  // ===================================
  // 퀘스트 시작
  // ===================================

  startQuest() {
    if (this.status !== 'not_started') {
      return false;
    }

    this.status = 'in_progress';
    this.notify();

    return true;
  }

  // ===================================
  // 단서 수집
  // ===================================

  collectClue(clueId) {
    // 퀘스트 진행 중에만 수집 가능
    if (this.status !== 'in_progress') {
      return false;
    }

    // 존재하는 단서인지 확인
    const clue = this.clues.find(
      item => item.id === clueId
    );

    if (!clue) {
      return false;
    }

    // 이미 수집한 단서는 중복 수집 불가
    if (this.collectedClues.has(clueId)) {
      return false;
    }

    this.collectedClues.add(clueId);

    // 모든 단서 수집 시 완료
    if (
      this.collectedClues.size ===
      this.clues.length
    ) {
      this.status = 'completed';
    }

    this.notify();

    return true;
  }

  // ===================================
  // 현재 퀘스트 상태
  // ===================================

  getState() {
    return {
      status: this.status,

      title: '3·1운동의 흔적을 찾아서',

      objective:
        this.status === 'not_started'
          ? '안내 NPC와 대화하세요.'
          : this.status === 'in_progress'
            ? '전시관에서 역사적 단서를 수집하세요.'
            : '모든 단서를 수집했습니다!',

      collectedCount: this.collectedClues.size,

      totalCount: this.clues.length,

      clues: this.clues.map(clue => ({
        ...clue,
        collected: this.collectedClues.has(clue.id)
      }))
    };
  }

  // ===================================
  // 퀘스트 완료 여부
  // ===================================

  isCompleted() {
    return this.status === 'completed';
  }

  // ===================================
  // 퀘스트 초기화
  // ===================================

  resetQuest() {
    this.status = 'not_started';
    this.collectedClues.clear();
    this.notify();
  }
}

// 기본 퀘스트 시스템 인스턴스
export const questSystem = new QuestSystem();
