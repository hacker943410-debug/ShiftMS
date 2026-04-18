# v0.4.0 TODO

## 릴리즈 sign-off 남은 항목
- [ ] `docs/operations-manual-qa-checklist.md` 기준 운영 데이터 수동 QA 실행
- [x] `npm run smoke:electron:installer` / same-path reinstall 자동 검증
- [x] `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md`에 최신 자동 검증 결과와 sign-off 로그 기록
- [x] `근무지 관리 > 근무지 등록` 버튼 진입 회귀 수정 및 targeted regression 확인
- [x] `npm run package:win`으로 `ShiftMgmt-Setup-0.4.0-x64.exe` 재생성
- [ ] `artifacts/releases/v0.4.0/SIGN_OFF_TEMPLATE.md`에 릴리즈 PC 수동 QA 결과와 최종 승인 기록
- [ ] JSON 백업(`.json`)과 Access DB(`.accdb`) 복구 절차를 실제 운영 데이터로 각각 1회 확인
- [ ] planner / reviewer / operator 실제 계정으로 메뉴 노출과 버튼 권한을 수동 확인
- [ ] 대시보드 월 선택 팝오버와 `사이트 명 관리` 가이드 화면을 수동 캡처 기준으로 확인
- [ ] 최신 hotfix 설치본 기준 `근무지 등록` 진입을 운영 QA에서 재확인

## 릴리즈 후속 개선
- [ ] 저장된 profile / validation JSON migration 정리
- [ ] 양식 관리 glossary / help 페이지 추가 여부 결정
- [ ] role 체계 추가 세분화 필요성 재검토

## 완료 메모
- [x] Patch Set A-D 구현과 양식 출력 반영
- [x] DB 복구 Access 지원
- [x] 인증 / 세션 / 권한 하드닝
- [x] `admin / planner / reviewer / operator` 4단계 role 정책 정리
- [x] `npm run smoke:electron:operations-user`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`
- [x] `npm run release:signoff`
- [x] 운영 / 사용자 / 기능 / 유지보수 / 릴리즈 문서 정리
- [x] sign-off 초안에 자동 검증 / 최신 sign-off 상태 기록
- [x] follow-up hotfix `99cf05c` 문서 반영 및 `0.4.0` 설치본 재패키징

