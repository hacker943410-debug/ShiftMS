# 0.4.12 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-05-07`
- 현재 작업 브랜치: `release/0.4.12`
- 대상 버전: `0.4.12`
- 현재 단계: 설치본 패키징 및 GitHub Release 게시 완료
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.12/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.12/RELEASE_MANIFEST.json`

## 제품 개요
교대근무관리시스템 `0.4.12`는 `0.4.11` 실적관리 대량 조회 안정화 기준선 위에서 Pool 대체근무의 운영 이력과 수당 지급 기준을 분리한 패치 릴리즈다.

## 이번 릴리즈 핵심 변경

### 1. Pool 대체근무 수당 미지급 처리
- 실적 파일의 근무대체자가 `이름(P)`로 표기되면 Pool 대체근무로 인식한다.
- 등록 인력의 현재 근무조가 `Pool`인 직원이 대체근무자로 들어온 경우도 Pool 대체근무로 인식한다.
- Pool 대체근무는 실적관리 목록과 파일 분석 이력에 남기되 승인 가능 건수와 수당 산정 대상에서는 제외한다.

### 2. 원본 표기와 비고 보존
- `이름(P)`는 저장 시 직원명에서 `(P)`를 제거해 실제 이름으로 매칭한다.
- 원본 표기는 비고에 `원본 표기 이름(P)`로 남긴다.
- Pool 대체근무 행 비고에는 `Pool 대체근무`, `수당 미지급`을 함께 남긴다.

### 3. 실적관리 정보 모달
- 실적관리 목록 우측에 `INFO` 버튼을 추가했다.
- 버튼을 누르면 근무지, 조이름, 고용형태, 상태, 배정기간, 현재시급, 근무일 적용시급, 시급 이력을 내부 모달로 확인할 수 있다.
- 등록 인력 정보가 연결되지 않은 경우에도 실적 파일 기준 정보와 오류 안내를 표시한다.

### 4. 표시 정렬 보정
- 실적관리 `근무예정자`, `근무대체자` 컬럼의 이름, 근무지, 하이픈 표시를 가운데 정렬로 통일했다.
- Pool 대체근무 행에는 `수당 미지급` 배지와 상태 안내를 함께 표시한다.

## 자동 검증 현황
- 실행한 명령:
  - `npm run typecheck`
  - `npx vitest run src/shared/domain/performance-file.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-management-service.test.ts --maxWorkers=1 --minWorkers=1`
  - `npm run build`
  - `npm run release:check`
  - `node scripts/validate-structure.mjs`
  - `git diff --check`
  - `npm run release:publish`

## 배포 산출물 기준
- 설치 파일: `release/ShiftMgmt-Setup-0.4.12-x64.exe`
- block map: `release/ShiftMgmt-Setup-0.4.12-x64.exe.blockmap`
- 업데이트 메타데이터: `release/latest.yml`
- 앱 패치노트 메타데이터: `artifacts/releases/v0.4.12/RELEASE_MANIFEST.json`
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.12`
- GitHub Release 상태: Published

## 남은 수동 확인
- 운영 실적 Excel에서 `이름(P)` 대체근무가 `수당 미지급`으로 표시되는지 확인
- Pool 조 등록 인력이 대체근무자로 들어온 경우 승인 버튼 없이 이력만 유지되는지 확인
- 실적관리 INFO 모달의 근무일 적용 시급이 인력 관리 시급 이력과 일치하는지 확인
