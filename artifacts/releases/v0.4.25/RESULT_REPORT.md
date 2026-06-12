# Result Report

## Changes
- 근무지 상세 Cycle 근무시간 표시를 canonical slot 순서로 정렬했다.
- 실적관리 수동 새로고침에서 반환 파일 강제 재파싱을 요청해 최신 월근무표 시간으로 계산한다.
- `None` 입력을 명시적 실적 제외값으로 처리해 법정휴일, 대체, 연장 실적에 생성되지 않게 했다.
- 실적관리 필터 순서를 변경하고 기존 필터 박스 폭은 유지했다.
- 실적관리 테이블을 조밀하게 표시하되 작은 화면에서는 가로 스크롤 fallback을 유지했다.
- 구형 품의서 템플릿은 등록 단계에서 저장 차단 안내를 표시한다.

## Verification
- `npm run test`: 130 files / 630 tests 통과.
- `npm run build`: 통과.
- `git diff --check`: 공백 오류 없음. CRLF 변환 경고만 확인.
- `npm run smoke:electron:packaged`: 통과.
- `npm run smoke:electron:installer`: 통과. 재설치 후 데이터 보존 확인.

## Packaging
- Package version: 0.4.25.
- Local installer: `release/ShiftMgmt-Setup-0.4.25-x64.exe`.
- Blockmap: `release/ShiftMgmt-Setup-0.4.25-x64.exe.blockmap`.
- `latest.yml`: version `0.4.25`.
- GitHub Release: Published, `https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.4.25`.
- Remote assets confirmed: installer, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`.

## Residual Risks
- 실제 Electron 화면 수동 확인은 설치본 생성 후 운영 데이터로 확인해야 한다.
