# 원본 파일 메타데이터 저장 구조

작성일: 2026-03-11

이 문서는 승인대기/승인완료 폴더에서 감지된 원본 파일 메타데이터를 어떤 구조로 저장할지 정의한다. 목적은 승인 큐 표시, 중복 감지, 템플릿 식별, 추후 SQLite 저장을 같은 모델로 연결하는 데 있다.

## 1. 저장 목적

1. 어떤 파일이 언제 어떤 폴더로 유입되었는지 추적
2. 템플릿 종류와 파싱 가능 여부 기록
3. 중복 파일 후보를 구분
4. 승인 전 상태와 승인 후 상태를 분리 관리
5. 승인 이력 및 계산 스냅샷과 연결 가능한 기준 ID 확보

## 2. 핵심 필드

### 식별 필드

- `id`
  메타데이터 레코드 ID
- `fileName`
  원본 파일명
- `filePath`
  감지 시점 경로
- `duplicateKey`
  `normalized_path + size + modified_time_ms`

### 원본 파일 필드

- `fileSize`
  byte
- `modifiedTimeMs`
  파일 수정 시각 epoch ms
- `receivedAt`
  서비스가 감지한 시각 ISO datetime

### 분류 필드

- `directoryType`
  `pending`, `approved`, `unknown`
- `templateKind`
  `schedule-plan`, `attachment1`, `attachment2`, `proposal`, `unknown`
- `status`
  `pending`, `parsed`, `approved`, `rejected`, `error`

### 파싱/오류 필드

- `sheetName`
  첫 시트명
- `rowCount`
  행 수
- `columnCount`
  열 수
- `errorMessage`
  파싱 또는 감시 오류 메모

## 3. 저장 흐름

1. watcher가 파일 이벤트를 감지한다.
2. 파일 경로, 크기, 수정시각으로 `duplicateKey`를 만든다.
3. Excel 템플릿 검사 결과를 합쳐 메타데이터 레코드를 만든다.
4. 초기 상태는 `pending` 또는 `parsed`로 기록한다.
5. 승인 처리 시 승인 레코드와 연결하고 상태를 `approved` 또는 `rejected`로 갱신한다.

## 4. SQLite 매핑 초안

`performance_files` 테이블과의 1차 매핑은 아래와 같다.

| metadata field | sqlite column |
| --- | --- |
| id | `id` |
| fileName | `file_name` |
| filePath | `file_path` |
| duplicateKey | `file_checksum` 또는 별도 duplicate key column 후보 |
| fileSize | `file_size` |
| receivedAt | `received_at` |
| status | `file_status` |
| templateKind | `template_version_id`와 연결되기 전 임시 분류 필드 |

## 5. 후속 작업

1. 실제 checksum 생성 시 `duplicateKey`와 checksum 분리
2. `siteId` 자동 추정 규칙 추가 여부 검토
3. 승인 큐 조회용 정렬 정책 정의
