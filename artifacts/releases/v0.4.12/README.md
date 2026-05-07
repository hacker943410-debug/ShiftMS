# v0.4.12 릴리즈 아카이브

## 요약
- 버전: `0.4.12`
- 기준일: `2026-05-07`
- 브랜치: `release/0.4.12`
- 성격: Pool 대체근무 이력 유지 및 수당 미지급 처리, 실적관리 인력/시급 정보 확인 패치
- 배포 상태: GitHub Release `v0.4.12` 공개 게시 완료

## 핵심 변경
- 실적 파일의 근무대체자가 `이름(P)`로 표기되거나 등록 인력의 근무조가 `Pool`인 경우 대체근무 이력은 보존하되 수당 승인/산정 대상에서 제외한다.
- Pool 대체근무 행은 실적관리 목록에 `수당 미지급` 상태로 표시하고 승인 버튼 대신 안내 문구를 보여준다.
- 실적관리 목록 우측에 인력/시급 정보 버튼을 추가해 근무지, 조이름, 고용형태, 적용 시급, 시급 이력을 내부 모달로 확인할 수 있게 했다.
- 실적관리 `근무예정자`, `근무대체자` 컬럼의 이름/근무지/하이픈 표시를 가운데 정렬로 통일했다.

## 검증
- `npm run typecheck`
- `npx vitest run src/shared/domain/performance-file.test.ts src/main/services/schedule-return-performance-parser.test.ts src/main/services/performance-management-service.test.ts --maxWorkers=1 --minWorkers=1`
- `npm run build`
- `npm run release:check`
- `node scripts/validate-structure.mjs`
- `git diff --check`
- `npm run release:publish`

## 배포 확인
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.12`
- 공개 상태: Published
- 포함 자산: `ShiftMgmt-Setup-0.4.12-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`

## 산출물
- `RELEASE_MANIFEST.json`
- `RESULT_REPORT.md`
- `QA_CHECKLIST.md`
- `FILE_IMPACT.md`
- `FUNCTIONAL_SPEC.md`
- `IMPLEMENTATION_ANALYSIS.md`
- `COMPACT_CONTEXT.md`
- `TODO.md`
