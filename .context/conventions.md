# Conventions

세부 작업 규칙은 `docs/project-rules.md`를 우선 참조한다.

## Naming
- 일반 파일명: kebab-case
- React component file: PascalCase
- 함수/변수: camelCase
- 타입: PascalCase
- 상수: UPPER_SNAKE_CASE

## React
- 배럴 파일보다 직접 import를 우선한다.
- 파생 가능한 값은 effect보다 render 단계에서 계산한다.
- 무거운 상호작용이나 필터 전환은 `startTransition` 계열을 우선 검토한다.
- renderer는 프레젠테이션과 사용자 상호작용에 집중하고, 계산식은 shared로 이동한다.
- 데이터 테이블, 필터 바, 카드 UI는 재사용 가능한 패턴으로 정리한다.

## Electron
- preload에서 명시적으로 허용한 기능만 renderer에 노출한다.
- IPC 채널 이름은 기능 단위 네임스페이스를 사용한다. 예: `app:get-version`
- OS 경로, 파일 감시, Excel 처리 코드는 main 전용으로 둔다.

## Git
- 현재 저장소 기본 브랜치 작업은 `master`
- 이번 초기 푸시는 `master`에 반영 가능
- 다음 작업부터는 기능별 새 브랜치를 생성해 푸시
- 커밋 메시지 규칙: `메뉴명.기능`
- 커밋 전 `npm run typecheck`와 관련 테스트를 우선 실행

## UI
- 사용자 표시 텍스트는 한국어
- 금액 표시는 KRW 기준
- 날짜는 ISO 형식(`YYYY-MM-DD`)을 기본 저장 형식으로 사용
- 기본 디자인 기준은 `docs/ui-design-brief.md`
- 대시보드는 Corporate Blue Palette와 명확한 정보 위계를 유지
- 차트는 반드시 표 또는 상세 수치 접근 수단을 함께 제공
