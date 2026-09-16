# ShiftMgmt 0.5.8 릴리즈

## 상태

- 기준일: 2026-09-16
- 브랜치: `fix/wage-ui-batch-1`
- 단계: GitHub Release `v0.5.8` Published, 자동 검증 및 공개 설치본 smoke 완료

## 게시 결과

- 공개일: `2026-09-16`
- 릴리즈: https://github.com/hacker943410-debug/ShiftMS/releases/tag/v0.5.8
- 자산: 설치본, `.blockmap`, `latest.yml`, `RELEASE_MANIFEST.json`
- 검증: `178/178` 파일·`1,267/1,267` 테스트, packaged smoke, 공개 설치본 재설치·데이터 보존 smoke 통과

## 핵심 변경

- 새 시급 적용일을 빈칸으로 시작하고 시급 이력을 구간 표로 보여 준다.
- 특정 시급 행의 금액·사유 정정과 사유 필수 삭제를 지원한다.
- 같은 시작일의 최신 시급을 삭제하면 다시 적용될 정확한 금액을 경고하고 main에서 확인값을 재검증한다.
- 시급 삭제 전 행·사유·작업자를 영구 감사 이력에 보존하며, 기록 실패 시 삭제도 롤백한다.
- 인력·근무표·정책·시급 변경 뒤 파일 재분석이 실패하면 옛 분석 행의 승인을 차단한다.
- 재입사·퇴사일 정정·월중 근무지/조 이동과 근무지 반려 실패 보상을 이력·트랜잭션 기준으로 보강한다.
- 설치 업데이트 중 사용자 데이터 백업/복원 경계와 충돌 경로의 안전 실패를 강화한다.

## 종료 조건

- 전체 테스트, 타입체크, lint, 빌드, 구조/맵 검증 통과
- `npm run release:publish` 성공
- GitHub Release `v0.5.8` Published 상태 및 설치본, blockmap, `latest.yml`, `RELEASE_MANIFEST.json` 확인
- packaged/installer smoke 통과

상세 범위와 검증 기록은 `artifacts/releases/v0.5.8/`에서 관리한다.
