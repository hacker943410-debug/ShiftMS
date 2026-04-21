# v0.4.2 결과 보고

## 상태
- 핵심 자동 검증 완료
- `npm run typecheck`, `npm run test`, `node scripts/validate-structure.mjs`, `npm run release:package` 통과
- `ShiftMgmt-Setup-0.4.2-x64.exe` 설치본 생성 완료
- 운영 데이터 기준 수동 QA / packaged·installer smoke / 최종 sign-off 대기

## 구현 결과
- 근무지 관리에서 cycle 패턴 수정 시 입력 원문 문자열이 재진입 시 유지되도록 저장 경로를 보강했다.
- `shift_pattern_cycles.pattern_string` 컬럼을 추가해 표시용 원문 문자열을 별도로 저장하도록 정리했다.
- renderer 저장 payload, bridge 계약, main 저장소 매핑, selector 표시 우선순위를 같은 기준으로 맞췄다.
- 저장소 / selector 회귀 테스트를 추가해 cycle 원문 문자열 회귀를 방지했다.
- 패키지 버전을 `0.4.2`로 올리고 `0.4.2` NSIS 설치본을 재생성했다.

## 최종 자동 검증
- `npm run typecheck`
- `npm run test` (`108 files / 437 tests`)
- `node scripts/validate-structure.mjs`
- `npm run release:package`
- `artifacts/releases/v0.4.2/logs/2026-04-21-release-package.log`

## 배포 산출물
- 설치 파일: `release/ShiftMgmt-Setup-0.4.2-x64.exe`
- Unpacked 실행 파일: `release/win-unpacked/ShiftMgmt.exe`
- Block map: `release/ShiftMgmt-Setup-0.4.2-x64.exe.blockmap`

## 남은 release blocker
- `npm run smoke:electron:packaged`
- `npm run smoke:electron:installer`
- `npm run release:signoff`
- 운영 데이터 기준 수동 QA / 최종 승인 기록

## 후속 메모
- 기존에 저장된 cycle 데이터는 `pattern_string`이 없을 수 있어, 수정 전까지 fallback 문자열이 표시될 수 있다.
- Access 복원 duplicate 처리 이슈는 이번 릴리즈 범위에 포함하지 않았다.
