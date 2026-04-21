# v0.4.2 Compact Context

## 목표
- `0.4.1` 설치본 기준선을 유지한 채 근무지 패턴 수정 시 cycle 원문 문자열이 보존되지 않던 현상을 hotfix 한다.
- 수정 내용을 포함한 Windows NSIS 설치본을 `0.4.2`로 다시 패키징한다.

## 포함 범위
- `shift_pattern_cycles` 저장 스키마 보강
- renderer 저장 payload 보강
- main 저장소 매핑 / 조회 경로 보강
- selector 표시 우선순위 보강
- 관련 회귀 테스트 추가
- 릴리즈 문서 / 패키지 버전 갱신

## 제외 범위
- Access 복원 로직 중복 처리 개선
- 운영 데이터 구조 변경
- 추가 기능 개발
- packaged / installer smoke 재구성

## 현재 검증 상태
- 완료:
  - `npm run typecheck`
  - `npm run test`
  - `node scripts/validate-structure.mjs`
  - `npm run release:package`
- 미완료:
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
  - 운영 데이터 수동 QA
  - 최종 sign-off

## 핵심 위험
- 기존에 저장된 cycle 데이터에는 `pattern_string`이 없을 수 있어, 해당 패턴은 한 번 수정/저장 전까지 재구성 문자열이 표시될 수 있다.
- 설치본 생성은 완료됐지만 packaged / installer smoke를 이번 턴에 재실행하지 않아 최종 릴리즈 승인은 아직 아니다.
