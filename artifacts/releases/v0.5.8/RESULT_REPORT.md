# v0.5.8 결과 보고

## 현재 판정

HTML 권고와 적대검증 결함을 모두 수정했고, 로컬 설치본 및 공개 자산 검증까지 완료했다. v0.5.8 릴리즈를 완료로 판정한다.

## 완료된 검증

- 표적 회귀: 10개 파일, 241개 테스트 통과
- 승인 잠금 우선순위 후속 회귀: 2개 파일, 44개 테스트 통과
- 전체 회귀: 178개 파일, 1,267개 테스트 통과
- `npm run typecheck`: 통과
- `npm run lint`: 오류 0개, 기존 경고 25개
- `npm run build`: 통과(Vite 청크 크기 경고만 존재)
- `npm run validate:map`: 161개 경로 통과
- `npm run validate:harness`: 통과
- `node scripts/validate-structure.mjs`: 통과
- `npm run release:check`: 통과
- `node artifacts/scripts/capture-wage-bulk-modal.cjs`: 11/11 캡처 통과
- `npm run release:verify-package`: 통과
- packaged smoke: 통과
- installer smoke: 설치·재설치·기존 데이터 보존 통과
- `git diff --check`: 오류 없음(줄바꿈 변환 경고만 존재)

## 전체 테스트 중 발견 및 조치

- 첫 전체 실행: 178개 파일 중 177개 통과, 1개 실패.
- 원인: 재분석 신선도 문구가 기존 품의승인 잠금 문구보다 먼저 반환됨.
- 조치: 대상 행과 품의 잠금을 먼저 확인한 뒤 신선도 관문을 적용하도록 순서 조정.
- 후속 표적 44개 테스트와 전체 1,267개 테스트가 모두 통과했다.

## 게시 결과

- GitHub Release: `v0.5.8` Published (`2026-09-16T03:44:24Z`)
- URL: https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.5.8
- 태그 소스: `e390e4ca741b767e871cd10e397132b3eb441933`
- 자산: `ShiftMgmt-Setup-0.5.8-x64.exe`, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json` 확인
- 원격 자산 SHA-256과 로컬 게시 산출물 SHA-256 일치
- 공개 설치본 installer smoke: 설치·재설치·기존 데이터 보존 통과

## 게시 중 환경 복구

- 표준 `npm run release:publish`의 빌드, 전체 테스트, `release:check`는 통과했다.
- 직전 smoke 산출물의 `app.asar`를 현재 Orca 프로세스가 잠가 기본 출력 폴더 재생성이 한 번 실패했다.
- Orca를 강제 종료하지 않고 출력 폴더만 `release/publish-output`으로 격리해 동일 설정으로 NSIS 패키징과 GitHub 업로드를 재개했다.
- 격리 산출물의 해시와 원격 자산 해시를 대조한 뒤 그 설치본 자체로 installer smoke를 다시 통과했다.

## 알려진 비차단 한계

- 다른 Windows 관리자 계정으로 UAC 승격하는 G29는 다중 계정 VM 수동 검증이 필요하며 이번 자동 검증 범위 밖이다. 안전 복사본 자체는 일반 사용자 로컬 폴더에 보존된다.
