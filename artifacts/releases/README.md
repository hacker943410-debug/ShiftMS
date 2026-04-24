# 릴리즈 아카이브 안내

## 목적
- 이 경로는 버전별 패치/릴리즈 문서를 표준 구조로 보관하는 아카이브다.
- `docs/`는 현재 운영 기준 문서만 유지하고, 버전 이력과 작업 기록은 이 경로에서 관리한다.

## 표준 구조
- 기준 문서: `docs/patch-workflow.md`
- 표준 폴더:
  - `README.md`
  - `COMPACT_CONTEXT.md`
  - `IMPLEMENTATION_ANALYSIS.md`
  - `FILE_IMPACT.md`
  - `FUNCTIONAL_SPEC.md`
  - `RELEASE_MANIFEST.json`
  - `TODO.md`
  - `QA_CHECKLIST.md`
  - `RESULT_REPORT.md`
  - `logs/`
  - `screenshots/`

## 버전 현황
| 버전 | 기준일 | 상태 | 비고 |
|---|---|---|---|
| `v0.4.7` | `2026-04-24` | GitHub Release 게시 완료 / 신규 설치본 자동업데이트 저장소 전환 완료 | 새 GitHub 저장소 `ShiftMS` 기준 배포 설치본 |
| `v0.1.0` | `2026-03-27` | 표준 구조 backfill 완료 | 초기 설치형 릴리즈 기준선 |
| `v0.2.0` | `2026-03-30` | 표준 구조 유지 | 인력/근무지 관리 기능 확장 |
| `v0.2.1` | `2026-03-31` | 표준 구조 backfill 완료 | 운영 UI/DatePicker 보강 |
| `v0.2.2` | `2026-03-31` | 표준 구조 backfill 완료 | 공통 셸/활동 이력/PDF 보강 |
| `v0.2.3` | `2026-04-02` | 표준 구조 backfill 완료 | 별첨1 PDF/활동 이력 보강 |
| `v0.3.0` | `2026-04-06` | 표준 구조 backfill 완료 | 실적-수당-품의 승인 흐름 재구성 |
| `v0.3.1` | `2026-04-09` | 표준 구조 생성 완료 | 업무 흐름 하드닝, 가이드/양식 정리 |
| `v0.3.2` | `2026-04-14` | 패키징 검증 완료 | 양식 관리 도식형 편집, 대시보드 월 선택 UI/운영 관리 사이트 명 가이드 보강 |
| `v0.4.0` | `2026-04-18` | installer 포함 자동 sign-off 완료 / 수동 QA 대기 | 리팩토링, 인증/권한/세션 하드닝, packaged / installer / role smoke, 릴리즈 sign-off 실행 |
| `v0.4.1` | `2026-04-20` | installer 포함 자동 sign-off 완료 / 수동 QA 대기 | 인증 bootstrap / 비밀번호 정책 정리, 설치본 재패키징 |
| `v0.4.2` | `2026-04-21` | NSIS 패키징 완료 / 수동 QA·smoke 대기 | 근무지 cycle 원문 패턴 문자열 저장 hotfix, `0.4.2` 설치본 생성 |
| `v0.4.3` | `2026-04-21` | NSIS 패키징 완료 / 직접 설치 테스트 대기 | 조별 Index UI 겹침 정리, Access 실적 복원 보정, `0.4.3` 설치본 생성 |
| `v0.4.4` | `2026-04-23` | NSIS 패키징 완료 / 직접 설치 테스트 대기 | Access 복원/양식 fallback/품의서 사이트명 표기 보강, GitHub Releases 자동업데이트 기반 정리 |
| `v0.4.5` | `2026-04-23` | GitHub Release 게시 완료 / 사용자 업데이트 테스트 대기 | GitHub Releases 자동업데이트, BP 인력/근무조 순서, 선택형 목록박스 저장값 보정 |
| `v0.4.6` | `2026-04-24` | GitHub Release 게시 완료 / 설치 후 수동 확인 대기 | 다중 버전 패치노트 강제 확인, 패치이력 메뉴, 정규화 검색, 표형 패치노트 포맷, 기존 설치 업데이트 시 데이터 보존 |

## 운영 원칙
- 최신 누적 변경사항은 `docs/patch-notes.md`에 남긴다.
- 현재 메뉴별 사용자 설명서는 `docs/user-manual.md`를 기준으로 본다.
- 현재 개발 언어, 로컬 백엔드 구성, 저장소, 구현 원리는 `docs/technical-overview.md`를 기준으로 본다.
- 버전별 상세 분석, QA, 결과 보고는 각 버전 폴더에서 확인한다.
- 구현 계획/작업 로그 성격 문서는 `docs/`가 아니라 해당 버전 폴더 또는 `artifacts/` 아래에 둔다.
- 사용자가 별도 제한 없이 설치본 패키징을 요청하면 로컬 산출물 생성에 더해 GitHub Release Published 상태까지 완료해야 한다.
- `RELEASE_MANIFEST.json`은 자동업데이트와 앱 내부 패치노트의 기준 파일이므로 모든 신규 버전 폴더에 포함한다.
