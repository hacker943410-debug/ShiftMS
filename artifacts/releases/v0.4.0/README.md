# v0.4.0 작업 폴더

## 목적
- 이 폴더는 v0.4.0 양식 관리 개편부터 인증/권한 하드닝, 패키징, QA, sign-off 준비까지 묶인 릴리즈 문서를 한 위치에서 관리한다.

## 현재 상태
- 기준일: 2026-04-18
- 성격: 양식 관리 도식형 편집 전환 + 인증/권한/세션 하드닝 + 설치본/role smoke + 릴리즈 문서 정리
- 상태: 핵심 자동 검증 완료, installer 재검증은 로컬 Windows Application Control 정책으로 차단, 운영 데이터 기준 수동 QA / sign-off 대기
- 최신 자동 회귀 기준: `107 files / 428 tests`

## 문서 구성
- COMPACT_CONTEXT.md: 이번 버전의 목표와 범위를 압축 정리한다.
- IMPLEMENTATION_ANALYSIS.md: 현재 구조, 제약, 기술 선택 근거를 정리한다.
- FILE_IMPACT.md: 수정/생성 예상 파일을 경로 단위로 정리한다.
- FUNCTIONAL_SPEC.md: 사용자 흐름과 화면/입출력 요구사항을 정리한다.
- TODO.md: 남은 release blocker와 후속 개선 항목을 정리한다.
- QA_CHECKLIST.md: 구현 후 확인할 자동/수동 검증 기준이다.
- RESULT_REPORT.md: 구현 완료 후 결과와 잔여 이슈를 기록한다.
- SIGN_OFF_TEMPLATE.md: 실제 운영 데이터 기준 수동 QA 결과와 최종 승인 여부를 기록한다.
- logs/release-signoff-*.md: 릴리즈 PC에서 `npm run release:signoff` 실행 결과를 남긴다.
- SCENARIO_TEST_PLAN.md: 빈 DB 기준 실제 운영 시나리오 테스트 3개와 초기화 상태를 기록한다.

## 이번 버전 요약
- 양식 관리를 `셀 좌표 보정` 중심에서 `문서 영역 조정` 중심으로 바꿨다.
- 근무표, 품의서, 별첨1, 별첨2를 도식형 프리뷰와 의미 단위 편집으로 통일했다.
- 셀 너비, 높이, 폰트, 배경색, 정렬, 병합을 `style spec`으로 관리 가능한 기반을 만들었다.
- 대시보드 `기간 직접 지정` 월 선택 UI를 앱 공통 팝오버 톤으로 통일했다.
- 운영 관리 가이드에 `사이트 명 관리` 흐름을 추가했다.
- 인증은 `password_hash`, 첫 로그인 비밀번호 변경, bootstrap retire, 로그인 잠금, `8시간 runtime-only` 세션 정책 기준으로 재정리됐다.
- 권한은 `admin / planner / reviewer / operator` 4단계로 분리됐고, route/action-level 가드를 shared authorization source로 통합했다.
- `ShiftMgmt-Setup-0.4.0-x64.exe` 설치본을 생성하고 packaged / operations-user smoke를 재검증했다.
- installer smoke는 실행을 시도했지만, 로컬 Windows Application Control 정책 때문에 silent installer 단계가 차단됐다.
- 남은 release blocker는 installer 재검증, 실제 운영 데이터 기준 수동 QA, sign-off 기록이다.

