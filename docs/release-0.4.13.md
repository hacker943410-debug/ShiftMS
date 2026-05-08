# 0.4.13 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-05-08`
- 현재 작업 브랜치: `release/0.4.13`
- 대상 버전: `0.4.13`
- 현재 단계: 설치본 패키징 및 GitHub Release 게시
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.13/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.13/RELEASE_MANIFEST.json`

## 제품 개요
교대근무관리시스템 `0.4.13`은 품의서/별첨 출력물의 저장 위치와 수당 표시 기준을 운영 표준에 맞추고, DB복원과 인력관리 BP 구분을 보강한 패치 릴리즈다.

## 이번 릴리즈 핵심 변경

### 1. 품의서/별첨 출력 경로 표준화
- 품의서, 별첨1, 별첨2 Excel/PDF를 사용자가 지정한 기준 폴더 아래 `YYYY년\MM월` 폴더에 저장한다.
- 파일명은 `YYYY_MM_품의서`, `YYYY_MM_별첨1`, `YYYY_MM_별첨2` 기준으로 통일한다.
- 출력 실패 시 실제 시도 경로와 실패 원인을 내부 모달로 안내한다.

### 2. 수당 계산과 별첨1 보정
- 문서에 반영되는 최종품의수당은 `시급 * 요율 * 근로시간` 기준 총수당 합계를 원 단위 올림 처리한다.
- 연장근무 실적은 기본근로수당이 아니라 연장근로수당으로 출력한다.
- 별첨1에서 순번, 근무지, 직원명, 근무일, 근무구분, 근무시간, 수당금액이 빈칸으로 남지 않도록 보정했다.

### 3. DB복원과 인력관리 개선
- DB복원 시 인력 상태가 공백, 미분류, 알 수 없는 값이면 `재직`으로 저장한다.
- 인력관리 화면에 `전체 / BP / BP 제외` 필터를 추가했다.
- 현재 필터 기준 인원 수와 전체 인원 수를 함께 표시한다.

### 4. 품의서 문서번호 보정
- 품의서 Excel과 PDF의 문서번호가 문서일자에 표시된 월 기준 `YYYY-MM`으로 출력된다.
- 문서일자를 해석할 수 없을 때만 기존 집행월 값을 fallback으로 사용한다.

## 자동 검증 현황
- 실행한 명령:
  - `npx vitest run src/shared/domain/allowance-document.test.ts src/main/services/allowance-document-pdf-service.test.ts src/main/services/allowance-document-export-service.test.ts --maxWorkers=1 --minWorkers=1`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- 배포 중 추가 실행:
  - `npm run release:check`
  - `npm run release:publish`

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.13-x64.exe`
- block map: `release/ShiftMgmt-Setup-0.4.13-x64.exe.blockmap`
- 업데이트 메타데이터: `release/latest.yml`
- 앱 패치노트 메타데이터: `artifacts/releases/v0.4.13/RELEASE_MANIFEST.json`
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.13`
- GitHub Release 상태: Published 예정

## 남은 수동 확인
- 운영 양식으로 품의서/별첨1/별첨2 Excel/PDF가 지정 경로에 생성되는지 확인
- 별첨1 Blank 셀과 연장근무 수당 매핑이 실제 운영 데이터에서 맞는지 확인
- 복원 데이터에서 공백/미분류 인력이 `재직`으로 보이는지 확인
- 인력관리 BP 필터와 인원 수 표시가 실제 데이터와 일치하는지 확인
