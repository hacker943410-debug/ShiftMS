# v0.4.17 패치 의사결정

## 배경
- 마지막 Published Release는 `v0.4.16`이다.
- 이 PC와 원격 Git에는 `release/0.4.15`, `release/0.4.16` 소스 브랜치가 보존되어 있지 않다.
- 따라서 `0.4.17`은 `0.4.14` 소스 기준에서 필요한 패치만 선별 재구현한다.

## 사용자 승인
- 적용 승인 번호: `1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19`
- 미승인 번호: `4, 7, 8`
- 적용 원칙: 승인 번호만 반영하고, 추가 패치는 사용자 재지시 전까지 진행하지 않는다.

## 적용 완료
- 문서 출력 Excel 병합 셀 hotfix와 회귀 테스트
- renderer root 및 route-level `ErrorBoundary`
- 월 근무표 저장 전 직원 사번 선검증과 트랜잭션 보호
- DB 시작 시 orphan `.migration-backup-*` 최신 백업 복구
- 운영 요율 매트릭스 빈 값 및 비정상 숫자 저장 방지
- 빈 `patternStartDate` 월 시작일 fallback
- 근무지 패턴 문자열 canonical day/night slot 기준 표시
- 근무패턴 반복 표현 회귀 테스트
- 인력관리 고용형태 집계의 현재 필터 기준 계산
- 근무표 규칙 경고 엔진과 화면 요약
- 운영 설정의 근무표 경고 기준 저장 UI와 SQLite 저장
- 요율 영향 미리보기
- 지급 대상 수당 라인이 후보 요율로 0원화되는 경우 별도 경고

## 제외 유지
- 인증 bootstrap 기본 비밀번호 제거 및 최소 길이 정책 변경
- Electron window-open, navigation, redirect 제한과 CSP 변경
- 위 항목은 보안/오류 격리 계층을 바꾸는 변경이라 현재 오류 원인 검토 전에는 적용하지 않는다.

## 이번 단계 완료 기준
- `package.json` / `package-lock.json` 버전이 `0.4.17`이다.
- `artifacts/releases/v0.4.17/RELEASE_MANIFEST.json`이 앱 패치노트 기준을 제공한다.
- 승인된 항목에 대한 코드와 회귀 테스트가 존재한다.
- `npm run typecheck`, 승인 범위 타깃 테스트, `npm run build`, `node scripts/validate-structure.mjs`, `npm run release:check`를 통과한다.
- 패키징과 GitHub Release 게시 기준은 다음 사용자 지시 전까지 보류한다.
