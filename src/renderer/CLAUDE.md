# src/renderer — UI/디자인 규칙 (renderer 작업 시 자동 로드)

React 19 렌더러. 이 폴더 파일을 만질 때 아래 규칙이 적용된다. (전역 규칙은 루트 `CLAUDE.md`)

## 스타일
- **단일 CSS 파일** `src/renderer/styles.css`(~19k줄). 새 CSS는 여기 토큰을 재사용한다.
- 토큰: `--primary #3e56b6`, `--primary-soft #ebf0ff`, `--success #059669`, `--danger #dc2626`, `--muted #6c798f`. 하드코딩 hex 신설 자제(토큰 우선).
- **남색 금지**, 사이드바·shell **흰색** 유지. 예외는 승인 그라데이션 `linear-gradient(135deg,#3e56b6,#34459b)` 뿐.

## 아이콘
- **Material Symbols 글리프만** 사용: `<span className="material-symbols-outlined">glyph_name</span>`. 헬퍼 `.msi-sm/md/lg`, 섹션 제목용 `.section-glyph`.
- 폰트는 `material-symbols`(devDependency) → `main.tsx`에서 `import "material-symbols/outlined.css"`. 빌드 시 Vite가 woff2 번들.
- **손그림 SVG 아이콘 신설 금지.**

## 가짜 UI 금지 (데이터·동작 없는 장식 신설 금지)
전화/메시지 버튼, 관리자메모 남색 카드, 증명사진, 가짜 건수, 통합검색바, 눈/삭제 아이콘 등. 시안에 있어도 **실 데이터·동작이 없으면 만들지 않는다.**

## 패턴
- UI 라벨은 **한국어**, 코드 주석·식별자는 **영어**.
- 질문/확인/사유 입력 팝업은 `window.confirm/prompt/alert`·`dialog.showMessageBox` 금지 → 공통 모달 `components/QuestionDialog.tsx` + `useQuestionDialog().askQuestion(...)`.
- 모달은 공용 Esc/포커스트랩 훅을 사용(중복 구현 금지).
- **renderer에서 Node API 직접 사용 금지** → preload 브리지(`window.api…`)로만.
- import는 배럴 대신 직접 경로.

## 디자인 적용은 눈으로 검증
시안 일치/적용을 **코드만 읽고 단정하지 말 것.** 빌드 후 렌더 스크린샷 ↔ 시안 직접 대조로 판단. 시안 적용 루프는 **`/design-apply` 스킬**, 격리 대조는 **`ui-mock-comparator`** 서브에이전트. ([[verify-design-apply-visually]])

## 캡처 하네스 (먼저 빌드 필요: `npm run build:renderer && npm run build:electron`)
- `node artifacts/scripts/capture-actual-screens.cjs` — 상위 8개 메뉴
- `node artifacts/scripts/capture-modal-screens.cjs` — 12개 모달 + 운영 하위탭 (로그인 admin/1234→비번변경, modal-db-restore 실패는 정상)
- `node artifacts/scripts/capture-wizard-screens.cjs` — 근무지 마법사 3단계
