# 릴리즈 준비 현황 요약

## 기준
- 대상 릴리즈 브랜치: `release/0.1.0`
- 대상 버전: `0.1.0`
- 기준 날짜: `2026-03-24`
- 현재 판단 단계: `manual QA 직전`

## 자동 검증 현황
### 현재 통과
- [x] `npm run test`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run smoke:electron`
- [x] `npm run release:check`
- [x] `npm run release:verify-package`
- [x] `node scripts/validate-structure.mjs`

### 2026-03-24 재확인 메모
- [x] 현재 워킹트리 기준으로 자동 검증 전체 재실행 완료
- [x] `release/ShiftMgmt-Setup-0.1.0-x64.exe` 생성 확인
- [x] `release/win-unpacked/ShiftMgmt.exe` 생성 확인

### 자동 smoke 포함 범위
- [x] 운영 관리 경로 설정 저장/재조회
- [x] 운영 관리 DB업데이트(JSON 기준 DB 교체)
- [x] 운영 관리 공휴일/요율/양식 탭 렌더링 및 기본 데이터 확인
- [x] 운영 관리 사용자 생성/수정/삭제
- [x] 실적 관리 읽기 흐름
- [x] 승인-수당 연계 흐름
- [x] unpacked 앱 실행
- [x] NSIS 설치본 설치/실행

## 수동 확인이 남은 항목
### 운영 관리 실데이터 QA
- [ ] `docs/operations-manual-qa-checklist.md` 기준으로 실제 운영 데이터 확인
- [ ] 네트워크 드라이브/사내 공유 폴더 환경 확인
- [ ] 실제 공휴일 API 주소 기준 동기화 확인
- [ ] 실제 사용중 요율과 계산 결과 대조
- [ ] 실제 양식과 기본 사용 전환 규칙 재확인

### 릴리즈 문서 마감
- [ ] 운영 데이터 수동 QA 결과를 반영해 알려진 이슈와 릴리즈 노트 최종 문구 확정

## 현재 판단
### 완료된 상태
- 코드 기준 핵심 메뉴 기능은 릴리즈 후보 수준까지 정리됐다.
- 운영 관리 기준정보 복원은 JSON 백업 기준으로 자동 smoke까지 포함됐다.
- 자동 검증은 배포 전 기준선으로 다시 통과했다.
- 패키징과 설치본 실행까지 현재 기준으로 확인됐다.
- 현재 `build/icon.ico` 는 `0.1.0` 기본 릴리즈 아이콘으로 사용 가능하다.

### 아직 release 브랜치를 만들지 않는 이유
- 운영 관리 실데이터 수동 QA 결과가 아직 문서에 기록되지 않았다.
- 수동 QA 결과가 릴리즈 노트와 알려진 이슈 문구에 아직 반영되지 않았다.

## release/0.1.0 분기 조건
아래 2개가 모두 만족되면 분기한다.

1. `docs/operations-manual-qa-checklist.md` 가 실제 운영 데이터 기준으로 채워진다.
2. `docs/release-notes-draft-0.1.0.md` 와 `docs/known-issues.md` 가 최종 문구로 정리된다.

## 분기 직전 최종 실행 순서
1. `npm run test`
2. `npm run typecheck`
3. `npm run build`
4. `npm run smoke:electron`
5. `npm run release:check`
6. `npm run release:verify-package`
7. `node scripts/validate-structure.mjs`
8. `release/0.1.0` 브랜치 분기
