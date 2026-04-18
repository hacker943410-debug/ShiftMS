# Refactoring Backlog

## 목적
- 분석 결과를 실제 실행 가능한 리팩토링 작업으로 전환한다.

## 분류 기준
- `Critical`: 보안, 데이터 손상, 승인/계산 재현성에 직접 영향
- `Major`: 구조 복잡도와 유지보수 비용이 큰 항목
- `Minor`: 일관성, 가독성, 문서화 중심 항목

## 초기 후보
1. `main.ts` IPC 등록 분리
2. 인증 구조 재설계 또는 최소한의 영속/검증 강화
3. 파일 경로/복원/백업 검증 공통화
4. 승인/수당/품의 흐름의 공통 검증 포인트 정리
5. 유지보수 문서와 코드 경계 규칙 동기화

## 다음 기록 예정
- 항목별 근거 파일
- 변경 위험도
- 선행 테스트 필요 여부
- 예상 난이도와 배치 순서

## Priority Queue

### Critical
1. `main` 권한 검증 계층 도입
   - 목표: UI 숨김이 아니라 main handler 수준에서 세션/role 강제
   - 대상: `src/main/main.ts`
   - 선행: 인증/권한 정책 문서화

2. 인증 구조 개선
   - 목표: 세션 저장 정책을 정리하고 운영 사용자 저장소와 정합성 유지
   - 대상: `src/main/services/auth-service.ts`, `operations-storage-service.ts`
   - 선행: 세션 만료 기준 검토

3. IPC access matrix 기준으로 공개/인증/관리자 호출을 재분류
   - 목표: 모든 IPC에 대해 권한 기본값을 정하고 예외만 허용
   - 대상: [IPC_ACCESS_MATRIX.md](C:/Projects/Active/ShiftMgmt_V3.4/artifacts/reviews/project-audit-2026-04/IPC_ACCESS_MATRIX.md), `src/main/main.ts`
   - 선행: 세션 정책과 운영자/관리자 역할 정의 확정

### Major
4. `main.ts` IPC registrar 분리
   - 목표: 도메인별 등록 파일로 분리하고 공통 wrapper 적용
   - 대상: `app`, `auth`, `operations`, `performance`, `allowance`, `workforce`
   - 선행: IPC 인벤토리 표 확정

5. 장대 renderer 화면 분리
   - 목표: 화면별 section component와 domain hook로 나누기
   - 1차 대상:
     - `SiteManagementScreen.tsx`
     - `AllowanceManagementScreen.tsx`
     - `DashboardScreen.tsx`
   - 선행: 화면별 회귀 시나리오와 smoke 기준 정리

6. 복원/백업/파일 경로 공통 검증 모듈화
   - 목표: 경로 검증, overwrite 보호, 오류 메시지 패턴을 공통화
   - 대상: `database-migration-service.ts`, `database-backup-service.ts`, 관련 IPC

### Minor
7. 유지보수자 문서 체계화
   - 목표: 진입점, 변경 절차, 장애 대응 문서 완성
   - 대상: `docs/` 반영 전 `MAINTAINER_GUIDE_DRAFT.md` 정제

## Recommended Execution Order
1. 보호 테스트 추가
2. IPC access matrix 확정
3. 권한 검증 계층 도입
4. `main.ts` 분리
5. 복원/백업 공통화
6. renderer 대형 화면 분리
7. 유지보수 문서 확정
