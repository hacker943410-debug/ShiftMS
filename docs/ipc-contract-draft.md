# IPC 계약 초안

작성일: 2026-03-11

이 문서는 renderer와 Electron main 사이의 1차 IPC 계약 초안이다. renderer는 DB, 파일 시스템, Excel 처리에 직접 접근하지 않고 이 계약을 통해서만 접근한다.

## 1. 네임스페이스 원칙

1. 채널 이름은 `도메인:동작` 형식을 사용한다.
2. renderer에는 preload가 허용한 API만 노출한다.
3. 파일 경로와 DB 접근 세부 구현은 main에서만 가진다.
4. 반환값은 가능한 한 직렬화 가능한 plain object만 사용한다.

## 2. 1차 우선 채널

### 앱

- `app:get-version`
- `app:get-health`

### 인증

- `auth:sign-in`
- `auth:sign-out`
- `auth:get-session`

### 기준정보

- `employees:list`
- `employees:create`
- `employees:update`
- `sites:list`
- `sites:create`
- `sites:update`
- `shift-patterns:list`
- `shift-patterns:create`

### 운영 설정

- `rates:list-versions`
- `rates:save-version`
- `holidays:get-calendar`
- `holidays:save-calendar`

### 파일/실적

- `watchers:get-status`
- `watchers:set-directories`
- `performance:list-files`
- `performance:parse-file`
- `performance:approve`
- `performance:reject`

### 계산/문서

- `allowance:calculate`
- `allowance:get-calculation`
- `documents:generate-schedule`
- `documents:generate-proposal`

## 3. preload 노출 객체 초안

```ts
interface AppBridge {
  getAppVersion: () => Promise<string>;
  getAppHealth: () => Promise<AppHealth>;
}
```

향후 도메인별 bridge를 아래처럼 확장한다.

```ts
interface AuthBridge {
  signIn: (input: SignInInput) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  getSession: () => Promise<AuthSession | null>;
}

interface WorkforceBridge {
  listEmployees: (query?: EmployeeListQuery) => Promise<EmployeeRecord[]>;
  listSites: () => Promise<SiteRecord[]>;
}
```

## 4. 공통 응답 형태 초안

```ts
interface BridgeSuccess<T> {
  ok: true;
  data: T;
}

interface BridgeFailure {
  ok: false;
  errorCode: string;
  message: string;
}

type BridgeResult<T> = BridgeSuccess<T> | BridgeFailure;
```

## 5. 1차 타입 후보

```ts
interface AppHealth {
  appVersion: string;
  environment: "development" | "production";
  databaseConfigured: boolean;
  pendingDirectoryConfigured: boolean;
  approvedDirectoryConfigured: boolean;
}

interface SignInInput {
  loginId: string;
  password: string;
}
```

## 6. 구현 순서

1. `app:get-health`
2. `auth:*`
3. `employees:list`, `sites:list`
4. `watchers:*`
5. `performance:*`
6. `allowance:*`

## 7. 오픈 이슈

1. bridge에서 도메인별 객체를 나눌지 단일 `window.appBridge` 아래에 둘지 결정 필요
2. 에러 응답을 예외 throw 방식으로 둘지 `BridgeResult<T>`로 통일할지 확정 필요
3. main 내부 서비스 레이어 명명 규칙 정의 필요
