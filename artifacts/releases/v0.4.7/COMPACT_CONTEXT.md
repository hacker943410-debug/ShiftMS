# Compact Context

- `0.4.7`은 기능 추가보다 GitHub Releases 자동업데이트 저장소를 `ShiftMS`로 옮기는 기준선 릴리즈다.
- 신규 설치본은 처음부터 새 저장소를 바라봐야 하므로 `package.json`, `dev-app-update.yml`, updater service, release publish script가 모두 같은 저장소를 참조해야 한다.
- 기존 `0.4.6` 이하 설치본은 예전 저장소를 보고 있으므로 자동 전환되지 않으며, `0.4.7` 설치본을 수동 설치한 뒤부터 새 저장소 기준 자동업데이트를 받는다.
- 릴리즈 문서와 결과 보고도 새 저장소 URL 기준으로 정리해야 이후 운영자가 혼동하지 않는다.
