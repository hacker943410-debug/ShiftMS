# V0.2.0 영향 파일 정리

## 1. 이번 단계에서 생성한 작업 문서
| 경로 | 구분 | 용도 |
|---|---|---|
| `docs/patch-workflow.md` | 신규 | 패치 / 릴리즈 공통 진행 규칙 |
| `artifacts/releases/v0.2.0/README.md` | 신규 | V0.2.0 작업 인덱스 |
| `artifacts/releases/v0.2.0/COMPACT_CONTEXT.md` | 신규 | 작업 목표, 결정사항, 비목표를 압축한 컨텍스트 문서 |
| `artifacts/releases/v0.2.0/IMPLEMENTATION_ANALYSIS.md` | 신규 | 구현 분석 문서 |
| `artifacts/releases/v0.2.0/FILE_IMPACT.md` | 신규 | 영향 파일 정리 |
| `artifacts/releases/v0.2.0/FUNCTIONAL_SPEC.md` | 신규 | 기능명세 |
| `artifacts/releases/v0.2.0/TODO.md` | 신규 | 구현 TODO |
| `artifacts/releases/v0.2.0/QA_CHECKLIST.md` | 신규 | QA 체크리스트 |
| `artifacts/releases/v0.2.0/RESULT_REPORT.md` | 신규 | 결과 보고서 |

## 2. V0.2.0 구현에서 실제 수정 / 생성한 파일

### 2.1 공통 계약 / 브리지
| 경로 | 변경 유형 | 이유 |
|---|---|---|
| `src/shared/bridge/contracts.ts` | 수정 | 파일 선택, 시급 일괄 업데이트 미리보기/적용, 패턴 산출 미리보기용 타입과 브리지 계약 추가 |
| `src/preload/index.ts` | 수정 | 새 IPC 메서드를 renderer에 안전하게 노출 |
| `src/main/main.ts` | 수정 | 새 IPC 핸들러 등록, 파일 선택 다이얼로그 연결 |

추가 메모:
- `src/renderer/vite-env.d.ts`는 기존 `Window.appBridge` 타입 참조 구조가 유지되어 별도 수정하지 않았다.

### 2.2 시급 일괄 업데이트
| 경로 | 변경 유형 | 이유 |
|---|---|---|
| `src/renderer/screens/WorkforceManagementScreen.tsx` | 수정 | 버튼, 모달, 가이드, 미리보기, 적용 흐름 추가 |
| `src/main/services/workforce-wage-bulk-update-service.ts` | 신규 | Excel 파싱, 컬럼 매핑, 미리보기, 일괄 적용 트랜잭션 처리 |
| `src/main/services/workforce-wage-bulk-update-service.test.ts` | 신규 | 배치 미리보기 / 저장 규칙 검증 |
| `src/shared/lib/excel-column.ts` | 신규 | `B`, `C`, `AA` 같은 Excel 컬럼 입력을 index로 변환 |
| `src/shared/lib/excel-column.test.ts` | 신규 | 컬럼 매핑 파싱 검증 |

추가 메모:
- `src/main/services/employee-history-service.ts`는 기존 로직을 그대로 재사용했고 직접 수정하지 않았다.

### 2.3 패턴 산출 및 적용
| 경로 | 변경 유형 | 이유 |
|---|---|---|
| `src/renderer/screens/SiteManagementScreen.tsx` | 수정 | 패턴 산출 모달, 가이드, 분석 결과 preview, draft 자동 주입 흐름 추가 |
| `src/main/services/site-pattern-extraction-service.ts` | 신규 | 엑셀 파싱, 패턴 탐지, 그룹 분류, site draft 변환 |
| `src/main/services/site-pattern-extraction-service.test.ts` | 신규 | 표준 템플릿 파싱, 그룹/offset 변환, team capacity 변환 검증 |
| `src/shared/domain/site-pattern-detection.ts` | 신규 | 반복 패턴 탐지, rotation offset 계산, 그룹 분류 로직 구현 |
| `src/shared/domain/site-pattern-detection.test.ts` | 신규 | 패턴 탐지 / 그룹 분류 순수 로직 검증 |

### 2.4 공유 UI / 유틸
| 경로 | 변경 유형 | 이유 |
|---|---|---|
| `src/renderer/components/GuideModal.tsx` | 신규 | 두 기능에서 재사용할 설명 모달 shell |
| `src/renderer/components/SpreadsheetGuideFigure.tsx` | 신규 | Excel 구조를 그림처럼 보여줄 재사용 안내 도식 |
| `src/renderer/styles.css` | 수정 | 신규 모달, 미리보기 표, 가이드 도식 스타일 추가 |

## 3. 구현 완료 후 후속 문서 수정 예정 파일
| 경로 | 변경 유형 | 이유 |
|---|---|---|
| `docs/functional-spec.md` | 수정 | V0.2.0 기능 범위 반영 |
| `docs/patch-notes.md` | 수정 | V0.2.0 패치노트 기록 |
| `artifacts/releases/v0.2.0/RESULT_REPORT.md` | 유지 | V0.2.0 릴리즈 결과 및 sign-off 기준 문서 |
| `package.json` | 수정 | 버전 `0.2.0` 반영 |

## 4. 로그 / 산출물 저장 경로
| 경로 | 용도 |
|---|---|
| `artifacts/releases/v0.2.0/logs/` | 검증 로그, smoke 결과, 요약 메모 |
| `artifacts/releases/v0.2.0/screenshots/` | 가이드 화면, 미리보기 화면, QA 캡처 |

## 5. DB / 마이그레이션 영향
- V0.2.0 P0 범위에서는 새 SQLite 테이블 추가가 필요하지 않다.
- 기존 `wage_rates`, `shift_patterns`, `shift_pattern_cycles`, `shift_pattern_team_indexes`, `shift_pattern_team_capacities` 구조를 재사용한다.
- 따라서 별도 DB 마이그레이션 스크립트는 우선 계획하지 않는다.
