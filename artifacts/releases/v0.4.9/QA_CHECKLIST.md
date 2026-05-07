# v0.4.9 QA Checklist

## 자동 검증
- `npm run typecheck`
- `npm run test`
- `npm run test -- src/main/services/account-recovery-service.test.ts src/main/services/sqlite-storage-service.test.ts src/renderer/components/LoginScreen.test.tsx src/renderer/App.test.tsx`
- `node scripts/release-check.mjs`

## 수동 검증
- 로그인 화면에 `계정복구` 버튼이 표시된다.
- 복구키가 없으면 미발급 안내가 표시된다.
- 운영 관리 사용자 관리에서 복구키를 발급하면 1회 표시 모달이 열린다.
- 발급된 복구키로 admin 계정 복구 시 임시 비밀번호가 표시된다.
- 임시 비밀번호로 로그인하면 비밀번호 변경 화면이 표시된다.
- 잘못된 복구키 5회 입력 시 15분 잠금 안내가 표시된다.
- 활동 이력에 계정복구와 복구키 발급이 남는다.
