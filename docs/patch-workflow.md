# 패치 / 릴리즈 작업 공통 워크플로

## 목적
- 이 문서는 교대근무관리시스템의 패치 및 릴리즈 작업을 항상 같은 흐름으로 진행하기 위한 공통 규칙이다.
- 기능 구현보다 문서 승인과 영향 범위 확인을 먼저 수행한다.

## 기본 원칙
1. 패치 작업을 시작할 때마다 `artifacts/releases/vX.Y.Z/` 버전 폴더를 먼저 생성한다.
2. 해당 버전 폴더 안에 분석, 영향 파일, 기능명세, TODO, QA, 결과 보고 문서를 모은다.
3. 구현 전에는 반드시 compact 문서를 만들어 이번 패치의 목표, 확정 결정, 비목표, 우선순위를 압축 정리한다.
4. 구현 전에는 반드시 분석 문서와 기능명세를 먼저 작성하고 사용자 확인을 받는다.
5. 승인 전에는 기능 코드, 버전 업데이트, 패키징, 커밋, 푸시를 진행하지 않는다.
6. 구현 중 생성되는 로그, 스크린샷, 검증 메모도 해당 버전 폴더 아래에 정리한다.
7. `docs/`에는 최신 운영 기준 문서만 유지하고, 버전별 릴리즈 상세/구현 계획/작업 로그는 `artifacts/releases/vX.Y.Z/` 또는 `artifacts/` 아카이브로 이동한다.
8. `docs/release-X.Y.Z.md`는 최신 활성 버전 1개만 유지하고, 이전 버전 릴리즈 문서는 각 버전 폴더의 `RESULT_REPORT.md`와 관련 문서로 관리한다.
9. 사용자가 `패키징`, `설치본 생성`, `버전으로 패키징`을 요청하면 기본값은 `npm run release:publish`까지 실행해 GitHub Release를 Published 상태로 만드는 것이다.
10. 사용자가 `로컬만`, `Draft만`, `게시 금지`를 명시한 경우에만 로컬 설치본 생성 또는 Draft 업로드에서 멈춘다.
11. `git push`는 코드 원격 반영일 뿐 사용자 자동업데이트 배포가 아니다. 설치 PC 업데이트 가능 상태는 Published GitHub Release와 `latest.yml`, 설치본, `.blockmap`, `RELEASE_MANIFEST.json` 업로드를 기준으로 판단한다.

## 문서 위치 규칙
1. 최신 기준 문서:
   - `docs/README.md`
   - `docs/project-handbook.md`
   - `docs/functional-spec.md`
   - `docs/operations-reference.md`
   - `docs/operations-manual-qa-checklist.md`
   - `docs/operator-quick-start.md`
   - `docs/patch-notes.md`
   - `docs/patch-workflow.md`
   - 최신 `docs/release-X.Y.Z.md`
2. 버전별 이력/분석/결과:
   - `artifacts/releases/vX.Y.Z/`
3. 작업 로그, 임시 분석, 계획 메모:
   - 원칙적으로 `docs/`에 두지 않는다.
   - 필요 시 해당 버전 폴더 또는 `artifacts/` 하위 전용 경로로 이동한다.

## 버전 폴더 표준 구조
```text
artifacts/releases/vX.Y.Z/
  README.md
  COMPACT_CONTEXT.md
  IMPLEMENTATION_ANALYSIS.md
  FILE_IMPACT.md
  FUNCTIONAL_SPEC.md
  RELEASE_MANIFEST.json
  TODO.md
  QA_CHECKLIST.md
  RESULT_REPORT.md
  logs/
  screenshots/
```

## 표준 진행 순서
1. 릴리즈 버전 폴더 생성
2. 현재 코드 / 문서 / 외부 참조 문서 분석
3. compact 문서 작성
4. 수정 및 생성 대상 파일 경로 정리
5. 기술 계획, 기능명세, TODO 작성
6. 사용자 문서 검토 및 승인
7. 구현 진행
8. 결과 보고서 및 QA 체크리스트 작성
9. 사용자 최종 확인
10. 버전 업데이트, 재패키징, 커밋, 푸시
11. 패키징 요청이 포함된 경우 GitHub Release 공개 게시와 원격 asset 확인

## 문서별 역할
- `README.md`
  - 해당 버전 작업 폴더의 인덱스와 현재 상태를 정리한다.
- `IMPLEMENTATION_ANALYSIS.md`
  - 현재 구조 분석, 구현 방향, 제약사항, 비목표를 정리한다.
- `COMPACT_CONTEXT.md`
  - 구현 시작 전 꼭 알아야 할 목표, 확정 결정, 비목표, 우선순위를 압축 정리한다.
- `FILE_IMPACT.md`
  - 수정 / 생성 예정 파일과 변경 이유를 경로 단위로 정리한다.
- `FUNCTIONAL_SPEC.md`
  - 사용자 흐름, 입력/출력, 검증 기준, 예외 처리를 기능 단위로 정리한다.
- `TODO.md`
  - 구현 단계를 순서와 의존성 기준으로 쪼갠다.
- `RELEASE_MANIFEST.json`
  - GitHub Releases 자동업데이트와 앱 내부 패치노트 표시 기준이 되는 버전 메타데이터를 담는다.
  - 문구 작성은 `docs/release-note-template.md`를 따른다.
  - `summary`는 2문장 이내, 220자 이하로 유지하고 상세 변경은 `sections`에 나눈다.
  - `notes`에는 번호를 직접 붙이지 않는다. 앱 UI에서 필요한 경우 목록 번호를 자동으로 표시한다.
- `QA_CHECKLIST.md`
  - 구현 후 점검해야 할 수동 QA 항목과 회귀 검증 항목을 정리한다.
- `RESULT_REPORT.md`
  - 최종 변경 내용, 검증 결과, 남은 이슈, 패키징 결과를 기록한다.

## 구현 단계 규칙
1. 파일 시스템 접근, Excel 파싱, 저장 처리는 Electron main / preload를 통해서만 노출한다.
2. 계산식, 파싱 규칙, 매핑 로직은 renderer가 아니라 shared 또는 main service에 둔다.
3. 이력 기반 기능은 기존 히스토리 구조를 우선 재사용하고, 조용한 덮어쓰기를 금지한다.
4. 새 의존성이 필요하면 현재 의존성으로 대체 가능한지 먼저 검토한다.
5. UI는 한국어 라벨을 사용하고, 설명용 가이드는 운영자가 따라 하기 쉬운 단계형 안내로 작성한다.

## 구현 후 체크포인트
1. 타입체크
2. 관련 단위 테스트
3. 구조 검증
4. 필요한 smoke 또는 Playwright 검증
5. 패치노트 / 릴리즈 문서 반영
6. 버전 업데이트와 재패키징
7. 패키징 요청 시 `npm run release:publish` 실행과 GitHub Release Published 상태 확인
8. `artifacts/releases/vX.Y.Z/` 표준 문서/폴더 누락 여부 확인
9. `docs/README.md`, `artifacts/releases/README.md` 인덱스 갱신 확인

## 운영 메모
- 외부 기술 문서를 참조한 경우, 핵심 규칙과 적용 범위는 버전 폴더의 분석 문서에 다시 요약한다.
- 동일한 패치 흐름이 필요한 후속 작업도 이 문서를 기준으로 시작한다.
- 문서가 `docs/`와 `artifacts/releases/`에 중복되기 시작하면, `docs/`에는 최신 기준만 남기고 상세 이력은 아카이브로 정리한다.
- GitHub Release는 Draft 검수 흐름을 유지할 수 있지만, 사용자가 별도 제한을 말하지 않은 `패키징` 요청의 최종 산출물은 항상 Published Release다.
