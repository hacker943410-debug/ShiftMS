# V0.2.0 TODO

## Phase 1. 문서 승인
- [x] T-001 `IMPLEMENTATION_ANALYSIS.md` 사용자 검토
- [x] T-002 `FILE_IMPACT.md` 사용자 검토
- [x] T-003 `FUNCTIONAL_SPEC.md` 사용자 검토
- [x] T-004 `TODO.md` 사용자 승인

## Phase 2. 공통 계약 / 브리지
- [x] T-010 `contracts.ts`에 시급 일괄 업데이트 / 패턴 산출 타입 정의
- [x] T-011 `main.ts`에 신규 IPC 핸들러 연결
- [x] T-012 `preload/index.ts`에 브리지 노출 추가

## Phase 3. 시급 업데이트 일괄 적용
- [x] T-020 Excel 컬럼 문자 파서 유틸 구현
- [x] T-021 시급 일괄 업데이트 service 구현
- [x] T-022 시급 일괄 업데이트 미리보기 결과 모델 구현
- [x] T-023 적용 트랜잭션 및 이력 사유 저장 구현
- [x] T-024 인력 관리 모달 UI 구현
- [x] T-025 가이드 보기 모달 구현
- [x] T-026 미리보기 테이블 / 요약 카드 UI 구현
- [x] T-027 관련 단위 테스트 작성

## Phase 4. 패턴 산출 및 적용
- [x] T-030 표준 템플릿 Excel 파서 구현
- [x] T-031 패턴 탐지 알고리즘 구현
- [x] T-032 그룹 분류 및 `group + offset -> team` 변환 구현
- [x] T-033 Site draft 자동 주입 모델 구현
- [x] T-034 근무지 관리 분석 모달 UI 구현
- [x] T-035 패턴 산출 가이드 모달 구현
- [x] T-036 분석 결과 preview UI 구현
- [x] T-037 `근무지 등록(1단계 이동)` 연결
- [x] T-038 관련 단위 테스트 작성

## Phase 5. 공통 UI / 스타일
- [x] T-040 재사용 가이드 모달 컴포넌트 구현
- [x] T-041 설명용 Excel 도식 컴포넌트 구현
- [x] T-042 신규 스타일 정리 및 모바일/축소 폭 대응 확인

## Phase 6. 검증
- [x] T-050 `npm run typecheck`
- [x] T-051 `npm run test`
- [x] T-052 `node scripts/validate-structure.mjs`
- [ ] T-053 기능별 수동 QA
- [ ] T-054 필요 시 Playwright 교차 검증

## Phase 7. 문서 마감
- [x] T-060 `QA_CHECKLIST.md` 실제 결과 반영
- [x] T-061 `RESULT_REPORT.md` 작성
- [x] T-062 `docs/functional-spec.md` 반영
- [x] T-063 `docs/patch-notes.md` 반영
- [x] T-064 `artifacts/releases/v0.2.0/RESULT_REPORT.md` 작성 및 릴리즈 결과 정리

## Phase 8. 배포 마감
- [x] T-070 버전 `0.2.0` 업데이트
- [x] T-071 재패키징
- [x] T-072 최종 점검
- [x] T-073 커밋
- [ ] T-074 Git push

## 메모
- 구현 범위와 자동 검증은 완료됐다.
- `QA_CHECKLIST.md`, `RESULT_REPORT.md`, `FILE_IMPACT.md`는 실제 구현 결과 기준으로 갱신했다.
- 수동 QA, 릴리즈 문서 반영, 버전 업데이트/패키징/커밋/푸시는 사용자 최종 확인 후 진행한다.
