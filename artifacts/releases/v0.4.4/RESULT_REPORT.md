# v0.4.4 결과 보고

## 결과
- `0.4.4` 설치본 패키징 완료
- Access 복원 진단 문구 보강 반영
- 설치본 기본 양식 fallback 반영
- 품의서 사이트명 좌측 표기 수정 반영

## 자동 검증
- `npm run typecheck`
- `npm test -- src/main/services/allowance-document-export-service.test.ts`
- `npm run release:package`

## 산출물
- `release/ShiftMgmt-Setup-0.4.4-x64.exe`
- `release/ShiftMgmt-Setup-0.4.4-x64.exe.blockmap`
- `release/win-unpacked/ShiftMgmt.exe`
- `artifacts/releases/v0.4.4/logs/2026-04-23-release-package.log`

## 잔여 이슈
- 직접 설치 기준 수동 QA 미실행
- packaged / installer smoke 미실행
