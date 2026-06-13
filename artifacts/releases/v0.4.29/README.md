# v0.4.29

## 개요
`0.4.28` 후속 안정화 릴리즈입니다. 수당 반려 후 승인완료 파일이 수동으로 승인대기에 돌아온 상태를 재승인 흐름으로 복구하고, 프로그램 시작 시 무거운 백그라운드 작업을 지연합니다. 데스크톱 메뉴 레이아웃과 실적관리 조별 소계 라벨도 보정합니다.

## 범위
- 수당 반려 이력이 있는 승인완료 파일의 승인대기 재진입 상태 복구
- 법정휴일 행 재승인 버튼 회귀 테스트
- 승인/반려/재승인 반복 사이클 회귀 테스트
- 시작 시 업데이트 확인, 파일 감시, 실적 복구 작업 지연
- 데스크톱 메뉴 breakpoint와 로고 크기 보정
- 실적관리 조별 소계 라벨 보정

## 검증 요약
- `npm run test -- performance-management-service.test.ts performance-file-intake-service.test.ts performance-approval-flow-service.test.ts allowance-approval-service.test.ts approved-allowance-calculation-service.test.ts`
- 전체 타입체크, 테스트, 빌드, 패키징 검증 예정

## 배포 상태
- 패키징 및 GitHub Release 게시 진행 중
