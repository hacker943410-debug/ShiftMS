# 0.3.1 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-09`
- 현재 작업 브랜치: `feature/v0.1.1-patch-finalize`
- 대상 버전: `0.3.1`
- 현재 단계: 패치 구현 완료, 자동 검증 완료, 커밋/푸시 마감
- 함께 사용하는 문서: `docs/operations-manual-qa-checklist.md`

## 제품 개요
교대근무관리시스템 V0.3.1은 `실적 승인 -> 수당 검토/승인 -> 품의 승인 -> 문서 출력/백업` 흐름을 실무 기준으로 다듬고, 운영 가이드와 출력 양식, 대시보드, 로그인 UI까지 함께 정리한 마감 패치다.

- 현재 설치 파일명과 실행 파일명은 `ShiftMgmt-Setup-0.3.1-x64.exe`, `ShiftMgmt.exe` 를 기준으로 본다.
- 공식 Windows 산출물은 NSIS 설치본이다.
- 내부 최종 검수 산출물은 `release/win-unpacked` 이다.

## 이번 릴리즈 핵심 변경

### 업무 흐름 / 감사성
- 실적 재승인 확정 기준과 `승인완료 보관본` 조회 기준을 정리했다.
- 수당 관리 `근무지 반려`는 사유를 필수 입력으로 바꾸고 이력에 함께 남긴다.
- 품의 승인 DB 반영은 트랜잭션으로 묶고, 실패 시 내부 모달 안내를 강화했다.
- 수동/자동 DB 백업은 JSON과 Excel `.xlsx`를 함께 저장한다.

### 운영 관리 / 요율
- 요율 수정 시 `적용 시작일`을 오늘 이전으로 바꿀 수 없게 제한했다.
- 요율 수정 시에만 `변경 사유` 입력을 필수로 남기고, 변경 이력과 활동 이력에 반영한다.
- 신규 요율 추가는 변경 사유 없이 등록되도록 분리했다.

### 문서 출력
- 품의서/별첨1/별첨2의 PDF/Excel 제목 규칙과 회사 로고를 최신 기준으로 통일했다.
- Excel 출력 시 템플릿 내부 임베드 로고도 `brand-logo-clean.png` 기준으로 교체한다.
- 별첨1·별첨2의 빈 병합/테두리 잔재, 배경색 불일치, 소계/합계 표현을 양식 기준으로 정리했다.
- 별첨1 소계는 `소   계` 단일 표기로 정리하고, 전체 합계 행을 추가했다.

### UI / 사용자 안내
- 로그인 화면은 로고 중심 단순 레이아웃으로 정리하고 테스트 계정 바로입력은 유지했다.
- 백업 완료, 품의 문서 출력 완료, 품의 승인 실패 안내를 공통 내부 모달로 통일했다.
- 대시보드는 2x2 배치와 Top 10 랭킹, 근무 유형별 탭, 내보내기 구성을 다시 정리했다.
- 전체 가이드 모달은 `사용 흐름 / 기능 설명` 의미를 분리하고, 번호 기반 하이라이트 박스를 다시 설계했다.
- 가이드 하이라이트가 실데이터를 가리는 문제를 전면 점검하고 주요 씬의 좌표와 z-index를 보정했다.

## 자동 검증 현황
- 마지막 자동 검증 재확인 기준일: `2026-04-09`
- 현재 통과 기준 명령:
  - `npm run typecheck`
  - `npm test -- allowance-document-export-service document-template-preview-service allowance-document-pdf-service`
  - `npm run build:renderer`
  - `npm run build:electron`
  - `npm run smoke:electron:guide-batch5`
  - `npm run smoke:electron:guides`

## 현재 릴리즈 판단
- 코드 기준 이번 패치 범위는 마감 가능 상태다.
- 자동 검증 기준 차단 이슈는 확인하지 못했다.
- 운영 데이터 기준 최종 sign-off는 `docs/operations-manual-qa-checklist.md` 기준 수동 QA 후 진행한다.

## 현재 알려진 제한
1. 품의 승인 중 DB 반영이 실패하면 출력 문서와 백업 파일은 남을 수 있다. 이 경우 DB 상태는 롤백되고, 운영자가 산출물을 확인한 뒤 다시 시도해야 한다.
2. 실제 운영 PC의 권한 정책, 백신 예외, 네트워크 폴더 정책은 별도 현장 검증이 필요하다.
3. Access 기반 `DB업데이트` 는 원본 데이터 상태에 따라 일부 패턴/시급 복원이 제외될 수 있다.

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | 자동 검증 완료, 커밋/푸시 기준선 확정 |
| 확인 일시 | `2026-04-09` |
| 확인자 | Codex |
| 대상 설치본 | `ShiftMgmt-Setup-0.3.1-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 수동 QA 후 최종 sign-off 가능 |

### 필수 명령
- [x] `npm run typecheck`
- [x] `npm test -- allowance-document-export-service document-template-preview-service allowance-document-pdf-service`
- [x] `npm run build:renderer`
- [x] `npm run build:electron`
- [x] `npm run smoke:electron:guide-batch5`
- [x] `npm run smoke:electron:guides`
- [ ] `docs/operations-manual-qa-checklist.md` 실데이터 수동 QA

## 최종 판정
- 릴리즈 가능 여부: 조건부 가능
- 남은 blocker: 실데이터 수동 QA 미완료
- 추가 확인 필요 항목: 운영 PC 권한/경로 정책, 품의 승인 실패 후 운영 재시도 절차
