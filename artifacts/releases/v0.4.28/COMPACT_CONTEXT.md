# Compact Context

## 요청
- 실적관리 테이블은 날짜를 1순위, 조를 2순위로 정렬한다.
- 조별 묶음 패치가 기존 데이터에서도 적용되게 한다.
- 패치 후 메뉴가 세로로 보이고 로고가 크게 보이는 증상을 확인한다.

## 결론
- 기존 comparator는 조를 날짜보다 먼저 비교했다.
- 화면 묶음도 전체 기간의 같은 조를 한 번에 합쳐 날짜 우선 표시를 깨뜨릴 수 있었다.
- `0.4.27`에서 새로 추가한 `team_label`은 기존 DB 행에는 NULL일 수 있어 조 정렬이 미지정 조로 떨어질 수 있었다.
- `Failed to fetch dynamically imported module`은 실행 중인 JS와 교체된 `dist/assets` chunk hash가 섞인 증상이다.

## 조치
- 정렬 순서를 `workDate → teamLabel → section → employeeName`으로 변경.
- 기존 행은 월근무표, 원근무자 메모, 인력 배정 이력으로 조 라벨을 표시용 복원.
- 화면 조 묶음은 날짜별 조 그룹으로 분할.
- route screen lazy import 제거.
