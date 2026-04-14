# v0.3.2 TODO

## 0. 착수 준비
- [ ] `v0.3.2` 작업 브랜치/전용 커밋 단위 결정
- [ ] 양식 관리 개편 범위를 사용자 승인 기준으로 고정
- [ ] 기존 양식 샘플 4종(근무표1/근무표2/품의서/별첨1/별첨2) 회귀 기준 파일 확정
- [ ] 구현 중 사용할 스크린샷/샘플 데이터 저장 경로를 `artifacts/releases/v0.3.2/` 아래로 고정

## 1. 모델/용어 재정의
- [x] `generic` 프로필을 `proposal`, `attachment1`, `attachment2` 로 분리
- [x] `DocumentTemplateProfile` 에 `editorSchemaVersion`, `semanticZones`, `styleSpec`, `advancedBindings` 초안 추가
- [x] `DocumentTemplateValidationSnapshot` 에 `detectedZones`, `inspectionWarnings`, `suggestedLabels` 추가
- [x] 사용자 노출 용어 사전 정의
- [x] `주차 블록`, `표 시작 행`, `변경 사유 열` 같은 내부 용어를 UI copy에서 1차 제거

## 2. main 시맨틱 분석 레이어
- [x] workbook -> canvas snapshot 변환 서비스 초안 작성
- [x] 근무표용 semantic zone 감지 로직 구현
- [x] 품의서용 semantic zone 감지 로직 구현
- [x] 별첨1/별첨2용 semantic zone 감지 로직 구현
- [x] 감지 실패 시 fallback zone 구성 규칙 정의
- [x] validation 결과에 semantic zone 메타데이터 포함

## 3. renderer 도식형 미리보기
- [x] `TemplateCanvasEditor` 기본 컴포넌트 생성
- [x] 축소된 문서 캔버스 렌더링
- [x] 영역 hover / selected 상태 표시
- [x] 확대/축소 컨트롤 추가
- [x] 샘플 데이터 on/off 토글 추가
- [x] 기존 `최근 미리보기 outputPath` UI를 diagram preview 중심으로 전환

## 4. 속성 패널/편집 UX
- [x] `TemplateSemanticPropertiesPanel` 생성
- [x] 기본 모드 속성: 위치/폭/높이/폰트/배경색/정렬
- [x] 색상 선택 UI 정의
- [x] 숫자 입력 UI 정의
- [x] 리셋/undo 동작 정의
- [x] 선택 영역 설명/영향도 문구 추가

## 5. 고급 모드
- [x] 셀 그리드 오버레이 추가
- [x] 셀 범위 선택 도구 추가
- [x] 열 너비/행 높이 직접 편집 UI 추가
- [x] 병합 범위 편집 UI 추가
- [x] 고급 모드 진입 경고/설명 추가

## 6. 저장/출력 반영
- [x] `style spec -> workbook` 컴파일러 구현
- [x] 근무표 출력 반영 경로 연결
- [x] 품의서/별첨1/별첨2 출력 반영 경로 연결
- [ ] 저장된 profile/validation JSON migration 처리
- [ ] 승인/기본 사용 전환 흐름이 새 구조와 충돌 없는지 확인

## 7. 문서/가이드/운영 UX
- [x] 운영 관리 가이드의 양식 관리 시뮬레이션을 새 편집기로 갱신
- [x] 운영 참고서 양식 관리 절차 업데이트
- [x] 운영자 빠른 시작 문서에 새 편집 흐름 추가
- [ ] 용어집 또는 화면 내 도움말 추가 여부 결정

## 8. 테스트
- [x] profile migration 테스트
- [x] semantic zone 감지 테스트
- [x] canvas snapshot 생성 테스트
- [x] style spec 반영 workbook 테스트
- [x] renderer selection/property 테스트
- [x] smoke: 양식 import -> 도식 preview -> 저장 -> 검증 출력

## 9. 수동 QA 준비
- [ ] 근무표 양식 1 수동 확인 절차 작성
- [ ] 근무표 양식 2 수동 확인 절차 작성
- [ ] 품의서 수동 확인 절차 작성
- [ ] 별첨1 수동 확인 절차 작성
- [ ] 별첨2 수동 확인 절차 작성
- [ ] 인쇄 가독성 확인 항목 추가

## 9.5 후속 UI/가이드 보강
- [x] 대시보드 `기간 직접 지정`의 `시작 월`, `종료 월` 네이티브 month input 제거
- [x] 앱 공통 DateField 팝오버 톤과 맞는 월 선택 전용 `MonthField` 추가
- [x] 운영 관리 가이드에 `사이트 명 관리` 페이지 추가
- [x] 운영 관리 가이드 씬에 `site-name` variant 추가
- [x] v0.3.2 패치노트, 릴리즈 아카이브 인덱스, 작업 로그 갱신
- [ ] 대시보드 월 선택 팝오버 수동 화면 확인
- [ ] 운영 관리 `사이트 명 관리` 가이드 수동 화면 확인

## 10. 구현 순서 권장
- [x] Patch Set A: 용어/프로필/검증 모델 재정의
- [x] Patch Set B: 도식형 preview 엔진
- [x] Patch Set C: 직접 편집 + 속성 패널 (병합/행/열 직접 조절 포함)
- [ ] Patch Set D: style spec 출력 반영 + 문서/QA 마감 (출력 반영과 가이드/운영 문서 갱신 완료, 저장 구조 마감 남음)

## 11. 착수 직전 확인
- [ ] 새 의존성 도입 없이 가능한 범위 재검토
- [ ] Electron main/preload 경계 설계 확정
- [ ] 첫 구현 단위는 `근무표 양식` 부터 시작할지, `품의서/별첨` 부터 시작할지 결정
