---
name: deploy-checker
description: >
  설치형 배포 전 기본 검증을 수행한다. 타입체크, 테스트, 빌드,
  환경 변수, 출력 폴더 상태를 확인한다.
---

# Deploy Checker

## Checklist
1. `npm run typecheck`
2. `npm run test`
3. `npm run build`
4. `.env.example` 최신성 확인
5. 배포 산출물 경로 확인
