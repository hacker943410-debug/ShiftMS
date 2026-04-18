# v0.4.0 Sign-off Record

## 기본 정보
- 실행일: 2026-04-18
- 담당자: Codex
- 환경: Windows 개발 PC / `release/0.4.0`
- full sign-off 기준 commit: `d4aaa76`
- follow-up hotfix commit: `99cf05c`
- 설치본 경로: `release/ShiftMgmt-Setup-0.4.0-x64.exe`
- unpacked 경로: `release/win-unpacked/ShiftMgmt.exe`
- 자동 검증 로그: `artifacts/releases/v0.4.0/logs/release-signoff-2026-04-18T02-42-38-397Z.md`
- 추가 이력: `99cf05c`에서 `근무지 등록` 진입 회귀 수정과 설치본 재패키징 반영

## 자동 검증 확인
- [x] `npm run typecheck` (`2026-04-18`)
- [x] `npm test` (`107 files / 428 tests`, `2026-04-18`)
- [x] `npm run build` (`2026-04-18`)
- [x] `npm run smoke:electron:operations-user` (`2026-04-18`)
- [x] `npm run smoke:electron:packaged` (`2026-04-18`, full sign-off 기준)
- [x] `npm run smoke:electron:installer` (`2026-04-18`, `reinstall=verified`)
- [x] `npm run release:signoff` (`2026-04-18`)
- [x] `npm audit --audit-level=high` (`0 vulnerabilities`, `2026-04-18`)
- [x] `npm test -- SiteListView.test.tsx` (`2026-04-18`, `99cf05c`)
- [x] Electron 직접 기동 기준 `근무지 등록 -> 1단계: 패턴 등록` 진입 확인 (`2026-04-18`, `99cf05c`)
- [x] `npm run package:win` (`2026-04-18`, `99cf05c`)

## 수동 QA 결과

### 시나리오 실행
- [ ] 시나리오 1. 최초 운영 셋업과 양식 기준 확정
- [ ] 시나리오 2. 실적 승인부터 수당 계산과 품의 확인 마감까지
- [ ] 시나리오 3. 반려, 소급, 요율 변경, 감사 추적 검증

### 인증 / 권한 / 세션
- [x] 첫 로그인 비밀번호 변경 강제 확인 (`operations-user` / `installer` smoke)
- [x] planner / reviewer / operator 권한 확인 (`operations-user` smoke)
- [ ] 앱 재시작 후 재로그인 확인

### 설치본 / 복구
- [x] fresh install 확인 (`installer` smoke)
- [x] same-path 재설치 확인 (`installer` smoke, `reinstall=verified`)
- [ ] 최신 hotfix 설치본 기준 `근무지 등록` 진입 수동 QA
- [ ] JSON 백업 복구 확인
- [ ] Access DB 복구 확인

## 이슈 기록
- blocker: 없음, 코드 수준 hotfix와 재패키징까지 반영 완료
- minor issue: latest hotfix 이후 full packaged smoke / installer smoke를 다시 돌리지는 않았고, targeted regression과 재패키징으로 마감했다.
- minor issue: 운영 데이터 기준 수동 QA와 복구 검증 기록이 아직 없다.
- 후속 개선: profile / validation JSON migration 정리, 양식 관리 glossary / help 페이지 추가 여부 결정

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 현재 blocker: 운영 데이터 수동 QA 미완료
- 비고: 자동 sign-off 로그는 `d4aaa76` 기준으로 유지하고, 최신 코드 기준 후속 hotfix `99cf05c`는 targeted regression과 `0.4.0` 설치본 재생성까지 반영했다.
