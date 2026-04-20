# v0.4.1 TODO

## 릴리즈 sign-off 남은 항목
- [ ] `docs/operations-manual-qa-checklist.md` 기준 운영 데이터 수동 QA 실행
- [x] `npm run release:check`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run release:signoff`
- [x] `artifacts/releases/v0.4.1/SIGN_OFF_TEMPLATE.md`에 최신 자동 검증 결과와 sign-off 로그 기록
- [ ] `artifacts/releases/v0.4.1/SIGN_OFF_TEMPLATE.md`에 릴리즈 PC 수동 QA 결과와 최종 승인 기록
- [ ] JSON 백업(`.json`)과 Access DB(`.accdb`) 복구 절차를 실제 운영 데이터로 각각 1회 확인
- [ ] planner / reviewer / operator 실제 계정으로 메뉴 노출과 버튼 권한을 수동 확인
- [ ] 대시보드 월 선택 팝오버와 `사이트 명 관리` 가이드 화면을 수동 캡처 기준으로 확인
- [ ] 최신 `0.4.1` 설치본 기준 `근무지 등록` / 인증 흐름을 운영 QA에서 재확인

## 릴리즈 후속 개선
- [ ] 저장된 profile / validation JSON migration 정리
- [ ] 양식 관리 glossary / help 페이지 추가 여부 결정
- [ ] role 체계 추가 세분화 필요성 재검토

## 완료 메모
- [x] `0.4.0` 누적 기능과 `근무지 등록` hotfix를 `0.4.1` 기준으로 승격
- [x] 관리자 bootstrap `1234`, 공통 비밀번호 정책, `내 정보` 비밀번호 변경 흐름 반영
- [x] Electron auth helper 공통화 및 installer 재설치 smoke 안정화
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run release:signoff` (`release-signoff-2026-04-20T08-00-14-672Z.md`)
- [x] `ShiftMgmt-Setup-0.4.1-x64.exe` 설치본 생성
- [x] 운영 / 기능 / 유지보수 / 릴리즈 문서 정리
