# 0.4.9 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-05-07`
- 현재 작업 브랜치: `release/0.4.9`
- 대상 버전: `0.4.9`
- 현재 단계: 계정복구 패치 구현 및 자동 검증 완료
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.9/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.9/RELEASE_MANIFEST.json`

## 제품 개요
`0.4.9`는 admin 계정 잠금 또는 비밀번호 분실 상황을 대비해 복구키 기반 계정복구 기능을 추가한 릴리즈다. 로그인 화면에서 복구키를 입력하면 복구 전 DB를 백업하고 admin 임시 비밀번호를 발급한다.

## 핵심 변경
- 로그인 화면에 `계정복구` 버튼과 내부 모달을 추가했다.
- 운영 관리 `사용자 관리`에서 admin 계정복구키를 발급할 수 있게 했다.
- 복구키 원문은 발급 직후 1회만 표시하고 DB에는 scrypt 해시만 저장한다.
- 복구키 입력도 5회 실패 시 15분 잠금된다.
- 복구 성공 시 admin 계정 잠금/실패 횟수를 초기화하고 임시 비밀번호 변경을 강제한다.
- 복구 전 SQLite DB를 `account-recovery-backups` 폴더에 백업한다.
- 복구키 미발급 기존 설치본 대응용 `reset-admin-password.mjs` 유지보수 스크립트를 설치본 리소스에 포함한다.

## 자동 검증 결과
- `npm run typecheck`: 통과
- `npm run test`: 통과
- `npm run test -- src/main/services/account-recovery-service.test.ts src/main/services/sqlite-storage-service.test.ts src/renderer/components/LoginScreen.test.tsx src/renderer/App.test.tsx`: 통과
- `npm run build`: 통과
- `node scripts/release-check.mjs`: 통과

## 남은 수동 확인
- 복구키 발급 후 로그아웃
- 로그인 화면에서 복구키로 admin 임시 비밀번호 발급
- 임시 비밀번호 로그인 후 비밀번호 변경 강제 확인
- 복구 전 DB 백업 파일 생성 확인
