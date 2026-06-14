# ShiftMgmt 품질감사 최종보고서

**대상:** ShiftMgmt 0.4.30 / **일자:** 2026-06-14 / **방식:** 8차원 병렬감사 + 적대검증

---

## 1. 경영진 요약 (쉬운 말)

이 프로그램은 야간·휴일 근무수당을 계산하고 결재해서 급여로 내보내는 도구입니다. 이번 점검 결과는 **10점 만점에 약 4.7점, 학점으로 C-(직전과 같은 등급대)** 수준입니다. 좋은 점은, 계산기 자체(분·시간 계산, 원 단위 반올림)는 정확하고, 프로그램의 뼈대(화면·기능을 나누는 구조)는 꾸준히 깔끔해지고 있으며, 로그인 비밀번호 보관 방식 같은 기본 보안도 제대로 만들어져 있다는 것입니다.

위험한 점은 **두 가지가 여전히 그대로**라는 것입니다. 첫째, "백업에서 되돌리기(복원)"를 하면 **누가 어떤 수당을 승인했는지에 대한 기록과 감사 로그가 소리 없이 영구 삭제**됩니다. 백업 파일에는 그 기록이 들어 있는데, 되돌릴 때 프로그램이 그 표(테이블)들을 다시 채우지 않고 빈 상태로 덮어쓰기 때문입니다. 둘째, **누구나 아는 관리자 비밀번호 '1234'가 여전히 그대로**이고, 로그인 시도 횟수 제한(잠금)이 동작하지 않아 무한정 비밀번호를 찍어볼 수 있습니다. 여기에 더해, **제품을 배포하는 과정에서 자동 테스트가 한 번도 실행되지 않고**(테스트 게이트 없음), 코드 검토(PR)도 없이 작업 중인 가지에서 곧장 출시하고 있습니다.

**한 줄 결론: 전면 재작성은 필요 없습니다 — 뼈대와 계산은 살릴 만합니다. 다만 "복원이 기록을 지우는 문제"와 "테스트 없는 배포"를 먼저 막는 점진 안정화가 시급합니다.**

---

## 2. 종합 점수

**가중 평균 4.72점 → 4.7 / 10 (C-)**

가중치 방식: 급여 정확성에 직접 영향을 주는 **도메인정확성(1.5)** 과 **데이터무결성(1.5)** 에 1.5배 가중치를 부여하고, 나머지 6개 차원은 1.0배로 계산했습니다.

| 항목 | 계산 |
|---|---|
| 가중합 | (5.5 + 5.2 + 4.5×1.5 + 4.5 + 5.2 + 3.5×1.5 + 6.3 + 3.8) = 42.5 |
| 가중치 합 | (1 + 1 + 1.5 + 1 + 1 + 1.5 + 1 + 1) = 9.0 |
| 가중 평균 | 42.5 ÷ 9.0 = **4.72** |

> 주: 가중 평균은 **4.7 / 10 (C-)** 이다. 가장 무겁게(1.5배) 본 데이터무결성(3.5 / D)과 도메인정확성(4.5 / C-)이 급여앱의 치명·고위험 결함을 그대로 안고 있어, 종합 등급은 직전과 같은 **C- 하단**에 머문다. 직전 감사 **4.2 / 10 (C-)** 대비 표면 수치는 소폭 상승(구조·CI·성능)했으나, **최고 심각도(critical) 결함이 직전과 동일하게 미해결**이라 실질 개선은 제한적이다.

**직전 대비:** 4.2 (C-) → 4.7 (C-). 구조·코드품질·CI 추가·성능 등으로 일부 차원은 올랐지만, 가장 위험한 데이터무결성은 오히려 가장 낮은 D 등급이며 핵심 결함이 그대로다.

---

## 3. 차원별 점수표

| 차원 | 점수 | 등급 | 한줄평 |
|---|---|---|---|
| 아키텍처 (architecture) | 5.5 | C+ | 모듈·IPC 경계는 견고하나, 복원·단일진실원천 봉합부가 위험하게 방치됨 |
| 코드품질 (code-quality) | 5.2 | C | 기계적으로는 깔끔하나 ESLint 부재 + 핵심 데이터결함 잔존 |
| 도메인정확성 (domain-correctness) | 4.5 | C- | 계산 코어는 정확, 그러나 소급요율 오선택이 미해결 |
| 테스트 (testing) | 4.5 | C- | 실DB·실엑셀 통합은 우수, 그러나 치명 경로가 무가드 |
| 보안 (security) | 5.2 | C | 구조 보안은 양호, 그러나 '1234' + 잠금없음 로그인이 구멍 |
| 데이터무결성 (data-integrity) | 3.5 | D | 복원이 결재·감사 이력을 영구 삭제(치명) — 최대 위험 |
| 성능 (performance) | 6.3 | C+ | 규모 대비 충분, 이중 파싱·250ms 지연은 시간낭비 수준 |
| 프로세스 (process) | 3.8 | C- | 테스트 게이트·코드리뷰·머지규율 사실상 부재 |

---

## 4. 차원별 상세

### 4.1 아키텍처 (architecture) — 5.5 / C+

거시 구조는 진짜로 견고하고 개선 중이다. 프로세스 경계가 깨끗하고(contextIsolation/sandbox 켜짐, 렌더러가 electron/ipcRenderer를 직접 만지지 않음), IPC가 공유 contracts.ts → BridgeResult<T> 판별 유니온 → preload 캐스팅으로 끝단까지 타입 계약이 닫혀 있으며, 핸들러가 5개 도메인 모듈로 분리되고, 354개 파일 madge 스캔에서 순환 의존은 단 1건(타입 전용·런타임 무해)이다. Strangler 분해가 가시적으로 작동한다(성능 도메인 ~10개 서비스로 팬아웃). 그러나 급여앱이 감당할 수 없는 바로 그 지점에서 데이터 무결성 봉합부가 깨져 있다: JSON 복원이 하드코딩된 28개 테이블만 재생성하고, 요율 버전 선택이 날짜 무시 함수를 먼저 호출하며, duty 해석이 갈라져 있고, SQL 외래키가 0개다.

**강점**
- main/preload/renderer/shared 경계가 깨끗 — main.ts:184-189 (contextIsolation:true, nodeIntegration:false, sandbox:true), 렌더러는 ipcRenderer 직접 import 0건
- 규율 잡힌 IPC 계약: contracts.ts의 타입 인터페이스 + BridgeResult<T>가 끝단까지 닫힘
- 5개 응집 도메인 모듈로 핸들러 분해(~111채널), DI 가드(withSession/withActionPermission/withAdmin)
- 의존성 위생 우수: 354파일 중 순환 1건(타입 전용)
- 머니 도메인 로직이 src/shared/domain에 격리되어 렌더러·메인이 재사용

**약점**
- 복원 봉합부가 비대칭·손실형: 백업은 모든 테이블을 덤프하나 복원은 고정 목록만 반복 → 4개 테이블 소리 없이 삭제
- duty 해석에 단일진실원천 없음(restore=시간창 분류 vs parser=문자 일치), dutyCode가 비제약 string
- god-file 잔존: PerformanceManagementScreen 123KB, allowance-document-export 113KB, database-migration 103KB
- SQL 외래키 0건 — 참조 무결성이 손코딩 서비스 로직에만 의존
- CI는 추가됐으나 release:publish 경로에 미연결

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| JSON 복원이 하드코딩 28개 테이블만 재생성 → 급여·결재·감사 4개 테이블 무단 삭제 | **Critical** | 여전히 열림 | database-migration-service.ts:74-104, 2787-2794; database-backup-service.ts:45-55; 파일스왑 3085-3108 |
| SQL 외래키 0건; 참조 무결성 손코딩 | Medium | 여전히 열림 | sqlite-storage-service.ts:35-628 (REFERENCES/FK 0건, PRAGMA foreign_keys 미설정) |
| 죽은 휴일 리졸버 여전히 호출됨 | Low *(medium→low 하향)* | 여전히 열림 | schedule-return-performance-parser.ts:725-766, 1274 |
| 요율 버전 선택이 workDate 무시 | Low *(high→low 하향, 단일활성 불변식이 방어)* | 여전히 열림 | approved-allowance-calculation-service.ts:114-123 |
| duty 해석 포크(비제약 string) | Low *(high→low 하향, 런타임 정규화로 D/E/N 일원화)* | 여전히 열림 | model.ts:119,242; monthly-schedule-restore-service.ts:281-318 |
| 품질 게이트가 배포 경로에 없음 | Medium | 부분 개선 | .github/workflows/ci.yml:43-50; package.json:54 |

---

### 4.2 코드품질 (code-quality) — 5.2 / C

0.4.30 코드는 기계적으로는 깨끗하나 급여 시스템 치고는 규율이 약하다. 좋은 점: strict TypeScript가 양쪽 tsconfig에서 무오류 통과, 캐스트가 드뭄(총 33건, 대부분 테스트/JSON.parse), 빈 catch나 catch{return null} 삼킴이 main에 없음, 머니 계산 진입점이 시간·요율·시급 누락을 명시적 에러코드로 차단(직전의 "조용히 0원" 개선). 나쁜 점: ESLint가 아예 없음(lint는 typecheck 별칭, eslint는 의존성에도 없음), 거대 파일 다수, 그리고 직전 최고심각도 결함 2건이 그대로다.

**강점**
- strict TS 양쪽 tsconfig 활성, npx tsc --noEmit 종료코드 0
- 캐스트 33건뿐(대부분 테스트/경계), production 로직은 거의 타입 탈출 없음
- src/main에 빈 catch·삼킴 패턴 0건
- 머니 경로가 0/누락 입력을 하드 차단(approved-allowance-calculation-service.ts:308-333)
- 디버그 마커 거의 0(전체 비테스트 트리에 TODO 1건)

**약점**
- ESLint 전무: lint = typecheck 별칭, package-lock에 eslint 0건 → floating promise·dead code·any 미검출
- 거대 파일: database-migration 3136 LOC, allowance-document-export 3077, operations-storage 2638
- dutyCode가 코어 모델에서 비제약 string(model.ts:119,242)
- 조용한 폴백: monthly-schedule-draft.ts:182 (dutyCodeMap.get(..) ?? 'O') as 캐스트
- 250ms 인위 지연 잔존(performance-file-intake-service.ts:40,294)
- 기본 관리자 비밀번호 '1234' 잔존(auth-password-policy.ts:1)

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| JSON 복원이 급여·결재 4개 테이블 무단 삭제 | **Critical** | 여전히 열림 | database-migration-service.ts:74-104, 2787; sqlite-storage-service.ts:349,502,585,607 |
| 요율 버전 선택이 workDate 무시 → 소급분 오요율 | **Critical** *(검증 확정)* | 여전히 열림 | approved-allowance-calculation-service.ts:114-123; allowance-rate-service.ts:33-44 |
| dutyCode가 코어 모델에서 비제약 string | Medium | 여전히 열림 | model.ts:119,242; schedule-plan.ts:10 |
| ESLint 부재, lint는 typecheck 별칭 | Medium | 여전히 열림 | package.json:20-21; package-lock(eslint 0건) |
| 파싱 계층 조용한 ?? 'O'/null 폴백 | Low *(high→low 하향, 작업코드엔 도달불가·2중 게이트 방어)* | 부분 개선 | monthly-schedule-draft.ts:182; parser:725-766 |
| 죽은 always-null 휴일 리졸버 호출됨 | Low | 여전히 열림 | parser:725-766,1274 |
| 250ms 인위 지연 하드코딩 | Low | 여전히 열림 | performance-file-intake-service.ts:40,294 |
| 기본 관리자 비밀번호 '1234' | Low | 부분 개선 | auth-password-policy.ts:1 |

> 주: 코드품질 차원이 제기한 "요율 선택 workDate 무시"는 아키텍처 차원의 적대검증에서는 단일활성 불변식을 이유로 low로 보았으나, 도메인정확성·테스트 차원의 독립 검증은 **다중 활성 버전 상황에서 실제 오지급이 발생**함을 확정했다. 본 보고서는 보수적으로 **critical(다중활성 조건부)**로 채택한다(아래 4.3 참조).

---

### 4.3 도메인정확성 (domain-correctness) — 4.5 / C-

분 단위 계산 코어(calculation.ts)는 진짜로 견고하다: 야간창 겹침, 익일 정규화, 야간→비야간 잔업 순 휴게 차감, 8시간 캡 존중 — 모두 데이터 주도 테스트. 반올림도 정확(라인별 floor + 최대잔여 분배 vs ceil 총액, 원 누락 없음). 두 가지 직전 결함이 급여에 영향을 미친 채 남아 있다. 소급 요율 백데이팅 버그가 완전 미해결(2026-03-31 이후 무변), duty 포크는 데이터 차원에서 화해됐으나 타입은 여전히 비제약 string, 죽은 휴일 리졸버 미해결, "조용히 0분" 정책은 부분 완화.

**강점**
- 분 계산 정확·고커버리지(calculation.ts:132-187 + 13개 회귀 케이스)
- 보수적·무손실 반올림(allowance-service.ts:73-108)
- duty 코드 해석이 데이터에서 D/E/N로 화해(restore가 시간 기준 분류)
- 풀 대체근무 비지급 처리가 calc·승인검증·목록 3계층에서 일관 적용
- 승인 게이트 실재: 시급 0/누락 + 에러급 알럿 차단(performance-approval-flow-service.ts:143-149)

**약점**
- 요율 선택이 workDate 무시 → 소급분이 최신 활성 버전 배율로 가격책정
- 죽은 휴일 리졸버가 대체 경로에 배선되어 영구 무력
- dutyCode 비제약 string(model.ts:119,242), D/E/N 화해는 관례일 뿐 타입 미강제
- 개별 누락 행이 경고만 동반한 채 0분 가능(2차 게이트가 대개 포착)

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| 요율 선택이 workDate 무시 → 소급 잔업/휴일 수당 오배율 | **High** *(다중활성 시 실오지급, 단일활성 시 무해)* | 여전히 열림 | approved-allowance-calculation-service.ts:114-123; allowance-rate-service.ts:19-44; allowance-rate-service.test.ts:19-32 |
| 죽은 휴일/None-마커 리졸버가 영구 null 반환 | Medium | 여전히 열림 | parser:725-766, 1272-1300; git show e6fad10(의도적 무력화 확인) |
| 개별 누락 행이 비차단 경고만 동반한 채 0분 | Low *(medium→low 하향, 2중 게이트로 0원 지급 불가)* | 부분 개선 | parser:863-872, 1108-1119; flow-service:143-149; calc-service:308-314 |
| dutyCode가 도메인 모델에서 비제약 string | Low | 부분 개선 | model.ts:119,242; schedule-plan.ts:10 |

---

### 4.4 테스트 (testing) — 4.5 / C-

스위트는 양적으로 넓고(137파일, ~667 it(), Node 24.13 그린, node:sqlite 크래시·플레이크 없음) 통합 충실도가 비범하다: 다수 머니/승인 테스트가 실제 ExcelJS 워크북을 실 서비스로 구동해 실 디스크 sqlite에 넣는다. 실데이터 특성화 테스트(동작국사 홍길동→유성, 구체 양수 지급액 단언)도 있다. 그러나 커버리지가 급여앱 치고는 잘못 조준됐다: 직전 최고심각도 머니/데이터 결함 2건이 여전히 무가드다.

**강점**
- 실DB/실엑셀 왕복 충실도 진짜(approved-allowance-calculation-service.test.ts, dongjak-hong-yuseong-verification.test.ts)
- 생산 유도 인시던트의 특성화 테스트 존재(구체 420분/양수 원)
- 코어 시간분해 수학 데이터 주도(13 회귀 케이스 + 익일/야간휴게 엣지)
- Node 24.13 단일워커 클린·고속, 250ms 지연 테스트 무력화

**약점**
- 4개 누락 테이블의 백업→복원 왕복 테스트 0건(유일 복원 단언은 'sites' 1행)
- 요율 백데이팅 미시험(allowance-rate-service.test.ts 3케이스, 생산 선택체인 미구동)
- 테스트가 생산을 게이트하지 않음(release:publish는 테스트 0)
- CI는 희망사항: self-hosted 러너 오프라인, 0.4.30 실행 'queued' 정체
- 머니 반올림 경계 커버리지 얕음

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| 급여·결재·감사 테이블의 복원 왕복이 완전 무시험(데이터손실 경로) | **Critical** | 여전히 열림 | database-migration-service.ts:74-104; database-migration-service.test.ts:105-147; *.test.ts 4테이블 참조 0 |
| 소급-요율 선택이 틀렸고 무시험 | **Critical** *(다중활성 조건)* | 여전히 열림 | approved-allowance-calculation-service.ts:114-123; allowance-rate-service.test.ts:9-33 |
| 생산 경로에 자동 테스트 게이트 없음 | High | 부분 개선 | package.json:54; ci.yml:22,46-47(러너 0, queued); branch protection 404 |
| 머니 반올림 경계 커버리지 부족 | Low *(medium→low 하향, 왕복 테스트가 권역별 정확액 단언)* | 여전히 열림 | rounding.test.ts:1-32; allowance-service.test.ts:35-229 |

---

### 4.5 보안 (Security) — 5.2 / C

구조 보안은 진짜로 양호하다: Electron 하드닝 정확(모든 BrowserWindow에 contextIsolation+nodeIntegration:false+sandbox), preload는 고정 allowlist 명명 메서드만 노출(generic ipcRenderer 통과 없음), 세션은 메인 프로세스 서버측 보관(렌더러 위조 불가), 액션별 IPC 인가가 포괄·일관(모든 머니/결재 변경이 reviewer 역할 withActionPermission로 게이트). 비밀번호는 scrypt+per-user salt+timingSafeEqual, 계정복구 잠금은 실동작. 그러나 같은 주의가 1차 로그인엔 미적용: 기본 관리자 비밀번호 '1234'가 항상 시드되고, 로그인 잠금은 죽은 코드다.

**강점**
- 모든 창에서 프로세스 격리 정확(main.ts:184-189; PDF·대시보드 내보내기 창도 동일)
- preload 최소·안전: 단일 contextBridge, 명명 메서드 바인딩, raw ipcRenderer 없음
- 액션별 IPC 인가 포괄·균일(approval/money=reviewer, admin=withAdmin); 무가드 변경 핸들러 0
- 자격증명 해싱 정확(scrypt 16B salt, 64B key, timingSafeEqual)
- 계정복구 견고(scrypt 복구키, 5실패/15분 잠금, 강제 비번변경)
- 값 경로 SQL 인젝션 없음(prepared statement, 식별자 allowlist+quote)

**약점**
- 기본 관리자 비번 '1234' + 로그인 잠금·스로틀 없음 → 알려진 계정 무제한 추측 가능
- 자동업데이트 인스톨러 미서명(Authenticode 인증서 없음)
- JSON 복원이 access_logs 감사 추적 + 결재 인가 테이블 무단 삭제
- CSP 메타·내비게이션 잠금 없음(블래스트 반경은 격리로 제한)

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| 로그인 잠금이 죽은 코드 — 알려진 'admin'/'1234' 무스로틀 무차별 가능 | **High** *(critical→high 하향, 강제 비번변경이 IPC 경계에서 차단)* | 여전히 열림 | auth-password-policy.ts:1; operations-storage-service.ts:2008-2016; auth-service.ts:104-120 |
| JSON 복원이 감사·결재 인가 4개 테이블 삭제 | **High** | 여전히 열림 | database-backup-service.ts:46-55,72; database-migration-service.ts:74-104,2787-2794 |
| 자동업데이트 패키지 미서명 — 게시자키 신뢰 없음 | **High** | 여전히 열림 | package.json build.win(signAndEditExecutable:false, 인증서 없음); app-update-service.ts:462-481; 실배포물 NotSigned 확인 |
| CSP·내비게이션 잠금 없음 | Low | 신규 | index.html(CSP 없음); main.ts:172-205(will-navigate/setWindowOpenHandler 없음) |

---

### 4.6 데이터무결성 (data-integrity) — 3.5 / D

**급여앱에 가장 위험한 결함이 0.4.30에서 미해결이다.** JSON 백업/복원이 비대칭이다. 백업은 sqlite_master로 모든 테이블을 덤프하나, 복원은 하드코딩 28-테이블 화이트리스트만 재채운다(2026-03-24 이후 무변). 드롭되는 4개 테이블—allowance_approvals, allowance_proposal_approvals, hidden_approved_performance_rows, access_logs—은 모두 라이브 생산 라이터가 있고, allowance_proposal_approvals는 실제 품의 지급 인가 기록(work_month, total_allowance_amount, approved_by)을 담는다. 복원이 원자적으로 교체 후 이전 라이브 DB를 삭제하므로 이 손실은 조용하고 비가역이며, 어떤 테스트도 잡지 못한다. 외래키는 전무, PRAGMA foreign_keys도 미활성.

**강점**
- markStoredPerformanceFileArchivedAsEffective가 아카이브+effective 재플래그를 단일 트랜잭션으로 래핑(crash-safe 주석 포함)
- 대기복귀 흐름이 트랜잭션화(pre-COMMIT 크래시 시 복구가능 고아 산출)
- 마이그레이션 자체는 안전 스테이징(temp DB→원자 교체→실패 시 이전 DB 복원)
- 머니/식별 컬럼에 의미있는 제약(signature UNIQUE, approval_id UNIQUE)

**약점**
- JSON 복원이 4개 이력 테이블 조용히 삭제; 손실 비가역(이전 DB 삭제)
- 외래키 전무, PRAGMA foreign_keys 미설정
- is_effective 단일사본 불변식을 받치는 DB 제약 없음
- 전진 결재 쓰기가 단일 트랜잭션 없는 보상 사가(수동 보상 삭제 의존)
- 백업/복원 왕복(대칭) 테스트 없음

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| JSON 백업/복원이 급여·결재 4개 이력 테이블 조용히 삭제(비가역) | **Critical** | 여전히 열림 | database-migration-service.ts:74-104,2787; sqlite-storage-service.ts:349,502,585,607; database-replacement-service.ts:42-44 |
| 외래키 0건, PRAGMA foreign_keys 미활성 | **High** | 여전히 열림 | sqlite-storage-service.ts:35-628; 전 src FK/REFERENCES 0건 |
| 전진 결재 쓰기가 원자 트랜잭션 아닌 보상 사가 | Medium | 신규 | performance-approval-flow-service.ts:154-196,395-447; approved-allowance-calculation-service.ts:390,462-476 |
| is_effective 단일사본 불변식에 DB 제약 없음 | Low *(medium→low 하향, 단일프로세스 동기쓰기로 동시성 위협 부재·생산경로 미발화)* | 신규 | performance-file-storage-service.ts:806,843; sqlite-storage-service.ts:408-436 |

---

### 4.7 성능 (Performance) — 6.3 / C+

이 앱 규모(월 수십 사이트, 단일 데스크톱 사용자)엔 충분하며 직전 가정보다 낫다. 가장 무서운 두 핫패스 위험이 완화됐다: 시작 복구가 3000ms 지연·비동기라 UI를 막지 않고, 개요 목록 빌드가 행별 승인 N+1을 배치 쿼리로 설계상 제거했다. 인덱스가 모든 핫 FK 컬럼에 있고, existsSync가 메모이즈되며, 전체기간 동기화가 20개로 캡됐다. 남은 비용은 실재하나 한정적: 모든 스케줄 파일이 ExcelJS로 두 번(실제로는 세 번) 읽히고, 250ms 인위 지연이 모든 대화형 개요에서 발화(파일당 ~500ms), 죽은 휴일 리졸버가 셀 순회만 한다. 어느 것도 정확성·무결성 결함은 아니다.

**강점**
- 시작 복구 3000ms 지연·완전 비동기(main.ts:224-234)
- 핫 개요 경로가 행별 승인 해석 옵트아웃 + 배치 사전로드로 N+1 설계 제거
- 모든 핫 컬럼에 적절한 인덱스
- existsSync 메모이즈(unique 경로당 최대 1 stat)
- 전체기간 대기 동기화가 20개로 한정

**약점**
- 모든 워크북이 파싱당 2~3회 전체 읽기(inspect+parse 중복)
- 250ms 인위 지연이 대화형 개요마다 파일당 ~500ms(20사이트 ~10초)
- toDetail 행별 승인 N+1이 잠재(기본 옵션 호출자는 지불)
- 죽은 휴일 리졸버가 셀 순회 후 항상 null

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| 파일당 워크북 2~3회 파싱 — 지배 비용 중복 | Medium | 신규 | performance-file-intake-service.ts:420,461; schedule-return-performance-parser.ts:1668-1671 |
| 250ms 인위 지연이 대화형 개요마다 발화 | Low *(medium→low 하향, 재파싱 파일에만·정확성 무영향)* | 부분 개선 | performance-file-intake-service.ts:40,738,790; performance-management-service.ts:666,678 |
| toDetail 행별 승인 N+1 잠재(옵트아웃으로만 회피) | Low | 여전히 열림 | performance-file-storage-service.ts:175-178,634-653; performance-approval-service.ts:201-203 |
| 죽은 휴일 리졸버 셀 순회 후 항상 null | Low | 여전히 열림 | parser:725-766,1272-1280 |

---

### 4.8 프로세스 (process) — 3.8 / C-

생산 배포 경로가 여전히 자동 테스트를 실행하지 않는다. release:publish = build && release:check && electron-builder --publish always && publish-release-assets인데, release:check는 파일 존재·env·매니페스트 길이·package.json 형태만 검증할 뿐 vitest를 호출하지 않는다. 테스트를 실제 돌리는 release-signoff.mjs는 수동·선택이며 어떤 자동 게이트에도 미배선이고, v0.4.30 릴리스 폴더엔 signoff 로그가 전혀 없다. CI 워크플로가 추가됐으나 self-hosted Linux 러너가 오프라인이라 v0.4.30 CI 실행은 1시간 넘게 'queued' 정체, 그동안 릴리스는 이미 09:37Z 라이브 게시됐다. 브랜치/머지 규율은 사실상 부재(머지 0, PR 0, main은 26커밋 뒤처진 0.4.24, 태그·릴리스가지·작업가지가 모두 동일 커밋 d08080f).

**강점**
- 실 CI 워크플로 신규 추가(typecheck+vitest+build, push/PR)
- release-signoff.mjs는 잘 만든 사인오프 하니스(typecheck+test+package+스모크+audit, 실패 시 비정상 종료)
- 버저닝 규율적(v0.4.0..v0.4.30 주석 태그, 전용 release/0.4.x 가지)
- release:check가 컴파일 외 릴리스 위생 불변식 강제
- 롤백 원칙상 가능(electron-updater latest.yml)

**약점**
- 실제 생산 명령(release:publish)이 테스트 0 실행
- CI 미게이트: v0.4.30 'queued' 정체(러너 없음), 게시는 CI 무관 진행
- PR 0 / 머지 0 — 어떤 릴리스에도 코드리뷰 증거 없음
- main 26커밋 뒤처짐(0.4.24); 릴리스가 라이브 작업가지에서 직접 컷
- 동일 작업가지 컷으로 안정화/리뷰 경계 없음
- 극단적 동일일 케이던스(0.4.26~0.4.30 모두 06-13/14)
- v0.4.30 사인오프 로그·QA 산출물 없음(수동 QA 규율 퇴행)
- 자동업데이트 미서명

**핵심 발견 (적대검증 후 보정)**

| 제목 | 심각도 | 상태 | 근거 |
|---|---|---|---|
| 생산 게시 경로가 자동 테스트 0 실행 | **High** *(critical→high 하향, CI가 push마다 테스트 자동트리거하나 강제는 아님)* | 여전히 열림 | package.json:54; release-check.mjs(테스트 없음); release-signoff.mjs:40-42(수동) |
| CI 존재하나 비차단 연극 — CI 미실행 중 릴리스 게시 | High | 부분 개선 | ci.yml:22(self-hosted, 러너 0); 실행 27494809260 queued 1h+; 게시 09:37:15Z |
| 머지/PR/리뷰 규율 없음; 라이브 작업가지에서 컷; main 방치 | High | 여전히 열림 | git log --merges 빈; gh pr list 빈; rev-list main..HEAD=26; HEAD/v0.4.30/release/feature 모두 d08080f |
| 자동업데이트 패키지 미서명 | Medium | 여전히 열림 | package.json:149(signAndEditExecutable:false, CSC 없음); app-update-service.ts:4,207 |
| v0.4.30 수동 QA/사인오프 산출물 퇴행 | Low *(medium→low 하향, 강제 게이트 아닌 수동 마크다운·매니페스트는 정상)* | 신규 | artifacts/releases/v0.4.30/(RELEASE_MANIFEST.json만); v0.4.29 대비 |

---

## 5. 직전 감사(2026-06-13) 대비 변화

**FIXED (수정·개선됨)**
- 머니 계산 진입점이 시간·요율·시급 0/누락을 명시적 에러코드로 하드 차단(직전 "조용히 0원" 핵심 완화) — approved-allowance-calculation-service.ts:308-333
- duty 코드 해석이 데이터 차원에서 D/E/N로 화해(restore가 시간 기준 분류, parser가 동일 네임스페이스 소비) — 휴일분 0붕괴 포크 제거
- 계정복구 잠금이 실동작(time-based lockedUntil + failureCount) — 직전 죽은 잠금 대비 개선
- 휴일 근로자 미아 시 duty-slot 시간 폴백 추가(455f4a8) — 개별 0분 창 축소, identity-preserving
- 시작 복구가 3000ms 지연·비동기로 UI 비차단; 개요 N+1 배치화로 설계 제거
- CI 워크플로 신규 추가(typecheck+test+build, push/PR) — 구조적 개선

**여전히 열림 (미해결)**
- **[CRITICAL] JSON 복원이 4개 급여·결재·감사 테이블 무단·비가역 삭제** — database-migration-service.ts:74-104 (2026-03-24 이후 무변)
- **[CRITICAL/HIGH] 요율 버전 선택이 workDate 무시 → 다중활성 시 소급 오지급** — approved-allowance-calculation-service.ts:114-123 (2026-03-31 이후 무변)
- **[HIGH] 로그인 잠금 죽은 코드 + '1234' 기본 비번** — operations-storage-service.ts:2008-2016; auth-password-policy.ts:1
- **[HIGH] 외래키 0건, PRAGMA foreign_keys 미활성** — sqlite-storage-service.ts
- **[HIGH] 자동업데이트 미서명** — package.json build.win(signAndEditExecutable:false)
- **[HIGH] 테스트 게이트·PR·머지 규율 사실상 부재** — release:publish 테스트 0, PR 0, 머지 0, main 26커밋 뒤
- dutyCode 비제약 string(model.ts:119,242), 죽은 휴일 리졸버(parser:725-766), 250ms 지연 — 모두 미해결
- ESLint 전무(package.json:20-21)

**새로 발견**
- [HIGH] CI가 존재하나 self-hosted 러너 부재로 'queued' 영구 정체 — 비차단 연극(ci.yml:22)
- [MEDIUM] 전진 결재 쓰기가 단일 트랜잭션 없는 보상 사가(performance-approval-flow-service.ts:154-196)
- [MEDIUM] 파일당 워크북 2~3회 중복 파싱(performance-file-intake-service.ts:420,461)
- [LOW] CSP·내비게이션 잠금 부재(index.html; main.ts:172-205)
- [LOW] is_effective 단일사본 불변식 DB 제약 부재
- [LOW] v0.4.30 QA/사인오프 산출물 퇴행

---

## 6. 근본 원인 분석

**왜 결함이 반복되는가:**

1. **강제 게이트의 부재가 모든 것을 관통한다.** 가장 치명적인 두 결함(복원 4테이블 삭제, 요율 백데이팅)은 각각 2026-03-24와 2026-03-31에 도입된 뒤 3개월 가까이 무변이다. release:publish가 테스트를 한 번도 돌리지 않고, CI는 러너가 없어 'queued'에 묶이며, PR·코드리뷰가 0건이다. **틀린 코드를 막을 자동 관문이 어디에도 없으니, 결함은 한번 들어오면 영원히 남는다.** 본 감사가 두 차례 같은 critical을 적발한 것이 그 증거다.

2. **백업/복원의 비대칭이 "추가는 sqlite_master 전수, 삭제는 하드코딩 목록"이라는 구조적 불일치에서 온다.** 백업은 모든 테이블을 자동 열거하지만 복원은 손으로 관리하는 28-테이블 목록에 의존한다. 새 테이블이 스키마에 추가될 때마다 누군가 이 목록을 손으로 갱신해야 하는데, 그 규율이 없다. 외래키가 0건이라 DB가 이 불일치를 잡아줄 마지막 백스톱도 없다.

3. **타입 시스템을 단일진실원천으로 쓰지 않는다.** dutyCode가 비제약 string이라, restore/parser/draft가 각각 정규화를 재구현하고(4곳 이상), OFF_DUTY_CODES 멤버십이 파일마다 다르다. 런타임에서 우연히 화해되어 있지만, 타입이 강제하지 않으니 미래의 한 줄이 드리프트를 재도입할 수 있다.

4. **극단적 케이던스 + 단일 작업가지 직접 컷.** 0.4.26~0.4.30이 이틀 안에 쏟아졌고, 안정화/리뷰 경계 없이 작업 중인 가지를 그대로 태그·게시한다. 빠른 속도가 검증 없이 결합되어 회귀의 블래스트 반경을 키운다.

5. **죽은 코드가 정리되지 않는다.** 죽은 휴일 리졸버는 직전에도 지적됐고 의도적으로 무력화됐으나(e6fad10) 제거되지 않았다. ESLint가 없어 dead code·floating promise를 자동 검출할 수단이 없고, tsc strict는 unused locals조차 잡지 않게 설정돼 있다.

---

## 7. 처방 (우선순위)

### Phase 0 — 즉시 (배포 전 필수, 급여·이력 보호)

1. **복원 테이블 목록을 자동화하라.** JSON_IMPORT_TABLE_ORDER 하드코딩을 제거하고, 백업과 동일하게 sqlite_master에서 실제 테이블을 열거해 복원하도록 통일하라. 최소한 누락 4개(allowance_approvals, allowance_proposal_approvals, hidden_approved_performance_rows, access_logs)를 즉시 추가하라. (database-migration-service.ts:74-104)
2. **복원 왕복 테스트를 게이트에 추가하라.** 4개 테이블에 행을 넣고 백업→복원 후 생존을 단언하는 테스트를 작성하고, 통과하기 전엔 배포 불가로 만들어라. (database-migration-service.test.ts)
3. **요율 선택 순서를 뒤집어라.** toRateTable에서 selectActiveAllowanceRateVersion({targetDate: workDate})를 먼저 호출하고, 날짜 무시 selectAppliedAllowanceRateVersion는 폴백으로 강등하라. 이미 올바른 형제 경로(performance-overtime-repair-service.ts:44-48)가 있으니 그대로 따르라. 다중활성 + 소급 workDate 테스트를 추가하라. (approved-allowance-calculation-service.ts:114-123)
4. **release:publish에 테스트를 배선하라.** release:check 직전 또는 직후에 npm run test를 강제 단계로 넣어라(또는 release:signoff를 publish 체인에 편입). 테스트 실패 시 게시가 불가능해야 한다. (package.json:54)
5. **로그인 잠금을 살리고 '1234'를 끊어라.** sign_in_locked_until을 실제로 기록·확인하도록 recordStoredOperationAuthFailure/signIn를 수정하고(operations-storage-service.ts:2008-2016, auth-service.ts:104-120), 기본 관리자 비번은 무작위 생성+강제변경으로 전환하거나 최소한 무차별 스로틀을 적용하라.

### Phase 0.5 — 단기 (게이트 신뢰성·델리버리 신뢰)

6. **CI 러너를 실제로 온라인화하거나 GitHub-hosted로 전환하라.** self-hosted Linux 러너가 없어 'queued' 정체 중인 ci.yml:22를 ubuntu-latest 등으로 바꾸고, main/release 브랜치에 required status check를 걸어라. CI 통과 없이는 머지·게시 불가로 만들어라.
7. **자동업데이트 코드서명을 도입하라.** electron-builder build.win에 Authenticode 인증서(CSC)를 설정해 미서명 인스톨러 + SmartScreen 경고 + 게시자키 부재 신뢰 공백을 닫아라. (package.json build.win)
8. **외래키 + PRAGMA foreign_keys = ON을 도입하라.** 핵심 결재·계산 관계(performance_approvals↔allowance_calculations↔allowance_approvals)에 FK를 선언하고 연결 오픈마다 PRAGMA를 켜, 부분복원·고아 행을 DB가 거부하게 하라. (sqlite-storage-service.ts)

### Phase 1 — 중기 (구조 견고화·재발 방지)

9. **dutyCode를 브랜드 유니온('D'|'E'|'N'|'O')으로 좁혀라.** model.ts:119,242를 제약 타입으로 바꾸고, 중복 정규화 4곳을 단일 함수로 통합하라. 타입이 미래 드리프트를 컴파일 타임에 막게 하라.
10. **전진 결재 쓰기를 단일 트랜잭션으로 묶어라.** 승인 INSERT + 계산 INSERT(다중 라인) + 아카이브 + effective 마크를 하나의 BEGIN/COMMIT로 감싸, 부분 커밋 상태를 DB 롤백으로 처리하라(보상 사가 의존 제거). (performance-approval-flow-service.ts:154-196,395-447)
11. **ESLint를 도입하라.** no-floating-promises, no-unused-vars, no-dead-code, no-explicit-any 규칙을 켜고 CI에 추가하라. 죽은 휴일 리졸버(parser:725-766)를 제거하고, 250ms 인위 지연을 삭제하라.
12. **워크북 이중/삼중 읽기를 단일 핸들 공유로 합쳐라.** inspect와 parse가 같은 ExcelJS 워크북 인스턴스를 재사용하도록 리팩터링하라. (performance-file-intake-service.ts:420,461)
13. **PR·머지 규율을 복원하라.** 릴리스를 작업가지에서 직접 컷하지 말고, release 브랜치로 PR을 열어 리뷰·CI 통과 후 머지·태그하라. main을 최신화하라.

---

## 8. 부가 리스크

- **CSP·내비게이션 잠금 부재** — 격리(contextIsolation+sandbox)로 블래스트 반경은 제한되나, 표준 하드닝 항목 누락. 방어심층 보강 권장. (index.html; main.ts:172-205)
- **is_effective 단일사본 불변식 DB 미강제** — 현재 단일프로세스 동기쓰기로 무발화이나, 부분 유니크 인덱스(UNIQUE(schedule_key) WHERE is_effective=1)로 백스톱 추가 권장.
- **거대 파일(3000+ LOC)** — database-migration/allowance-document-export/operations-storage가 리뷰·변경 위험을 키움. 점진 분해 대상.
- **app:check/download/install-update 핸들러가 세션리스** — 인증 없이 설치·재기동 트리거 가능(register-core-handlers.ts:121-181). 자동업데이트 UX상 의도일 수 있으나 검토 권장.
- **allowance:set-early-payout가 withSession만으로 게이트** — 지급영향 플래그가 승인급 권한이 아닌 일반 오퍼레이터 권한으로 보호됨. (register-allowance-handlers.ts:91-103)
- **복원 후 자동 사전백업이 동일 JSON 포맷** — 향후 복원 시 같은 4테이블을 또 드롭하므로, Phase 0-1 수정 전엔 사전백업이 안전망이 되지 못함.