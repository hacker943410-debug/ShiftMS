# 앱 설정값 초안

작성일: 2026-03-11

이 문서는 ShiftMgmt_V3.4의 1차 환경 설정값 초안이다. 목적은 로컬 설치형 앱에서 데이터 경로와 폴더 감시 경로를 고정 가능한 계약으로 먼저 정의하는 데 있다.

## 1. 기본 원칙

1. 사용자 PC 절대 경로를 코드에 하드코딩하지 않는다.
2. 상대경로가 입력되면 앱 기준 데이터 루트에 대해 해석한다.
3. 설정값이 비어 있으면 `.env.example`의 기본값을 따른다.
4. renderer는 설정 파일이나 경로를 직접 읽지 않고 main이 해석한 결과만 사용한다.

## 2. 1차 설정 키

### `APP_NAME`

- 기본값: `ShiftMgmt_V3.4`
- 용도: 앱 식별자, 데이터 디렉터리 기본명, 진단 화면 표시명

### `HOLIDAY_API_BASE_URL`

- 기본값: `https://date.nager.at/api/v3/PublicHolidays`
- 용도: 공휴일 조회 API 베이스 URL

### `DATA_DIR`

- 기본값: `./data`
- 용도: SQLite 파일, 로그, 캐시, 템플릿 메타데이터가 저장될 앱 데이터 루트

### `WATCH_PENDING_DIR`

- 기본값: `./imports/pending`
- 용도: 승인 대기 실적 파일 감시 폴더

### `WATCH_APPROVED_DIR`

- 기본값: `./imports/approved`
- 용도: 승인 완료 실적 파일 보관 또는 후속 처리 폴더

## 3. 경로 해석 규칙 초안

1. `DATA_DIR`가 상대경로면 `app.getPath("userData")` 하위 기준으로 해석한다.
2. `WATCH_PENDING_DIR`, `WATCH_APPROVED_DIR`가 상대경로면 `DATA_DIR` 기준 상대경로로 해석한다.
3. 경로 존재 여부는 앱 시작 시 health 상태에서 함께 확인한다.
4. 실제 폴더 생성 정책은 후속 작업에서 결정하되, 현재 단계에서는 "설정 해석"과 "존재 여부 진단"만 수행한다.

## 4. 예시

```env
APP_NAME=ShiftMgmt_V3.4
HOLIDAY_API_BASE_URL=https://date.nager.at/api/v3/PublicHolidays
DATA_DIR=./data
WATCH_PENDING_DIR=./imports/pending
WATCH_APPROVED_DIR=./imports/approved
```

## 5. 후속 작업

1. 설정 저장 위치 확정
2. 초기 진단 화면 추가
3. 경로 유효성 검사와 폴더 생성 정책 확정
4. SQLite 파일명 규칙 확정
