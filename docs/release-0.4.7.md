# 0.4.7 릴리즈 문서

## 문서 기준
- 문서 갱신일: `2026-04-24`
- 현재 작업 브랜치: `release/0.4.7`
- 대상 버전: `0.4.7`
- 현재 단계: GitHub Release 공개 게시 완료, 신규 설치본 자동업데이트 저장소 전환 완료
- 연계 문서:
  - `docs/patch-notes.md`
  - `artifacts/releases/v0.4.7/RESULT_REPORT.md`
  - `artifacts/releases/v0.4.7/RELEASE_MANIFEST.json`

## 제품 개요
`0.4.7`은 업무 기능 추가보다 자동업데이트 배포 기준점을 새 GitHub 저장소 `ShiftMS`로 옮기는 릴리즈다. 앞으로 새로 배포하는 설치본은 `0.4.7`을 기준으로 사용하면 되며, 이후 자동업데이트도 `ShiftMS` 저장소를 기준으로 확인한다.

## 이번 릴리즈 핵심 변경

### 1. GitHub Releases 자동업데이트 저장소 이전
- 앱 내부 업데이트 확인 경로를 `https://github.com/hacker943410-debug/ShiftMS` 기준으로 전환했다.
- `release:publish`가 게시하는 GitHub Release, `latest.yml`, `RELEASE_MANIFEST.json`도 새 저장소 `ShiftMS`에 업로드되도록 정리했다.
- 개발용 `dev-app-update.yml`도 같은 저장소를 보도록 맞췄다.

### 2. 신규 설치본 자동업데이트 기준선 생성
- `ShiftMgmt-Setup-0.4.7-x64.exe`를 앞으로 배포할 기본 설치본으로 생성했다.
- `0.4.7`부터 새로 설치한 PC는 이후 버전 업데이트를 새 저장소 기준으로 감지한다.
- 기존 `0.4.6` 이하 설치본은 예전 저장소를 보고 있으므로 `0.4.7` 설치본을 한 번 수동 설치한 뒤부터 새 저장소 기준 자동업데이트를 받는다.

### 3. 운영 문서와 릴리즈 이력 정리
- 최신 활성 릴리즈 문서를 `docs/release-0.4.7.md`로 교체했다.
- 릴리즈 아카이브와 결과 보고의 공개 URL도 새 저장소 기준으로 정리했다.

## 배포 기준 변경표
| 구분 | 이전 | 0.4.7 변경 |
|---|---|---|
| 자동업데이트 저장소 | `ShiftMgmt_V3.4` | `ShiftMS` |
| 신규 설치본 기준 버전 | `0.4.6` 이하 | `0.4.7` |
| 기존 설치본 전환 | 자동 전환 불가 | `0.4.7` 1회 수동 설치 후 새 저장소 기준 자동업데이트 |

## 자동 검증 계획
- `npm run typecheck`
- `npx vitest run src/main/services/app-update-service.test.ts src/main/services/release-publish-helpers.test.ts`
- `node scripts/release-check.mjs`
- `npm run release:publish`

## 배포 결과
- GitHub Release: `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.7`
- 설치 파일: `release/ShiftMgmt-Setup-0.4.7-x64.exe`
- 포함 자산: `latest.yml`, `RELEASE_MANIFEST.json`, `ShiftMgmt-Setup-0.4.7-x64.exe`, `ShiftMgmt-Setup-0.4.7-x64.exe.blockmap`

## 남은 수동 확인
- 새로 설치한 `0.4.7` 기준 PC에서 이후 버전 업데이트 감지 확인
