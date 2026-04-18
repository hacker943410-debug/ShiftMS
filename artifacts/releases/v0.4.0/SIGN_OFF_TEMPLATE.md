# v0.4.0 Sign-off Record

## 기본 정보
- 실행일: 2026-04-18
- 담당자: Codex
- 환경: Windows 개발 PC / `release/0.4.0` / 자동 sign-off 기준 commit `12e3cc6`
- 설치본 경로: `release/ShiftMgmt-Setup-0.4.0-x64.exe`, `release/win-unpacked/ShiftMgmt.exe`
- DB / 샘플 데이터: bootstrap seed 계정 + Electron smoke용 로컬 테스트 데이터
- 권장 자동 실행: `npm run release:signoff`
- 실행 로그 경로: `artifacts/releases/v0.4.0/logs/release-signoff-2026-04-18T02-42-38-397Z.md`

## 자동 검증 재사용 확인
- [x] `npm run typecheck` (`2026-04-18`, commit `12e3cc6`)
- [x] `npm test` (`107 files / 428 tests`, `2026-04-18`)
- [x] `npm run build` (`2026-04-18`)
- [x] `npm run smoke:electron:operations-user` (`2026-04-18`)
- [x] `npm run smoke:electron:packaged` (`2026-04-18`)
- [x] `npm run smoke:electron:installer` (`2026-04-18`, `reinstall=verified`)
- [x] `npm run release:signoff` (`2026-04-18`)
- [x] `npm audit --audit-level=high` (`0 vulnerabilities`, `2026-04-18`)

## 수동 QA 결과

### 시나리오 실행
- [ ] 시나리오 1. 최초 운영 세팅과 양식 기준 확정
- [ ] 시나리오 2. 실적 승인부터 수당 계산과 품의 승인 마감까지
- [ ] 시나리오 3. 반려, 재승인, 요율 변경, 감사 추적 검증

### 인증 / 권한 / 세션
- [x] 첫 로그인 비밀번호 변경 강제 확인 (`operations-user` / `installer` smoke)
- [x] planner / reviewer / operator 권한 확인 (`operations-user` smoke)
- [ ] 앱 재시작 후 재로그인 확인

### 설치본 / 복구
- [x] fresh install 확인 (`installer` smoke)
- [x] same-path 재설치 확인 (`installer` smoke, `reinstall=verified`)
- [ ] JSON 백업 복구 확인
- [ ] Access DB 복구 확인

## 이슈 기록
- blocker: 없음 (자동 검증 기준)
- minor issue: 수동 QA와 실제 운영 데이터 복구 검증이 아직 기록되지 않았다.
- 후속 개선: profile / validation JSON migration 정리, 양식 관리 glossary / help 페이지 추가 여부 결정

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 승인자: 미기록
- 승인일: 미기록
- 비고: 자동 검증과 패키징은 완료됐다. 운영 데이터 기준 수동 QA, 복구 검증, 실제 계정 권한 확인을 마친 뒤 최종 승인값으로 갱신해야 한다.
