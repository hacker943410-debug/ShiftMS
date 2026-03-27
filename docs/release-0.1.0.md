# 0.1.0 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-03-27`
- 현재 작업 브랜치: `feat/ui-renewal-20260311`
- 대상 릴리즈 브랜치: `release/0.1.0`
- 대상 버전: `0.1.0`
- 현재 단계: 운영 관리 실데이터 수동 QA 대기
- 함께 사용하는 문서: `docs/operations-manual-qa-checklist.md`

## 제품 개요
교대근무관리시스템 V0.1.0은 교대근무 운영 업무를 하나의 로컬 Electron 앱으로 통합한 첫 릴리즈 후보다. 인력 관리, 근무지 구성, 근무표 배포, 실적 승인, 수당 계산, 문서 출력, 운영 설정을 같은 앱 안에서 연결한다.

- 현재 설치 파일명과 실행 파일명은 `ShiftMgmt-Setup-0.1.0-x64.exe`, `ShiftMgmt.exe` 를 유지한다.
- 공식 Windows 산출물은 NSIS 설치본이다.
- 내부 최종 검수 산출물은 `release/win-unpacked` 이다.

## 릴리즈 마감 순서
1. `docs/operations-manual-qa-checklist.md` 를 기준으로 실데이터 수동 QA를 수행한다.
2. 수동 QA 결과를 이 문서의 `수동 QA 결과 반영`, `현재 알려진 제한`, `최종 sign-off` 에 반영한다.
3. 필수 명령과 패키징 확인을 다시 완료한다.
4. `release/0.1.0` 브랜치를 분기한다.

## 이번 릴리즈 핵심 변경

### 실적 관리
- 최초 승인과 재승인 흐름을 분리했다.
- `재승인 대기`, `재승인 완료`, `재승인 확정` 상태를 명확히 표기한다.
- Pool 근무자의 대체근무는 실적 기록에는 남기되 수당 산출과 화면 노출에서는 제외한다.

### 수당 관리
- 근무지별 접기/펼치기 구조와 상세 근거 UI를 정리했다.
- 품의서, 별첨1, 별첨2를 Excel/PDF로 출력할 수 있다.
- 퇴직자 선지급과 선지급 취소 흐름을 추가했다.

### 대시보드
- 실데이터 기준 집계와 empty state를 정리했다.
- 차트별 PDF/Excel 내보내기와 전체 내보내기를 지원한다.

### 운영 관리
- 경로 설정, 공휴일 관리, 요율 관리, 사용자 관리, 양식 관리가 실제 저장 구조와 연결된다.
- 마이그레이션 파일 경로와 `DB업데이트` 로 Access 기준정보 또는 백업 JSON으로 DB를 복원할 수 있다.
- `DB업데이트` 는 실행 전 현재 DB 현황과 업데이트 후 예상 현황을 비교하는 미리보기 모달을 제공하고, 실행 후 결과와 최종 DB 상태를 다시 보여준다.
- Access `.accdb` 복원 시 `사업조직별근무실적` 기준의 기본 승인/수당 이력도 현재 앱 구조로 함께 이관한다.

### 근무지 관리 / 릴리즈 보완
- 근무지 관리 2단계에서 조 간 드래그 이동 후 이전 조에 인력이 남아 보이던 문제를 수정했다.
- 드래그 중 화면 가장자리 자동 스크롤을 추가했다.
- `DB업데이트` 로 가져온 조명 `A / B / C` 는 자동으로 `A조 / B조 / C조` 로 정규화해 배치한다.
- 검색 입력창이 드래그 이벤트에 간섭받지 않도록 정리했다.
- Windows 창 상단 아이콘과 패키징 아이콘 리소스를 같은 기준 파일로 맞췄다.

## 자동 검증 현황
- 마지막 자동 검증 재확인 기준일: `2026-03-24`
- 현재 통과 기준 명령:
  - `npm run test`
  - `npm run typecheck`
  - `npm run build`
  - `npm run smoke:electron`
  - `npm run release:check`
  - `npm run release:verify-package`
  - `node scripts/validate-structure.mjs`
- 확인된 산출물:
  - `release/ShiftMgmt-Setup-0.1.0-x64.exe`
  - `release/win-unpacked/ShiftMgmt.exe`

## 현재 릴리즈 판단
- 코드 기준 핵심 메뉴 기능은 릴리즈 후보 수준까지 정리됐다.
- 설치본/unpacked 실행, Windows 창 아이콘 리소스 연결까지 현재 빌드 기준으로 확인됐다.
- 현재 남은 분기 조건은 운영 관리 실데이터 수동 QA 기록과 그 결과 반영뿐이다.

## 현재 알려진 제한
1. Access 기반 `DB업데이트` 는 `공휴일 / 요율 / 근무지 / 인력 / 시급 / 패턴 / 배정 종료일` 과 `사업조직별근무실적` 기반 기본 승인/수당 이력을 복원한다.
2. Access 승인 이관 중 `SK증권 홍길동1 2024-08-15` 1건은 시급을 복원하지 못해 승인/수당 이력을 생성하지 않는다.
3. 양식 이력과 출력 이력은 Access 원본 구조에 없어서 복원 대상에 포함하지 않는다.
4. Access 패턴 복원은 `대전DC`, `대전NOC`, `울산CLX` 를 원본 시간 슬롯 부재로 제외한다.
5. 현재 릴리즈 산출물은 Windows NSIS 설치본 기준으로만 정리돼 있다.
6. 실제 운영 PC에서의 권한 정책, 백신 예외, 네트워크 폴더 정책은 별도 현장 검증이 필요하다.

## 수동 QA와 분기 조건
- 수동 QA 기록 문서: `docs/operations-manual-qa-checklist.md`

아래 3개가 모두 만족되면 `release/0.1.0` 브랜치를 분기한다.

1. `docs/operations-manual-qa-checklist.md` 가 실제 운영 데이터 기준으로 채워진다.
2. 이 문서의 `수동 QA 결과 반영` 과 `최종 sign-off` 가 최종 상태로 업데이트된다.
3. 최종 명령과 패키징 확인이 다시 완료된다.

## 분기 직전 최종 실행 순서
1. `docs/operations-manual-qa-checklist.md` 를 기준으로 수동 QA를 수행한다.
2. QA 결과를 이 문서에 반영한다.
3. `npm run test`
4. `npm run typecheck`
5. `npm run build`
6. `npm run smoke:electron`
7. `npm run release:check`
8. `npm run release:verify-package`
9. `node scripts/validate-structure.mjs`
10. `release/0.1.0` 브랜치 분기

## 수동 QA 결과 반영
- 실행 상태: 대기
- 반영 예정 위치:
  - 운영 관리, `DB업데이트`, 공휴일/요율/양식 실데이터 검증 결과
  - release 가능 여부 최종 판단
  - 알려진 제한 최종 유지 여부

반영 완료 후 아래를 업데이트한다.
- `현재 릴리즈 판단`
- `현재 알려진 제한`
- `최종 sign-off`

## 최종 sign-off

### 실행 정보
| 항목 | 값 |
|---|---|
| 실행 상태 | 미실행 |
| 확인 일시 |  |
| 확인자 |  |
| 대상 설치본 | `ShiftMgmt-Setup-0.1.0-x64.exe` / `ShiftMgmt.exe` |
| 결론 |  |

### 필수 명령
- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run smoke:electron`
- [ ] `npm run release:check`
- [ ] `npm run release:verify-package`
- [ ] `node scripts/validate-structure.mjs`

### 자동 Smoke 범위
- [ ] 운영 관리 경로 설정 저장/재조회
- [ ] 운영 관리 `DB업데이트` JSON 기준 교체
- [ ] 운영 관리 공휴일/요율/양식 탭 렌더링 및 기본 데이터 확인
- [ ] 운영 관리 사용자 생성/수정/삭제
- [ ] 실적 관리 읽기 흐름
- [ ] 승인-수당 연계 흐름

### 패키징 산출물 확인
- [ ] `release/ShiftMgmt-Setup-0.1.0-x64.exe` 생성
- [ ] `release/win-unpacked/ShiftMgmt.exe` 생성
- [ ] NSIS 설치본 실행 확인
- [ ] unpacked 실행 확인
- [ ] 설치본 제거 후 임시 파일 정리 확인

### 메뉴별 sign-off
- [ ] 대시보드 실데이터 집계, empty state, 내보내기 확인
- [ ] 인력 관리 목록/상세/배정 이력/시급 이력 확인
- [ ] 근무지 관리 패턴, 조 배정, 정원 검증 확인
- [ ] 근무표 배포 승인 양식 선택, 저장 경로, 배포 이력 확인
- [ ] 실적 관리 최초 승인, 재승인, Pool 제외 규칙 확인
- [ ] 수당 관리 산출 재현성, 선지급, 품의/별첨 출력 확인
- [ ] 운영 관리 경로 설정, `DB업데이트`, 공휴일, 요율, 사용자, 양식 관리 확인

### 최종 확인
- [ ] 기본 릴리즈 아이콘(`build/icon.ico`) 적용 상태 확인
- [ ] `docs/operations-manual-qa-checklist.md` 결과 반영 확인
- [ ] 사용자 문서 최신화 확인
- [ ] 위 항목 완료 후 `release/0.1.0` 브랜치 분기

## 최종 판정
- 릴리즈 가능 여부: 미판정
- 남은 blocker:
- 추가 수정 필요 항목:

## 최종 배포 문구 초안
- 교대근무관리시스템 V0.1.0은 인력 관리, 근무지 관리, 근무표 배포, 실적 승인, 수당 계산, 문서 출력을 하나의 로컬 앱으로 연결한 첫 릴리즈 후보다.
- 운영 관리에서는 경로 설정, 공휴일, 요율, 사용자, 양식 관리와 `DB업데이트` 복원 흐름까지 지원한다.
- 릴리즈 전 최종 조건은 운영 관리 실데이터 수동 QA 완료와 최종 sign-off 마감이다.
