# 문서 안내

## 현재 기준
- 문서 정리일: `2026-04-23`
- 현재 작업 브랜치: `release/0.4.4`
- 대상 버전: `0.4.4`
- 현재 단계: `0.4.4` NSIS 설치본 생성 완료, 직접 설치 테스트 / 추가 smoke / 최종 sign-off 대기
- 자동 검증 마지막 재확인: `2026-04-23`
- 최근 반영 변경: `2026-04-23` Access 복원 진단/양식 fallback/품의서 사이트명 표기 보강, `0.4.4` 설치본 패키징

## 현재 유지 문서
현재 `docs/`는 운영과 현재 기준 이해에 필요한 문서만 남긴다.

1. `release-0.4.4.md`
2. `operations-manual-qa-checklist.md`
3. `operator-quick-start.md`
4. `user-manual.md`
5. `project-handbook.md`
6. `technical-overview.md`
7. `maintainer-guide.md`
8. `operations-reference.md`
9. `functional-spec.md`
10. `patch-notes.md`
11. `patch-workflow.md`
12. `README.md`

## 릴리즈 / 작업 아카이브
- 버전별 패치/릴리즈 문서는 `artifacts/releases/README.md`와 각 `artifacts/releases/vX.Y.Z/` 폴더에서 관리한다.
- 이전 릴리즈 문서, 구현 계획서, 작업 로그 성격 문서는 `docs/`에서 제거하고 아카이브 구조로 정리한다.
- 따라서 `docs/`는 “현재 운영 기준”, `artifacts/releases/`는 “버전별 이력/결과”로 역할을 분리한다.
- 최신 `docs/release-X.Y.Z.md`는 1개만 유지하고, 이전 버전 릴리즈 상세는 각 버전 폴더의 `RESULT_REPORT.md`를 기준으로 본다.

## 문서 용도
- `release-0.4.4.md`: 현재 릴리즈 상태, 패키징 범위, 직접 설치 테스트 기준
- `operations-manual-qa-checklist.md`: 실데이터 수동 QA 실행 기록
- `operator-quick-start.md`: 운영자 일상 사용 흐름
- `user-manual.md`: 현재 개발된 메뉴별 주요 기능 사용자 설명서
- `project-handbook.md`: 제품 방향, 개발 규칙, UI 기준, 현재 실행 계획
- `technical-overview.md`: 개발 언어, 로컬 백엔드 구성, 저장소, 파일 연동, 구현 원리
- `maintainer-guide.md`: 코드 진입점, IPC 추가 절차, 복원/백업/패키징, 장애 진단을 정리한 유지보수 기준 문서
- `operations-reference.md`: `DB업데이트`, 수당 계산, 양식 관리 기준
- `functional-spec.md`: 메뉴별 기능 범위와 핵심 데이터 흐름
- `patch-notes.md`: 버전별 누적 변경사항과 검증 결과
- `patch-workflow.md`: 패치 / 릴리즈 작업 공통 흐름과 버전 폴더 규칙
- `artifacts/releases/README.md`: 버전별 릴리즈 아카이브 인덱스
- `README.md`: 문서 진입점

## 릴리즈 준비 문서 읽는 순서
1. `patch-notes.md`
2. `artifacts/releases/README.md`
3. `artifacts/releases/v0.4.4/README.md`
4. `release-0.4.4.md`
5. `operations-manual-qa-checklist.md`
6. `operator-quick-start.md`
7. `user-manual.md`
8. `functional-spec.md`
9. `technical-overview.md`
10. `maintainer-guide.md`
11. `patch-workflow.md`
12. `project-handbook.md`
13. `operations-reference.md`




