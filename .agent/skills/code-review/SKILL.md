---
name: code-review
description: >
  ShiftMgmt_V3.4 변경사항을 리뷰한다. Electron 경계, 계산 로직,
  React 유지보수성, 로컬 파일 접근 안전성을 우선 점검한다.
---

# Code Review

## Focus
- renderer에서 Node API를 직접 쓰지 않았는가
- 수당/근무시간 계산 로직이 UI에 섞이지 않았는가
- 직접 import 원칙을 어기지 않았는가
- 테스트와 타입 검증 범위가 충분한가

## Output
- 심각도 순 Findings
- 파일 경로와 근거 포함
