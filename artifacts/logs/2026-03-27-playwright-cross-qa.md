# 2026-03-27 Playwright Cross QA

## 범위
- 기준 문서
  - `docs/functional-spec.md`
  - `docs/operations-manual-qa-checklist.md`
- 사용자 요청에 따라 `경로 설정 / DB업데이트` 확인은 제외했다.
- 실행 환경
  - 로컬 Electron 실행본
  - Playwright Electron automation
  - 기준 워킹트리에서 `npm run build` 완료 후 실행

## 실행 결과
| 구분 | 스크립트 / 명령 | 결과 | 확인 내용 |
|---|---|---|---|
| 빌드 기준선 | `npm run build` | 통과 | 타입체크, renderer build, electron build 통과 |
| 메뉴 연속성 | `node artifacts/scripts/electron-workflow-smoke.cjs` | 통과 | 인력 관리에서 선택한 근무지가 근무표 배포 화면 선택 정보로 이어지는지 확인 |
| 근무지 관리 1단계 | `node artifacts/scripts/verify-site-step1.cjs` | 통과 | 패턴 문자열, 조 수 변경, 월간 달력 시뮬레이션 렌더링 확인 |
| 근무지 관리 2단계 | `node artifacts/scripts/electron-site-management-step2-smoke.cjs` | 통과 | 검색 입력 포커스/입력 가능 여부, 조 이동 후 저장 결과 재조회 시 중복 제거와 배정 반영 확인 |
| 실적 관리 기본 흐름 | `node artifacts/scripts/electron-performance-smoke.cjs` | 통과 | 실적 현황/승인 이력 기본 렌더링 확인 |
| 승인 즉시 수당 반영 | `node artifacts/scripts/electron-approval-allowance-smoke.cjs` | 통과 | 실적 승인 후 수당 관리에 즉시 반영되는지 확인 |
| 재승인 -> 수당 갱신 | `node artifacts/scripts/electron-reapproval-allowance-smoke.cjs` | 통과 | 재승인 후 최신 시급/수당 금액으로 수당 이력이 갱신되는지 확인 |
| 수당 문서 출력 | `node artifacts/scripts/electron-allowance-document-smoke.cjs` | 통과 | Excel 출력 후 품의서/별첨1/별첨2 파일 생성 및 수당 이력 문서 출력 상태 반영 확인 |
| 운영 관리 기준정보 | `node artifacts/scripts/electron-operations-config-smoke.cjs` | 통과 | 공휴일 관리, 요율 관리, 양식 관리 기본 흐름 확인 |
| 운영 관리 사용자 | `node artifacts/scripts/electron-operations-user-smoke.cjs` | 통과 | 사용자 생성, 수정, 삭제 흐름 확인 |

## 핵심 관찰
- `실적 승인 -> 수당 이력 생성` 흐름은 Playwright에서 정상 통과했다.
- `재승인 -> 수당 이력 갱신` 흐름도 정상 통과했다.
  - 확인값: `마루` 행 `총 수당`이 `₩56,400 -> ₩80,000`으로 변경됐다.
- `수당 문서 출력`은 최신 승인 결과 기준으로 `품의서_2026-03.xlsx`, `별첨1_2026-03.xlsx`, `별첨2_2026-03.xlsx` 생성까지 확인했다.
- `근무지 관리 2단계`는 Electron + Playwright 조합에서 HTML5 드래그 제스처 자체가 안정적으로 재현되지 않아, 검색 입력 포커스는 UI 상호작용으로 확인하고 조 이동 결과는 Playwright에서 브리지 호출 후 화면 재조회로 교차 검증했다.

## 릴리즈 판단 메모
- 이번 Playwright 교차 검증 범위에서는 차단 이슈를 발견하지 못했다.
- 사용자 요청에 따라 `경로 설정 / DB업데이트`는 제외했으므로, 최종 릴리즈 판단 문서에는 이 제외 범위를 함께 명시하는 것이 안전하다.
- 현재 기준으로 다음 단계는 패키징과 릴리즈 문서 마감 진행 가능 상태다.
