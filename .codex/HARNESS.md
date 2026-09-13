# ShiftMgmt AI 작업 하네스

## 1. 권한 모델

| 역할 | 책임 | 금지 |
|---|---|---|
| Codex primary | 요구사항 해석, 위험 분류, 설계, 작업 분해, 모든 지시, 검증 기준, 결과 취합, 최종 판정 | Gemini에 넘긴 구현 파일의 동시 수정, 검증 없는 수용 |
| Codex economy/balanced subagent | 탐색, 사실 추출, 제한된 진단, 리뷰, 지정 검증 실행 | 추적 파일 수정, 설계 확정, 범위 확대, 최종 판정 |
| Gemini coder | `HANDOFF.md`에 고정된 전략과 파일 범위 안의 구현 및 지정 시험 | 요구사항 재해석, 목록 밖 변경, 커밋·푸시·패키징·게시 |
| 사용자 | Gemini를 직접 실행하고 Codex가 발행한 지시와 Gemini 답신을 두 도구 사이에서 중계 | 구현 세부를 다시 설계할 필요 없음 |

현재 모델 바인딩은 `.codex/config.toml`과 `.codex/agents/*.toml`만이 담당한다. 정책 문서에는 모델 세대명을 복제하지 않는다.

## 2. 작업 분류와 위임

- `economy`: 파일 탐색, 로그 요약, 구조 확인, 정해진 테스트 실행.
- `balanced`: 제한된 원인 분석, 영향 분석, 구현 계획 초안, 일반 리뷰.
- `frontier`: 오케스트레이션, 모호한 교차 시스템 판단, Electron 경계, 보안, 인증, DB·마이그레이션, 계산 규칙, 릴리즈 결정, 최종 통합.
- 구현은 난이도와 관계없이 Gemini coding lane을 사용한다.

독립적인 read-only 작업만 최대 3개 병렬화한다. 같은 파일이나 같은 가설을 중복 조사하지 않는다. 의존 작업은 `탐색 → primary 설계 확정 → Gemini 구현 → primary 검증` 순서로 직렬화한다.

## 3. Codex subagent 지시 계약

모든 직접 위임 프롬프트에는 다음을 포함한다.

1. 단일 목표와 필요한 배경
2. 읽을 파일 또는 제공된 근거
3. 명시적 비목표
4. read-only 또는 허용 임시 경로
5. 원하는 출력 형식
6. 실행 가능한 검증과 합격 기준
7. 불확실성, 충돌, 범위 초과 시 중지 조건
8. “결정을 내리지 말고 사실·선택지·근거를 보고”한다는 문구

전체 대화는 넘기지 않고 필요한 사실만 압축한다. 결과는 primary가 원본 파일·명령으로 다시 확인한다.

## 4. Gemini 라운드

1. Codex가 문제와 불변식을 확정한다.
2. `.codex/templates/gemini-handoff.md`로 루트 `HANDOFF.md`를 작성한다.
3. 발행 전에 요청 원문을 `handoff-log/YYYYMMDD_RNN-codex-to-gemini-<slug>.md`로 보존한다.
4. 사용자가 Gemini에서 `/handoff`를 실행한다.
5. Gemini는 metadata와 작업 트리를 확인하고 허용 범위만 구현한다.
6. Gemini는 완료 또는 중단 결과로 루트 `HANDOFF.md`를 덮어쓴다.
7. 사용자가 Codex에 “핸드오프 확인해”라고 중계한다.
8. Codex는 답신을 `handoff-log/YYYYMMDD_RNN-gemini-response-<slug>.md`로 보존한 뒤 diff와 시험을 독립 검증한다.
9. Codex 판정은 `handoff-log/YYYYMMDD_RNN-codex-review-<slug>.md`로 남기고 ACCEPT 또는 새 라운드를 발행한다.

활성 지시는 루트 `HANDOFF.md` 하나뿐이다. 아카이브는 수정하지 않는다.

Codex는 Gemini CLI를 직접 실행하거나 인증하거나 Gemini 세션에 명령을 보내지 않는다. Codex의 Gemini 관련 종료점은 `HANDOFF.md` 지시서 작성이며, 이후 실행과 전달은 사용자가 담당한다. Gemini 답신이 돌아온 뒤에만 Codex가 다시 검증을 시작한다.

## 5. Gemini 지시 작성 기준

Gemini는 구현 속도와 토큰 분산을 위해 사용하지만 설계 판단을 맡기지 않는다. HANDOFF에는 반드시 다음을 고정한다.

- 기준 브랜치, 기준 commit, 허용 작업 트리 상태
- 수정·생성·삭제 가능한 정확한 파일 목록과 소유 책임
- 발행 전에 이미 있던 변경의 `allowedDirtyPaths`와 실행 가능한 정확한 `allowedCommands`
- 확정한 원인과 선택한 전략, 기각한 대안
- 파일별 변경 순서와 함수·타입·호출부 수준의 지침
- 지켜야 할 데이터, 계산, Electron, UI 불변식
- 예상 실패 입력과 안전한 실패 결과
- 금지된 shortcut과 목록 밖 변경이 필요한 경우의 STOP 규칙
- 표적 검증 명령, 기대 exit code, 테스트 이름과 핵심 assertion
- 정해진 응답 형식

“적절히 수정”, “알아서 테스트”처럼 판단을 넘기는 표현을 사용하지 않는다.

Gemini shell은 기본 거부다. `allowedCommands`와 완전히 같은 명령만 실행할 수 있으며 파일 변경·Git 변경·의존성·패키징·게시 명령은 목록에 있어도 거부된다. `HANDOFF.md`는 allowlist 확장에 사용할 수 없고, 원 요청의 round/branch/baseCommit을 보존한 terminal COMPLETE/BLOCKED 응답으로만 한 번 교체할 수 있다.

## 6. 수용과 재작업

Codex는 다음을 모두 확인해야 ACCEPT할 수 있다.

- 변경 파일이 allowlist와 일치한다.
- 구현이 지시한 전략을 따르고 비목표를 건드리지 않는다.
- Electron main/preload/renderer 경계와 데이터 forward-only 규칙을 지킨다.
- 지정 시험과 Codex가 추가로 선택한 회귀 검증이 통과한다.
- 실패 경로가 기존 데이터를 조용히 덮어쓰지 않는다.
- 문서와 코드의 현재 동작이 일치한다.

같은 원인의 재작업은 한 번만 더 상세화한다. 두 번째 구현도 실패하면 같은 지시를 반복하지 말고 더 작은 원자 작업으로 분해하거나 사용자에게 coding lane 변경 여부를 확인한다.

## 7. Claude 폐기

Claude는 활성 역할이 없다. `CLAUDE.md`와 `.claude/`는 과거 설정 보존본이며 새 지시, 구현, 검증, 릴리즈에 사용하지 않는다.
