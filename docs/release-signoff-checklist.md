# 릴리즈 Sign-off 체크리스트

## 릴리즈 기준
- 대상 브랜치: `release/0.1.0`
- 버전: `0.1.0`
- 공식 Windows 산출물: NSIS 설치본
- 내부 검수 산출물: `win-unpacked`

## 필수 명령
- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run smoke:electron`
- [ ] `npm run release:check`
- [ ] `npm run release:verify-package`

## 자동 Smoke 범위
- [ ] `smoke:electron:operations-settings` 로 경로 설정 저장/재조회가 동작한다.
- [ ] `smoke:electron:operations-migration` 로 JSON 기준 `DB업데이트` 가 동작한다.
- [ ] `smoke:electron:operations-config` 로 공휴일/요율/양식 탭이 기본 데이터와 함께 렌더링된다.
- [ ] `smoke:electron:operations-user` 로 사용자 생성/수정/삭제가 동작한다.
- [ ] `smoke:electron:performance` 로 실적 관리 읽기 흐름이 동작한다.
- [ ] `smoke:electron:approval-allowance` 로 승인-수당 연계 흐름이 동작한다.

## 실데이터 수동 QA 문서
- [ ] 운영 관리 실데이터 검증은 `docs/operations-manual-qa-checklist.md` 기준으로 기록한다.

## 패키징 산출물 확인
- [ ] `release/ShiftMgmt-Setup-0.1.0-x64.exe` 생성
- [ ] `release/win-unpacked/ShiftMgmt.exe` 생성
- [ ] NSIS 설치본 실행 확인
- [ ] unpacked 실행 확인
- [ ] 설치본 제거 후 임시 파일 정리 확인

## 메뉴별 Sign-off

### 대시보드
- [ ] 실데이터가 있을 때 카드와 차트가 정상 집계된다.
- [ ] 실데이터가 없을 때 empty state가 정상 표시된다.
- [ ] 차트별 내보내기와 전체 내보내기가 동작한다.

### 인력 관리
- [ ] 목록, 상세, 배정 이력, 시급 이력이 정상 조회된다.
- [ ] 등록/수정/삭제가 현재 저장 규칙대로 동작한다.

### 근무지 관리
- [ ] 패턴, 조 배정, 정원 검증이 동작한다.
- [ ] 시뮬레이션 결과가 저장 기준과 맞는다.

### 근무표 배포
- [ ] 승인된 양식만 선택된다.
- [ ] 근무표 양식 1/2가 현재 규칙대로 동작한다.
- [ ] 배포 파일과 이력이 저장 경로에 남는다.

### 실적 관리
- [ ] 최초 승인 완료 시 승인 완료 폴더로 자동 이동한다.
- [ ] 재승인 대기/완료/확정 흐름이 현재 규칙대로 동작한다.
- [ ] Pool 대체근무 제외 규칙이 반영된다.

### 수당 관리
- [ ] 승인 실적 기준 수당 산출이 재현 가능하다.
- [ ] 선지급 승인/취소와 출력 반영이 맞다.
- [ ] 품의서, 별첨1, 별첨2 Excel/PDF 출력이 정상 저장된다.

### 운영 관리
- [ ] 경로 설정 저장 후 앱 전체에서 재사용된다.
- [ ] `DB업데이트` 로 지정한 JSON/Access 기준 DB 교체가 의도대로 동작한다.
- [ ] 공휴일 관리에서 저장 목록/API 목록 비교와 반영 흐름이 맞다.
- [ ] 요율 관리에서 연도별 버전, 사용중/초안/종료 상태가 맞다.
- [ ] 사용자 관리에서 계정 추가/수정/삭제가 현재 저장 규칙대로 동작한다.
- [ ] 양식 관리에서 양식 종류별 묶음, 승인, 기본 사용 전환 규칙이 맞다.
- [ ] 실운영 데이터 기준 상세 확인 결과를 `operations-manual-qa-checklist.md` 에 남긴다.

## 릴리즈 전 최종 확인
- [ ] 기본 릴리즈 아이콘(`build/icon.ico`) 적용 상태 확인
- [ ] 사용자 문서 최신화 확인
- [ ] 알려진 이슈 목록 정리
- [ ] 릴리즈 노트 초안 정리
- [ ] 위 항목 완료 후 `release/0.1.0` 브랜치 분기
