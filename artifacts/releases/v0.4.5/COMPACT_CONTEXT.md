# v0.4.5 Compact Context

## 목표
- 설치본 배포를 GitHub Releases 자동업데이트 기준으로 전환한다.
- 인력/BP/근무조 순서/선택형 목록박스 저장값 불일치 문제를 안정화한다.

## 확정 결정
- 패키징 요청은 기본적으로 GitHub Release Published 상태까지 완료한다.
- 앱 내부 패치노트는 GitHub Release 본문이 아니라 `RELEASE_MANIFEST.json`을 기준으로 한다.
- 표시된 선택값과 저장 payload가 달라질 수 있는 fallback 표시는 금지한다.

## 비목표
- Windows 코드서명 도입은 이번 범위에 포함하지 않는다.
- beta/alpha 업데이트 채널은 도입하지 않는다.
