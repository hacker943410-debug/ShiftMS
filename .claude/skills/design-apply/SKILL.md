---
name: design-apply
description: 시안(mockup) ↔ 실제 화면 비주얼 일치 작업 루프. 특정 화면의 디자인을 시안에 맞출 때 사용한다. 기능 100% 유지·가짜 요소 금지·시각 검증이 핵심.
---

# 디자인(시안) 적용 루프 — ShiftMgmt_V3.4

확립된 화면별 적용 루프. **코드만 읽고 "일치"라 단정 금지** — 렌더 스크린샷 ↔ 시안 직접 대조로 판단한다. ([[verify-design-apply-visually]], [[design-overhaul-stitch-2026-06-19]])

## 입력
- 시안 HTML: `artifacts/site-wizard-mockups/` 등 시안 위치.
- 실제 화면 캡처: `artifacts/.../_actual/`. 3단 비교: `_시안비교.html`.

## 화면 1개당 루프
1. **읽기:** 해당 시안 HTML + 대상 소스(화면 `src/renderer/screens/…`, 모달 `components/…`, 스타일 `styles.css`)를 함께 읽는다.
2. **시각 차이만 추출:** 색·간격·아이콘·정렬·카드 구조 등 보이는 차이. 기능/문구 임의 변경 금지.
3. **기능 유지 + 가짜 금지:** 데이터·동작 없는 장식(전화/메시지 버튼·남색 메모카드·증명사진·가짜 건수·통합검색바·눈/삭제 아이콘 등) **신설 금지**. 남색 금지(흰색 shell), 아이콘은 Material Symbols 글리프.
4. **적용:** styles.css 토큰 재사용, 최소 변경.
5. **검증(필수):**
   - `npm run typecheck` · `npm run lint`(0 errors) · `npm run test`(721 green)
   - `npm run build:renderer && npm run build:electron`
   - 캡처: `capture-actual-screens.cjs` / `capture-modal-screens.cjs` / `capture-wizard-screens.cjs`
   - **스크린샷 ↔ 시안 직접 대조**(또는 `ui-mock-comparator` 서브에이전트).
6. **커밋**(화면 단위, forward-only) → **사용자 컨펌** → 다음 화면.

## 주의
- 시안에 있어도 **실 데이터·동작이 없는 요소는 만들지 않는다.**
- 본문이 바뀐 화면만 `_시안비교.html`에 태그.
- 게시 금지(이건 별개 — `/release-shiftmgmt`). 적용은 커밋까지만, 게시는 사용자 별도 승인.
