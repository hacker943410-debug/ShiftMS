# v0.4.5 결과 보고

## 변경 요약
- GitHub Releases 자동업데이트를 도입했다.
- 패키징 요청 시 GitHub Release 공개 게시까지 수행하는 규칙을 문서화했다.
- BP 인력 등록, 표시, 수당 제외 흐름을 보강했다.
- 근무조 배정 순서를 저장하고 근무표 배포 순서에 반영했다.
- 선택형 목록박스가 실제 저장값과 다른 첫 번째 옵션을 표시하지 않도록 수정했다.
- Access 복원, 기본 양식 fallback, 품의서 사이트명 표기, 주요 액션 결과 모달/이력을 보강했다.
- 중복 문서를 정리하고 릴리즈 아카이브 구조를 갱신했다.

## 검증
- `npm run typecheck`
- `npm test -- src/renderer/components/FormSelect.test.tsx src/renderer/screens/workforce/workforce-employment-type-options.test.ts`
- `node scripts/release-check.mjs`

## 남은 확인
- GitHub Release 게시 후 asset 상태 확인
- 사용자 PC에서 업데이트 감지와 설치 적용 확인
