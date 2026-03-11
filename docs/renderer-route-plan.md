# Renderer 라우트 구조 초안

작성일: 2026-03-11

이 문서는 renderer의 화면 라우트 구조 초안이다. 현재는 내부 상태 기반 메뉴 전환으로 운영하지만, 이후 React Router를 도입할 때 동일 구조를 그대로 옮길 수 있도록 경로와 접근 권한을 먼저 고정한다.

## 1. 설계 원칙

1. 라우트 이름은 메뉴명과 1:1로 대응한다.
2. 인증 전에는 `/login`만 접근 가능하다.
3. 관리자 전용 화면은 `adminOnly` 메타데이터로 표시한다.
4. 초기 단계에서는 대시보드, 인력 관리, 근무지 관리를 우선 연결한다.

## 2. 1차 라우트 맵

| path | label | role |
| --- | --- | --- |
| `/login` | 로그인 | public |
| `/dashboard` | 대시보드 | operator, admin |
| `/workforce` | 인력 관리 | operator, admin |
| `/sites` | 근무지 관리 | operator, admin |
| `/schedule` | 근무표 배포 | operator, admin |
| `/performance` | 실적 관리 | operator, admin |
| `/allowance` | 수당 관리 | operator, admin |
| `/operations` | 운영 관리 | admin |

## 3. 도입 순서

1. 현재 상태 기반 메뉴를 이 라우트 맵으로 정규화
2. 로그인 세션과 라우트 가드 연결
3. React Router 도입
4. 화면별 로더 또는 IPC 조회 연결
