# v0.4.1 Sign-off Record

## 기본 정보
- 실행일: `2026-04-20`
- 담당자: `Codex`
- 환경: `Windows 개발 PC / release/0.4.1`
- 설치본 경로: `release/ShiftMgmt-Setup-0.4.1-x64.exe`
- unpacked 경로: `release/win-unpacked/ShiftMgmt.exe`
- 자동 검증 로그: `artifacts/releases/v0.4.1/logs/release-signoff-2026-04-20T08-00-14-672Z.md`
- 보조 재검증 로그: `artifacts/releases/v0.4.1/logs/2026-04-20-auth-package-revalidation.md`

## 자동 검증 확인
- [x] `npm run release:check`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run typecheck`
- [x] `npm run test` (`108 files / 436 tests`)
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run release:signoff`
- [x] `npm run smoke:electron:packaged` (`release:signoff` 내 통과)
- [x] `npm run smoke:electron:installer` (`reinstall=verified`)
- [x] `npm audit --audit-level=high` (`0 vulnerabilities`)
- [x] 인증 관련 targeted test 7종 (`42 tests`)
- [x] `ShiftMgmt-Setup-0.4.1-x64.exe` 설치본 재생성

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
- [ ] 최신 `0.4.1` 설치본 기준 `근무지 등록` / 인증 흐름 수동 QA
- [ ] JSON 백업 복구 확인
- [ ] Access DB 복구 확인

## 이슈 기록
- blocker: 없음, 코드 / 패키징 수준 이슈는 확인하지 못함
- minor issue: 운영 데이터 기준 수동 QA와 복구 검증 기록이 아직 없다.
- 후속 개선: profile / validation JSON migration 정리, 양식 관리 glossary / help 페이지 추가 여부 결정

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 현재 blocker: 운영 데이터 수동 QA 미완료
- 비고: 자동 sign-off와 `0.4.1` 설치본 생성은 완료됐고, 실제 릴리즈 승인에는 수동 QA 기록만 남아 있다.
