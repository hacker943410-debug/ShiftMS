# v0.4.4 구현 분석

## 복원 진단
- PowerShell export 실패는 기존에 generic 문구로 합쳐져 있었다.
- 진단 서비스가 stderr/stdout에서 핵심 실패 원인을 추려 사용자 메시지로 전달하도록 보강했다.

## 기본 양식 fallback
- 문서 출력은 등록된 `sourcePath`가 사라진 경우 바로 실패할 수 있었다.
- 기본 시드 양식은 설치본 리소스 `templates/defaults`를 우선 탐색하고, 개발 환경에서는 `양식샘플`을 fallback 한다.

## 품의서 사이트명 표기
- 사이트명은 `site.name -> customerName` exact match 에만 의존하고 있었다.
- 출력 전 단계에서 exact + normalized lookup 을 만들고, 수정분 품의서는 프로필 레이아웃까지 같이 보고 판별한다.
- legacy 출력 경로도 좌측 B열에 등록 사이트 명을 유지하도록 정리했다.
