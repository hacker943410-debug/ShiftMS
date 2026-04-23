# v0.4.5 구현 분석

## 자동업데이트
- `electron-updater`를 main process 서비스로 감싸고, renderer는 bridge polling으로 상태를 읽는다.
- `release:publish`는 electron-builder가 만든 GitHub Draft Release를 보강한 뒤 Published 상태로 전환한다.
- `requiresDbBackup=true` 버전은 설치 적용 직전 DB 백업 성공을 요구한다.

## 인력/근무조
- BP 인력은 `employmentType=BP`로 저장하고 표시명은 `BP(이름)` 형식으로 변환한다.
- 근무조 배정 순서는 assignment sort order로 저장해 미리보기/배포 순서에 반영한다.

## 선택형 목록박스
- 공통 `FormSelect`는 매칭 옵션이 없는 값을 첫 번째 옵션처럼 보여주지 않는다.
- 인력 고용형태는 legacy 빈 값/미분류 값을 form 진입 시 `정규`로 정규화한다.
