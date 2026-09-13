# HANDOFF — RNN Codex → Gemini 구현 지시

<!-- GEMINI_HANDOFF_META
{
  "schemaVersion": 1,
  "status": "READY",
  "round": "RNN",
  "sender": "Codex",
  "recipient": "Gemini",
  "branch": "<branch>",
  "baseCommit": "<sha>",
  "allowedPaths": [
    "HANDOFF.md",
    "<exact/path/to/file>"
  ],
  "allowedDirtyPaths": [
    "<pre-existing/path-or-directory/>"
  ],
  "allowedCommands": [
    "git branch --show-current",
    "git rev-parse HEAD",
    "git status --short",
    "<exact targeted validation command>"
  ]
}
GEMINI_HANDOFF_META -->

## 0. 단일 목표

완료 여부를 한 문장으로 판정할 수 있는 원자적 목표를 적는다.

## 1. 현재 상태와 확정 결정

- 관찰된 증상과 재현 증거
- 확정한 원인
- 선택한 구현 전략과 이유
- 기각한 대안과 이유
- Gemini가 새로 결정할 설계 항목: 없음

## 2. 정확한 범위와 소유권

| 파일 | 허용 작업 | 책임 |
|---|---|---|
| `<path>` | 수정/생성/삭제 중 하나 | 구현할 정확한 내용 |
| `HANDOFF.md` | 완료 시 덮어쓰기 | 결과 계약 반환 |

목록 밖 파일은 읽기만 가능하다. 새 파일이 필요하면 만들지 말고 BLOCKED로 답한다.

`allowedDirtyPaths`에는 HANDOFF 발행 전에 이미 존재한 사용자 변경만 적는다. 디렉터리는 `/`로 끝낼 수 있다. `allowedCommands`는 Gemini가 실행해도 되는 shell 명령 전체를 정확한 문자열로 적는다. glob, 임의 인자, “등” 표현은 쓰지 않는다.

## 3. 비목표와 불변식

- 변경하지 않을 기능과 public API
- DB·승인 이력·계산 규칙의 보존 조건
- Electron main/preload/renderer 경계
- UI 문구는 한국어, 새 코드 주석은 영어
- 기존 사용자 변경 보존

## 4. 파일별 구현 전략

1. 파일과 symbol을 지정한다.
2. 변경 순서와 자료 흐름을 적는다.
3. 오류 처리와 반환값을 적는다.
4. 테스트 fixture와 핵심 assertion을 적는다.

## 5. 실패 모드와 금지 shortcut

- 경계 입력별 기대 결과
- 실패 시 기존 데이터가 바뀌지 않아야 하는 조건
- 임시 우회, 조용한 fallback, UI 하드코딩 등 금지할 구현

## 6. 실행 명령과 기대 증거

1. `<targeted command>` → 기대 exit code와 test count/assertion
2. `<typecheck/lint command>` → 기대 결과

전체 테스트, 패키징, 게시, 새 의존성 설치는 이 문서가 명시하지 않으면 실행하지 않는다.

## 7. 즉시 중지 조건

- 기준 branch/commit 불일치
- 허용하지 않은 기존 변경과 충돌
- allowlist 밖 파일 변경 필요
- 요구사항 또는 설계 해석 필요
- baseline 시험 실패
- 새 의존성, DB migration, 패키징, 게시 필요
- 불변식을 지키지 못할 가능성

하나라도 해당하면 코드를 더 수정하지 않고 BLOCKED 응답만 작성한다.

## 8. Gemini 응답 계약

작업이 끝나면 루트 `HANDOFF.md` 전체를 다음 구조로 덮어쓴다.

```markdown
# HANDOFF — RNN Gemini 구현 결과

<!-- GEMINI_HANDOFF_META
{"schemaVersion":1,"status":"COMPLETE","round":"RNN","sender":"Gemini","recipient":"Codex","branch":"<branch>","baseCommit":"<original-sha>","allowedPaths":[],"allowedDirtyPaths":[],"allowedCommands":[]}
GEMINI_HANDOFF_META -->

## STATUS
COMPLETE 또는 BLOCKED

## CHANGED
- `path`: 실제 변경 사실

## DIFF SUMMARY
- 구현한 동작만 기술

## TESTS
- `command`: exit code, 통과/실패 수

## INVARIANTS
- 항목별 확인 근거

## RISKS / QUESTIONS
NONE 또는 정확한 내용

## OUT-OF-SCOPE CHANGES
NONE 또는 정확한 경로
```

전체 diff를 HANDOFF에 붙이지 않는다. 추측성 설계 제안이나 후속 범위 확대를 하지 않는다.
