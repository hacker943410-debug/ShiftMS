# 0.4.5 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-23`
- 현재 작업 브랜치: `release/0.4.5`
- 대상 버전: `0.4.5`
- 현재 단계: GitHub Release 공개 게시 완료, 사용자 PC 업데이트 확인 대기
- 연계 문서:
  - `docs/operations-manual-qa-checklist.md`
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.5/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.5/RELEASE_MANIFEST.json`

## 제품 개요
교대근무관리시스템 `0.4.5`는 `0.4.4` 기준선 위에서 GitHub Releases 자동업데이트, BP 인력 운영, 근무조 배정 순서, 선택형 목록박스 저장값 보정을 묶은 패치 릴리즈다. 이번 버전은 설치본 배포 반복 비용을 줄이고, 화면에 표시된 선택값과 실제 저장값이 달라지는 사용자 혼란을 제거하는 데 초점을 맞췄다.

## 이번 릴리즈 핵심 변경

### 1. GitHub Releases 자동업데이트
- 앱 시작 후 패키징 환경에서 GitHub Releases 최신 버전을 확인한다.
- 업데이트가 있으면 내부 모달로 버전, 핵심 변경, 다운로드/재시작 적용 흐름을 안내한다.
- `RELEASE_MANIFEST.json`을 앱 내부 패치노트 기준으로 사용한다.
- 패키징 요청은 기본적으로 GitHub Release Published 상태까지 완료하는 운영 규칙으로 고정했다.

### 2. 인력/근무조 운영 보강
- 신규 인력 등록에서 `BP` 고용형태를 지원한다.
- BP 인력은 사원번호와 통상시급 없이 등록 가능하며 실적 파싱/수당 계산에서는 제외된다.
- 근무조 내 인력 순서를 위/아래 이동으로 조정하고, 저장된 순서를 근무표 배포 시뮬레이션과 배포 현황에 반영한다.
- 주요 메뉴 필터 기본값은 전체 기준으로 맞춰 메뉴 진입 시 표시 데이터와 필터 상태가 일치하도록 정리했다.

### 3. 선택형 목록박스 저장값 보정
- 공통 선택형 목록박스가 실제 값과 매칭되는 옵션이 없을 때 첫 번째 옵션을 선택된 것처럼 보여주지 않도록 수정했다.
- 인력 상세의 `고용형태`는 기존 데이터가 비어 있거나 미분류인 경우 실제 form state도 `정규`로 초기화해 표시값과 저장 payload를 일치시킨다.
- 관련 회귀 테스트를 추가했다.

### 4. 복원/양식/문서 정리
- Access 복원 진단, 근무실적 복원 조건, 기본 양식 fallback, 품의서 사이트명 표기 경로를 보강했다.
- 주요 저장/적용 액션의 결과 모달과 활동 이력 반영을 확대했다.
- `docs/`는 최신 운영 기준 문서만 남기고 과거 릴리즈 상세와 중복 문서는 아카이브로 정리했다.

## 자동 검증 현황
- 실행한 명령:
  - `npm run typecheck`
  - `npm test -- src/renderer/components/FormSelect.test.tsx src/renderer/screens/workforce/workforce-employment-type-options.test.ts`
  - `node scripts/release-check.mjs`
  - `npm run release:publish`
- 설치본과 GitHub Release asset 생성 및 Published 상태 확인을 완료했다.

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.5-x64.exe`
- block map: `release/ShiftMgmt-Setup-0.4.5-x64.exe.blockmap`
- 업데이트 메타데이터: `release/latest.yml`
- 앱 패치노트 메타데이터: `artifacts/releases/v0.4.5/RELEASE_MANIFEST.json`

## 남은 수동 확인
- 기존 설치 PC에서 업데이트 안내 모달이 표시되는지 확인
- 업데이트 다운로드 후 재시작 적용이 정상 동작하는지 확인
- 운영 데이터 기준 BP 인력/근무조 순서/고용형태 저장 보정이 실제 DB와 화면에 일치하는지 확인
