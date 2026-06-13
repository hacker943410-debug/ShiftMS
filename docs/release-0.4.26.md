# ShiftMgmt 0.4.26

퇴사·직무이동 인력 과거월 실적 복구

이번 업데이트는 퇴사, 직무이동, 삭제대기 처리된 인력의 과거월 실적 산정 누락을 방지하는 패치입니다. 운영 화면에서는 숨기되, 수당 지급에 필요한 직원·시급·근무지 배치 이력은 DB에 유지합니다.

## 인력 이력 보존
- **보존형 삭제** — 퇴사자 삭제는 직원 행을 제거하지 않고 `deleted_at`으로 숨김 처리하며, 시급 이력과 근무지 배치 이력은 유지합니다.
- **기본 목록 숨김** — 인력관리 기본 목록에서는 숨김 인력을 제외해 운영자 화면 노출은 기존 삭제대기 흐름과 동일하게 유지합니다.

## 과거월 실적 계산
- **숨김 인력 시급 조회** — 반환 근무표 파서는 숨김 인력과 전체 배치 이력을 포함해 근무일에 유효한 사번·시급을 해석합니다.
- **직무이동 보정** — 동명이인 후보는 현재 근무지가 아니라 근무일 당시의 근무지 배치 이력으로 먼저 좁혀 계산합니다.
- **퇴사일 경계 유지** — 퇴사일 이후 근무는 계산 후보에서 제외하고, 퇴사일 전 과거 근무만 지급 대상으로 해석합니다.

## 월근무표 복원
- **과거 배치 기준 복원** — 월근무표 자동 복원은 대상 월에 해당 근무지에 배치된 이력이 있는 숨김/퇴사/직무이동 인력도 매칭합니다.
- **빈 사용자 근무표 재복원** — 이전 버전에서 직원이 물리 삭제되어 근무표 항목이 비어 보이는 경우, 직원 이력이 복원되면 배포 근무표 기반 재복원 대상이 될 수 있습니다.

## 운영 참고
- 이미 이전 버전에서 직원이 물리 삭제된 경우, DB에 직원/시급/배치 이력이 남아 있지 않으면 자동 계산할 수 없습니다.
- 복구 방법은 DB 백업 복원 또는 동일 사번으로 직원, 시급, 과거 근무지 배치 이력을 재등록한 뒤 실적을 재파싱하는 방식입니다.
- 임의 시간/시급 입력 지급은 감사 이력과 승인 통제가 필요한 별도 보정 기능으로 분리했습니다.

## 검증
- RED 회귀 확인 — 기존 구현에서 삭제 후 과거 실적이 0분/시급 없음으로 실패하고, 복원도 0건으로 실패함을 재현
- `npx vitest run --maxWorkers=1 --minWorkers=1 src/main/services/employee-storage-service.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-file-intake-service.test.ts` 통과 — `3 files / 58 tests`
- `npm run typecheck` 통과
- `npm run test` 통과 — `130 files / 633 tests`
- `npm run build` 통과
- `npm run release:check` 통과
- `npm run release:publish` 통과
- `npm run smoke:electron:packaged` 통과
- `npm run smoke:electron:installer` 통과 — 재설치 후 데이터 보존 확인
- GitHub Release `v0.4.26` Published 상태 확인
- 원격 asset 확인 완료: `ShiftMgmt-Setup-0.4.26-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
