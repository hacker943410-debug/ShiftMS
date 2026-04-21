# v0.4.2 Sign-off Template

## 실행 정보
| 항목 | 값 |
|---|---|
| 버전 | `0.4.2` |
| 확인 일시 |  |
| 확인자 |  |
| 대상 설치본 | `ShiftMgmt-Setup-0.4.2-x64.exe` |
| 대상 실행 파일 | `release/win-unpacked/ShiftMgmt.exe` |
| 결론 |  |

## 자동 검증 체크
- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `node scripts/validate-structure.mjs`
- [x] `npm run release:package`
- [ ] `npm run smoke:electron:packaged`
- [ ] `npm run smoke:electron:installer`
- [ ] `npm run release:signoff`

## 수동 QA 체크
- [ ] 로그인 / 세션 기본 흐름 확인
- [ ] 근무지 패턴 문자열 수정 후 재진입 확인
- [ ] JSON 백업 복원 확인
- [ ] Access DB 복원 확인
- [ ] 운영 데이터 기준 핵심 업무 흐름 확인

## 로그 / 증적
- 패키징 로그: `logs/2026-04-21-release-package.log`
- 수동 QA 로그:
- 스크린샷:
- 비고:
