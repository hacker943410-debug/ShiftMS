# CLAUDE.md — 폐기된 하네스 안내

Claude는 ShiftMgmt_V3.4의 현재 작업 흐름에서 사용하지 않는다.

- 요구사항 해석, 설계, 위임, 리뷰, 검증, 최종 판정은 Codex primary가 담당한다.
- 애플리케이션 코드 구현은 사용자가 중계한 `HANDOFF.md`를 받은 Gemini가 담당한다.
- 현재 공통 규칙은 `AGENTS.md`, 오케스트레이션 절차는 `.codex/HARNESS.md`, Gemini 전용 규칙은 `GEMINI.md`가 기준이다.
- `.claude/` 아래 파일은 과거 설정 보존본이며 현재 하네스로 간주하지 않는다.

Claude 세션이 이 파일을 읽었다면 파일을 수정하거나 명령을 실행하지 말고, 현재 흐름이 Codex + Gemini로 이전됐다고 사용자에게 알린 뒤 중지한다.
