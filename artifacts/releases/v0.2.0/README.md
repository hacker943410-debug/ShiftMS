# V0.2.0 작업 폴더

## 목적
- 이 폴더는 `교대근무관리시스템 V0.2.0 Patch` 작업의 단일 작업 기준 경로다.
- 분석, 파일 영향 범위, 기능명세, TODO, QA, 결과 보고를 한 위치에서 관리한다.

## 현재 상태
- 단계: 구현 전 분석 완료 대기
- 기준 브랜치: `feature/v0.1.1-patch-finalize`
- 외부 참조 문서:
  - `C:\Projects\Tools\패턴추출기\패턴추출기.md`

## 이번 패치 범위
1. 인력 관리 메뉴 `시급 업데이트 일괄 적용` 기능 추가
2. 근무지 관리 메뉴 `패턴 산출 및 적용` 기능 추가
3. 두 기능 모두 `가이드 보기` 기반의 설명 모달 제공

## 문서 구성
- [COMPACT_CONTEXT.md](./COMPACT_CONTEXT.md)
  - 구현 시작 전 방향성 고정용 압축 컨텍스트
- [IMPLEMENTATION_ANALYSIS.md](./IMPLEMENTATION_ANALYSIS.md)
  - 현재 구조 분석, 구현 방향, 제약사항
- [FILE_IMPACT.md](./FILE_IMPACT.md)
  - 수정 / 생성 예정 파일 목록과 변경 이유
- [FUNCTIONAL_SPEC.md](./FUNCTIONAL_SPEC.md)
  - V0.2.0 기능명세
- [TODO.md](./TODO.md)
  - 구현 순서와 의존성 정리
- [QA_CHECKLIST.md](./QA_CHECKLIST.md)
  - 구현 후 수동 QA 및 회귀 점검 항목
- [RESULT_REPORT.md](./RESULT_REPORT.md)
  - 구현 완료 후 작성할 결과 보고서

## 작업 규칙
- 공통 흐름은 [docs/patch-workflow.md](../../../docs/patch-workflow.md)를 따른다.
- 구현 시작 전 [COMPACT_CONTEXT.md](./COMPACT_CONTEXT.md)를 먼저 확인한다.
- 사용자 검토 전까지는 구현 코드를 수정하지 않는다.
- 구현 중 생성되는 캡처와 검증 로그는 `screenshots/`, `logs/` 아래에 저장한다.
