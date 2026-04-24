# Implementation Analysis

## 핵심 구조
- `src/main/services/app-update-service.ts`
  - GitHub Releases 조회 시 사용하는 owner/repo 상수를 `ShiftMS` 기준으로 유지한다.
- `dev-app-update.yml`
  - 개발 환경 자동업데이트 검증에서도 같은 GitHub 저장소를 바라보도록 맞춘다.
- `package.json`
  - electron-builder `publish` 설정이 새 저장소 `ShiftMS`로 릴리즈 자산을 올리도록 유지한다.
- `scripts/publish-release-assets.mjs`
  - `RELEASE_MANIFEST.json`을 GitHub Release 본문과 함께 새 저장소 릴리즈에 업로드한다.

## 호환성
- 기능 로직 변화는 없고 자동업데이트 대상 저장소만 변경된다.
- 기존 `0.4.6` 이하 설치본은 이전 저장소 기준으로 빌드되었으므로 자동 경로 전환이 되지 않는다.
- 따라서 `0.4.7`은 향후 배포용 신규 설치 기준선 역할을 한다.
