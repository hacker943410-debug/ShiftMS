# v0.4.2 QA 체크리스트

## 자동 검증 완료
- [x] `npm run typecheck`
- [x] `npm run test` (`108 files / 437 tests`)
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:package`
- [x] 패키징 로그 확인: `logs/2026-04-21-release-package.log`
- [x] 설치 산출물 확인:
  - `release/ShiftMgmt-Setup-0.4.2-x64.exe`
  - `release/ShiftMgmt-Setup-0.4.2-x64.exe.blockmap`
  - `release/win-unpacked/ShiftMgmt.exe`

## 자동 검증 미완료
- [ ] `npm run smoke:electron:packaged`
- [ ] `npm run smoke:electron:installer`
- [ ] `npm run release:signoff`

## 수동 QA
- [ ] 빈 DB 기준 로그인부터 기본 흐름 확인
- [ ] 근무지 관리에서 cycle 패턴 수정 후 저장 / 재진입 확인
- [ ] 기존 패턴 데이터 fallback 표시 확인
- [ ] JSON 백업 복원 확인
- [ ] Access DB 복원 확인
- [ ] 운영 데이터 기준 핵심 업무 흐름 확인

## 메모
- 이번 턴에서는 패키징까지만 수행했고, smoke / sign-off는 릴리즈 PC 기준으로 남아 있다.
