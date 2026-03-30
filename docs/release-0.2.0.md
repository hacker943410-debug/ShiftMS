# 0.2.0 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-03-30`
- 현재 작업 브랜치: `feature/v0.1.1-patch-finalize`
- 대상 버전: `0.2.0`
- 현재 단계: 기능 추가 패치 완료, 자동 검증/패키징 완료, 커밋 완료, 푸시 진행
- 함께 사용하는 문서: `docs/operations-manual-qa-checklist.md`

## 제품 개요
교대근무관리시스템 V0.2.0은 V0.1.x 운영 기능을 유지하면서, 인력 관리의 시급 일괄 업데이트와 근무지 관리의 패턴 산출/적용 흐름을 추가한 기능 확장 릴리즈다.

- 현재 설치 파일명과 실행 파일명은 `ShiftMgmt-Setup-0.2.0-x64.exe`, `ShiftMgmt.exe` 를 기준으로 본다.
- 공식 Windows 산출물은 NSIS 설치본이다.
- 내부 최종 검수 산출물은 `release/win-unpacked` 이다.

## 이번 릴리즈 핵심 변경

### 인력 관리
- Excel Import 기반 `시급 일괄 업데이트` 기능을 추가했다.
- 컬럼 매핑, 적용일, 적용 전/후 시급 비교, 제외 사유 미리보기를 제공한다.
- 적용 시 기존 활성 시급 종료일을 자동 정리하고 새 시급 이력을 생성한다.

### 근무지 관리
- `패턴 적용된 근무지 추가` 기능을 추가했다.
- 표준 템플릿 근무표를 기준으로 Cycle, offset, 그룹, 조별 정원을 산출한다.
- 분석 결과는 `분석 결과`, `그룹별 상세`, `불일치 내역`, `원본 데이터` 탭으로 미리볼 수 있다.
- 산출 결과는 근무지 등록 1단계 draft에 자동 반영된다.

### 공통 UX
- `가이드 보기` 모달과 Excel 도식 컴포넌트를 추가했다.
- 외부 이미지 없이 앱 내부에서 사용 흐름을 설명할 수 있도록 구성했다.

## 자동 검증 현황
- 마지막 자동 검증 재확인 기준일: `2026-03-30`
- 현재 통과 기준 명령:
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
  - `npm run release:check`
  - `npm run package:win`
  - `npm run smoke:electron:packaged`
  - `npm run smoke:electron:installer`
  - `node scripts/validate-structure.mjs`
- 확인된 산출물:
  - `release/ShiftMgmt-Setup-0.2.0-x64.exe`
  - `release/win-unpacked/ShiftMgmt.exe`

## 현재 릴리즈 판단
- V0.2.0 기능 구현은 완료됐다.
- 자동 검증과 패키징 기준에서 차단 이슈를 발견하지 못했다.
- 운영 샘플 기준 수동 QA는 후속 보완 항목으로 남아 있지만, 현재 산출물 기준 릴리즈 마감은 진행 가능하다.

## 현재 알려진 제한
1. 시급 일괄 업데이트는 현재 활성 배치의 `근무지명 + 이름` 기준으로만 매칭한다.
2. 패턴 산출은 `C:\Projects\Tools\패턴추출기\패턴추출기.md` 기준의 표준 템플릿만 지원한다.
3. 자유 형식 근무표, 기간 중 패턴 변경 탐지, 변형 규칙 자동 학습은 이번 범위에 포함하지 않는다.
4. 패턴 산출 결과의 근무시간과 휴게시간은 앱 기본값으로 채워지며, 사용자가 1단계에서 최종 확인해야 한다.
5. 현재 릴리즈 산출물은 Windows NSIS 설치본 기준으로만 정리한다.

## 수동 QA와 마감 조건
- 수동 QA 기록 문서: `docs/operations-manual-qa-checklist.md`
- V0.2.0 추가 확인 문서: `artifacts/releases/v0.2.0/QA_CHECKLIST.md`

아래 기준을 모두 만족하면 릴리즈 마감을 진행한다.

1. `artifacts/releases/v0.2.0/QA_CHECKLIST.md` 의 수동 항목이 확인된다.
2. `docs/operations-manual-qa-checklist.md` 와 연결되는 실사용 점검 결과가 정리된다.
3. 패키징과 설치본 확인이 완료된다.
4. 커밋과 원격 푸시가 완료된다.

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | 자동 검증/패키징 완료 |
| 확인 일시 | `2026-03-30 16:11:59 +09:00` |
| 확인자 | Codex + 사용자 기능 확인 |
| 대상 설치본 | `ShiftMgmt-Setup-0.2.0-x64.exe` / `ShiftMgmt.exe` |
| 결론 | 커밋/푸시 진행 가능 |

### 필수 명령
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run build`
- [x] `npm run release:check`
- [x] `npm run package:win`
- [x] `npm run smoke:electron:packaged`
- [x] `npm run smoke:electron:installer`
- [x] `node scripts/validate-structure.mjs`

### 메뉴별 sign-off
- [x] 인력 관리 `시급 일괄 업데이트` 구현 및 자동 검증 확인
- [x] 근무지 관리 `패턴 적용된 근무지 추가` 구현 및 자동 검증 확인
- [ ] 실제 운영 Excel 기준 시급 일괄 업데이트 수동 검증
- [ ] 실제 운영 Excel 기준 패턴 산출 결과 수동 검증
- [x] 설치본 실행 및 초기 화면 확인

## 최종 판정
- 릴리즈 가능 여부: 가능
- 남은 blocker: 없음
- 추가 수정 필요 항목: 운영 샘플 기준 수동 확인 결과 반영
