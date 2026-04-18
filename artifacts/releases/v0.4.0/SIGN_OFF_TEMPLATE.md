# v0.4.0 Sign-off Template

## 기본 정보
- 실행일:
- 담당자:
- 환경:
- 설치본 경로:
- DB / 샘플 데이터:

## 자동 검증 재사용 확인
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run smoke:electron:operations-user`
- [ ] `npm run smoke:electron:packaged`
- [ ] `npm run smoke:electron:installer`
- [ ] `npm audit --audit-level=high`

## 수동 QA 결과

### 시나리오 실행
- [ ] 시나리오 1. 최초 운영 세팅과 양식 기준 확정
- [ ] 시나리오 2. 실적 승인부터 수당 계산과 품의 승인 마감까지
- [ ] 시나리오 3. 반려, 재승인, 요율 변경, 감사 추적 검증

### 인증 / 권한 / 세션
- [ ] 첫 로그인 비밀번호 변경 강제 확인
- [ ] planner / reviewer / operator 권한 확인
- [ ] 앱 재시작 후 재로그인 확인

### 설치본 / 복구
- [ ] fresh install 확인
- [ ] same-path 재설치 확인
- [ ] JSON 백업 복구 확인
- [ ] Access DB 복구 확인

## 이슈 기록
- blocker:
- minor issue:
- 후속 개선:

## 최종 판정
- 릴리즈 가능 여부:
- 승인자:
- 승인일:
- 비고:

