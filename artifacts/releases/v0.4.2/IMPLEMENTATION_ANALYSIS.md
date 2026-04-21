# v0.4.2 구현 분석

## 변경 배경
- 근무지 패턴 수정 화면에서 사용자가 입력한 cycle 원문 표현식이 저장 후 다시 열기 시 그대로 보이지 않았다.
- 기존 구조는 `steps`와 `pattern_code`만 저장하고, 화면에서 문자열을 다시 조합해 표시했다.
- 그 결과 `야휴`, `1휴`, `주*2휴`처럼 사용자가 의도한 표현이 보존되지 않고 재구성 문자열로 바뀌어 보였다.

## 핵심 설계 변경

### 1. SQLite 저장소
- `shift_pattern_cycles`에 `pattern_string` 컬럼을 추가했다.
- migration/boot 경로에서 기존 DB도 컬럼이 없으면 추가되도록 맞췄다.
- cycle 저장 시 계산용 `steps` 외에 표시용 원문 문자열을 같이 보관한다.

### 2. Main process 저장 경로
- `shift-pattern-storage-service`에서 cycle insert/update 시 `patternString`을 저장하도록 변경했다.
- cycle 조회 시 `pattern_string`을 shared 모델로 전달한다.
- 기존 데이터는 `patternString`이 비어 있을 수 있으므로 nullable 경로를 유지한다.

### 3. Renderer 저장 / 표시 경로
- 근무지 관리 저장 action이 cycle 입력 원문을 bridge 계약에 포함하도록 수정했다.
- selector는 DB에 `patternString`이 있으면 그 값을 우선 사용하고, 없을 때만 기존 재구성 문자열을 fallback 한다.

### 4. 패키징
- `package.json` 버전을 `0.4.2`로 갱신했다.
- `npm run release:package`로 Windows NSIS 설치본을 재생성했다.

## 검증 메모
- 저장소와 selector에 회귀 테스트를 추가해 원문 문자열 저장/재조회 경로를 고정했다.
- 전체 자동 검증은 `108 files / 437 tests` 기준으로 통과했다.
- 이번 턴에서는 installer / packaged smoke와 최종 sign-off는 수행하지 않았다.
