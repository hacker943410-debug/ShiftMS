# V0.2.0 결과 보고서

## 1. 작업 개요
- 버전 목표: `0.2.0`
- 작업 브랜치: `feature/v0.1.1-patch-finalize`
- 작업 일시: `2026-03-30`
- 최종 범위:
  - 인력 관리 `시급 일괄 업데이트` 기능 추가
  - 근무지 관리 `패턴 적용된 근무지 추가` 기능 추가
  - 공용 가이드 모달 / Excel 도식 컴포넌트 추가
  - Excel 파싱 및 패턴 탐지용 공용/서비스 로직 추가

## 2. 구현 결과 요약
- 시급 업데이트 일괄 적용:
  - Excel 파일 Import 기반으로 파일 선택, 컬럼 매핑, 적용일 입력, 미리보기, 트랜잭션 반영 흐름을 구현했다.
  - 근무지명 + 이름 기준 매칭, 동일 금액 제외, 퇴사자 제외, 중복 행 제외, 적용일 충돌 제외 처리를 넣었다.
  - 적용 시 기존 활성 시급 종료일을 적용일 전날로 자동 종료하고 새 이력을 생성한다.
- 패턴 산출 및 적용:
  - 표준 템플릿(A1=날짜, A2=요일, A3=공휴일, A4부터 근무자) 기반 Excel 파서를 구현했다.
  - 반복 Cycle 탐지, rotation 그룹 분류, `group + offset -> team` 변환을 구현했다.
  - 분석 결과는 DB에 바로 저장하지 않고 근무지 등록 1단계 draft에 자동 주입되도록 연결했다.
  - 외부 명세서 예시를 반영해 분석 결과 텍스트, 그룹별 상세, 불일치 내역, 원본 데이터 탭형 미리보기를 추가했다.
- 공통 가이드 / 미리보기:
  - 재사용 가능한 `GuideModal`, `SpreadsheetGuideFigure`를 추가했다.
  - 두 기능 모두 `가이드 보기`와 요약 카드/preview 테이블을 붙였다.
  - 가이드는 외부 이미지 의존 대신 앱 내부 도식 컴포넌트로 제공한다.

## 3. 주요 변경 파일
- 수정 파일:
  - `src/shared/bridge/contracts.ts`
  - `src/preload/index.ts`
  - `src/main/main.ts`
  - `src/renderer/screens/WorkforceManagementScreen.tsx`
  - `src/renderer/screens/SiteManagementScreen.tsx`
  - `src/renderer/styles.css`
- 신규 파일:
  - `src/shared/lib/excel-column.ts`
  - `src/shared/lib/excel-column.test.ts`
  - `src/shared/domain/site-pattern-detection.ts`
  - `src/shared/domain/site-pattern-detection.test.ts`
  - `src/main/services/workforce-wage-bulk-update-service.ts`
  - `src/main/services/workforce-wage-bulk-update-service.test.ts`
  - `src/main/services/site-pattern-extraction-service.ts`
  - `src/main/services/site-pattern-extraction-service.test.ts`
  - `src/renderer/components/GuideModal.tsx`
  - `src/renderer/components/SpreadsheetGuideFigure.tsx`

## 4. 검증 결과
- 타입체크: `통과`
  - `npm run typecheck`
- 테스트: `통과`
  - `npm run test`
  - 총 `48`개 파일, `187`개 테스트 통과
- 빌드: `통과`
  - `npm run build`
- 릴리즈 체크: `통과`
  - `npm run release:check`
- 구조 검증: `통과`
  - `node scripts/validate-structure.mjs`
- 패키징: `통과`
  - `npm run package:win`
- 설치본/실행본 smoke: `통과`
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
- 수동 QA: `미실행`
- 추가 브라우저 / Playwright 검증: `패키지 smoke 기준 통과`

## 5. 구현 판단 기준
- 시급 일괄 업데이트는 현재 활성 배치의 `근무지명 + 이름` 기준으로만 매칭한다.
- 패턴 산출은 `C:\Projects\Tools\패턴추출기\패턴추출기.md` 기준의 표준 템플릿만 지원한다.
- 패턴 분석 결과는 저장 전 draft 주입까지만 처리하고, 실제 근무지 저장은 기존 등록 흐름에서 사용자가 마무리한다.

## 6. 사용자 확인 필요 항목
- 인력 관리 모달에서 실제 운영 Excel 샘플로 컬럼 매핑과 제외 사유가 기대와 맞는지 확인 필요
- 근무지 관리 분석 모달에서 실제 현장 근무표로 Cycle / offset / 정원 제안이 기대와 맞는지 확인 필요
- 근무지 관리 분석 모달의 `분석 결과`, `그룹별 상세`, `불일치 내역`, `원본 데이터` 탭이 운영 샘플 기준으로 기대 출력과 맞는지 확인 필요
- 근무지 1단계로 가져온 뒤 근무시간, 휴게시간 기본값이 운영 기준과 맞는지 확인 필요

## 7. 남은 이슈 / 비고
- 표준 템플릿이 아닌 자유 형식 근무표는 이번 범위에서 지원하지 않는다.
- 패턴 산출 결과의 근무시간 / 휴게시간은 앱 기본값으로 채워지며 사용자가 1단계에서 최종 확인해야 한다.
- `vite-env.d.ts`는 기존 `Window.appBridge` 타입이 계약 인터페이스를 직접 참조하고 있어 별도 수정이 필요하지 않았다.

## 8. 패키징 / 릴리즈 결과
- 버전 업데이트: `완료`
  - `package.json`, `package-lock.json` -> `0.2.0`
- 패키징 결과: `완료`
  - `release/ShiftMgmt-Setup-0.2.0-x64.exe`
  - `release/win-unpacked/ShiftMgmt.exe`
- 설치본 확인: `완료`
- 커밋: `완료`
- 푸시: `미진행`

## 9. 다음 단계
- 원격 푸시
- 필요 시 운영 샘플 기준 수동 QA 보완
