# 0.4.8 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-30`
- 현재 작업 브랜치: `release/0.4.8`
- 대상 버전: `0.4.8`
- 현재 단계: 패치 구현 및 자동 검증 완료, GitHub Release 게시 준비 완료
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.8/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.8/RELEASE_MANIFEST.json`

## 제품 개요
`0.4.8`은 패치이력 확인 방식을 게시판형 목록과 상세 페이지로 정리하고, 업데이트 후 패치노트 확인 흐름을 더 명확하게 다듬은 릴리즈다. 앱 실행 시에는 메인 창이 바로 최대화 상태로 열린다. 추가로 근무표 배포 Excel 좌측 Calendar의 이전달 날짜 표시형식을 현재월 날짜와 동일하게 보정했다.

## 이번 릴리즈 핵심 변경

### 1. 패치이력 게시판 전환
- `운영 관리 > 패치이력`에서 각 버전의 전체 내용을 바로 펼쳐 보여주던 방식을 정리했다.
- 목록은 `Patch Note 0.4.8`, `Patch Note 0.4.7`처럼 게시판 제목 형태로 보여준다.
- 게시글을 클릭하면 해당 버전의 상세 패치 내용을 확인하는 화면으로 이동한다.

### 2. 업데이트 후 패치노트 확인 흐름 정리
- 업데이트 후 실행 시 패치 내용을 버전별로 나누어 확인하는 흐름을 유지한다.
- 마지막 패치 버전에서는 `다음` 버튼 대신 `마침` 버튼을 표시한다.
- 패치노트 안내 문구도 버전별 확인 흐름에 맞게 정리했다.

### 3. 실행 창 최대화
- 프로그램 실행 시 메인 창을 바로 최대화 상태로 표시한다.
- 개발 실행과 패키징 실행 모두 같은 표시 흐름을 사용한다.

### 4. 근무표 배포 Calendar 날짜 서식 보정
- 2024년 10월처럼 Calendar 첫 주에 이전달 날짜가 포함되는 월을 기준으로 직접 재현했다.
- 이전달 날짜 값은 정상 계산되지만 템플릿 원본 셀의 표시형식이 `mm-dd-yy`로 남아 `DD일` 형식과 다르게 보이는 문제를 확인했다.
- 좌측 Calendar 날짜 셀은 출력 시점에 `dd"일"` 표시형식을 명시 적용하도록 보정했다.
- 하단 마지막 주차 줄도 양식 1 `39행`, 양식 2 `59행` 기준으로 함께 검증했다.

## 자동 검증 계획
- `npm run typecheck`
- `npm run test`
- `npx vitest run src/renderer/App.test.tsx src/renderer/screens/operations-management/OperationsReleaseHistorySection.test.tsx`
- `npx vitest run src/main/services/schedule-plan-export-service.test.ts`
- `npx vitest run src/main/services/schedule-plan-preview-service.test.ts src/main/services/schedule-plan-export-service.test.ts src/main/services/schedule-plan-adapter.test.ts`
- `node scripts/release-check.mjs`

## 배포 결과
- 설치본 산출물: `release/ShiftMgmt-Setup-0.4.8-x64.exe`
- GitHub Release 게시 대상: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.8`
- 포함 자산: 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`

## 남은 수동 확인
- 운영 관리 `패치이력` 목록 클릭 후 상세 화면 이동 확인
- 업데이트 후 패치노트 마지막 단계에서 `마침` 버튼 표시 확인
- 앱 실행 시 최대화 상태 표시 확인
- 근무표 배포 Excel 좌측 Calendar에서 이전달 날짜가 `DD일` 형식으로 표시되는지 확인
