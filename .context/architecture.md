# Architecture Notes

## 목표
교대근무 사이트별 인력 운영, 근무표 배포, 실적 승인, 수당 계산, 품의서 산출을 하나의 로컬 데스크톱 앱에서 처리한다.

세부 방향은 `docs/project-handbook.md`를 기준으로 유지한다.

## 기본 구조
- Electron main process
  로컬 파일 시스템 접근, 폴더 감시, 향후 Excel 입출력, 앱 생명주기 제어 담당
- Electron preload
  renderer에 안전한 IPC 브리지를 노출
- React renderer
  대시보드, 인력 관리, 근무지 관리, 실적 관리, 수당 관리 UI 담당
- Shared domain layer
  통화 포맷, 시간 계산, 교대 패턴 계산, 수당 산식 등 공용 로직 담당

## 권장 모듈 경계

- `auth`
  로컬 사용자 인증, 세션, 권한
- `workforce`
  인력 정보, 상태, 시급, 이력
- `site-pattern`
  근무지, 패턴, 조 index, 시뮬레이션
- `schedule`
  월별 근무표 계산, 캘린더 표현, 배포용 데이터 구성
- `performance`
  실적 파일 감지, 파싱, 승인/반려, 원본 보존
- `allowance`
  근로시간 분해, 수당 계산, 요율 버전 적용
- `document-output`
  근무표, 품의서, 별첨1, 별첨2 생성
- `operations`
  공휴일, 요율, 사용자, 양식 설정

## 데이터 흐름 기준

1. 기준정보 등록
   인력, 근무지, 패턴, 요율, 공휴일 설정
2. 근무표 생성
   패턴 시뮬레이션과 배정을 바탕으로 월별 계획표 생성
3. 실적 수집
   회신 Excel 파일 자동 감지 및 파싱
4. 실적 승인
   승인/반려와 함께 원본 및 상태 기록
5. 수당 산출
   승인 실적 + 요율 + 공휴일 + 시급 이력 기반 계산
6. 문서 산출
   품의서/별첨 생성

## 저장 원칙

1. 입력 원본과 계산 결과를 분리 저장한다.
2. 승인 당시 적용된 계산 근거를 스냅샷으로 저장한다.
3. 변경 가능 기준정보와 확정 결과 데이터를 다른 레이어로 다룬다.

## 저장 전략
- 1차 저장소: SQLite 로컬 파일
- 대상 데이터: 인력, 근무지, 패턴, 실적 승인 이력, 수당 계산 결과, 사용자 계정
- 원칙: renderer는 DB에 직접 접근하지 않고 main process service를 통해 접근

## 외부 연동
- 공휴일 조회: Nager.Date 또는 대체 가능한 한국 공휴일 JSON 소스
- 파일 입력: 지정 폴더 감시 후 승인대기/승인완료 실적 파일 파싱
- 파일 출력: 근무표, 품의서, 별첨1, 별첨2 Excel 생성

## 초기 ADR
| Date | Decision | Reason | Alternatives |
| --- | --- | --- | --- |
| 2026-03-11 | Electron + React + TypeScript 채택 | 로컬 설치형 UX와 웹 UI 생산성을 동시에 확보하기 위해 | 순수 웹 앱, WPF, WinForms |
| 2026-03-11 | SQLite를 로컬 DB 후보로 채택 | 설치형 앱에 적합하고 운영 복잡도가 낮기 때문 | PostgreSQL, JSON 파일 |
| 2026-03-11 | main/preload/renderer 계층 분리 | 파일 접근과 UI를 분리해 안정성과 보안을 확보하기 위해 | renderer 직접 접근 |
