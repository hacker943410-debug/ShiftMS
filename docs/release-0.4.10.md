# 0.4.10 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-05-07`
- 현재 작업 브랜치: `release/0.4.10`
- 대상 버전: `0.4.10`
- 현재 단계: 설치본 패키징 및 GitHub Release 게시 준비
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.10/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.10/RELEASE_MANIFEST.json`

## 제품 개요
교대근무관리시스템 `0.4.10`은 `0.4.9` 계정복구 기준선 위에서 실적 관리 승인대기 조회 안정화와 복구키 발급 유지보수 경로를 보강한 패치 릴리즈다.

## 이번 릴리즈 핵심 변경

### 1. 승인대기 실적 조회 안정화
- 승인대기 폴더가 `YYYY년/M월` 하위 구조로 누적되어도 선택 월 기준으로 필요한 파일만 우선 확인한다.
- 변경 없는 Excel 파일은 다시 열지 않고 기존 분석 결과를 재사용한다.
- 전체 기간 조회에서 새 파일이 많으면 한 번에 분석하는 파일 수를 제한하고 안내한다.

### 2. 파싱 진행률과 오류 안내
- 실적 관리 조회 중 파싱 진행률을 내부모달로 표시한다.
- 현재 파일, 처리 개수, 분석/재사용/확인 필요 건수를 보여준다.
- 실적 파일 규격과 맞지 않는 Excel은 파일명, 경로, 문제 사유를 내부모달로 안내한다.

### 3. 계정복구키 발급 스크립트 보강
- 로그인할 수 없는 기존 설치본에서도 복구키를 발급할 수 있도록 `issue-account-recovery-key.cmd/.mjs`를 설치 리소스에 포함한다.
- 기본 DB 경로 후보에 `%APPDATA%\shiftmgmt-v3-4\data\shiftmgmt.sqlite`를 포함한다.
- 복구키 발급 전 DB를 백업하고, 복구키 원문은 실행 결과에 1회 표시한다.

## 자동 검증 현황
- 실행한 명령:
  - `npm run typecheck`
  - `npm run test -- src/main/services/performance-file-intake-service.test.ts src/main/services/performance-management-service.test.ts src/main/services/performance-queue-service.test.ts`

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.10-x64.exe`
- block map: `release/ShiftMgmt-Setup-0.4.10-x64.exe.blockmap`
- 업데이트 메타데이터: `release/latest.yml`
- 앱 패치노트 메타데이터: `artifacts/releases/v0.4.10/RELEASE_MANIFEST.json`

## 남은 수동 확인
- 운영 PC에서 승인대기 폴더를 루트로 지정한 뒤 월별 조회가 멈추지 않는지 확인
- 잘못된 Excel 파일을 넣었을 때 내부모달에 원인이 표시되는지 확인
- 기존 설치본에서 자동업데이트 후 실적 관리 조회와 계정복구키 발급 스크립트를 확인
