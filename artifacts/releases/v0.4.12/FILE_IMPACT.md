# v0.4.12 파일 영향 범위

## 변경 파일
- `package.json`
- `package-lock.json`
- `src/shared/domain/performance-file.ts`
- `src/shared/domain/performance-file.test.ts`
- `src/main/services/schedule-return-performance-parser.ts`
- `src/main/services/schedule-return-performance-parser.test.ts`
- `src/main/services/performance-management-service.ts`
- `src/main/services/performance-management-service.test.ts`
- `src/renderer/screens/PerformanceManagementScreen.tsx`
- `src/renderer/styles.css`
- `docs/release-0.4.12.md`
- `docs/README.md`
- `docs/patch-notes.md`
- `artifacts/releases/README.md`
- `artifacts/releases/v0.4.12/*`

## 주요 영향
- 실적 파싱: `(P)` suffix와 Pool 근무조를 수당 미지급 대체근무로 인식한다.
- 실적관리: Pool 대체근무 행을 목록에 유지하고 상태/정보 모달을 표시한다.
- 수당 산정: Pool 대체근무는 승인 가능 건수와 지급 산정에서 제외된다.
- 문서/릴리즈: `0.4.12` 기준 표준 문서와 앱 패치노트 manifest를 추가한다.
