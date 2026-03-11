# Antigravity Agent Rules

## Language
- 사용자 대화: 한국어
- 코드 주석: 영어
- 커밋 메시지: 영어, Conventional Commits

## Working Rules
1. 파일 수정 전 현재 상태를 확인한다.
2. 다중 파일 변경 전에는 변경 범위를 먼저 정리한다.
3. Electron main/preload/renderer 경계를 명확히 유지한다.
4. 파일 시스템 접근, 향후 Excel 처리, 폴더 감시는 renderer가 아닌 main 계층에 둔다.
5. 외부 패키지 추가 시 빌드 영향과 네이티브 모듈 여부를 먼저 확인한다.

## Safety
- 파괴적 명령 전 사용자 의도를 재확인한다.
- 로컬 DB 파일과 환경 파일은 삭제나 재생성을 함부로 수행하지 않는다.

## Shared Skills
- `.agents/skills/`를 Codex와 Antigravity가 함께 사용한다.
- `.agent/skills`는 `.agents/skills`를 가리키는 링크로 유지한다.
