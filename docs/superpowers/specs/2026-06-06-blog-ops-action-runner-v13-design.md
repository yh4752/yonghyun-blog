# Blog Ops Action Runner v1.3 Design

## 목적

Blog Ops Dashboard v1.3은 preview-only였던 Action Runner를 **제한된 실제 실행 도구**로 확장한다.

v1.3의 핵심 목표는 "Dashboard에서 버튼을 눌러도 안전한가"를 검증하는 것이다. 그래서 이 단계에서는 파일을 바꾸는 명령을 실행하지 않는다. 먼저 source validation과 publish dry-run처럼 읽기 중심의 명령만 실행하고, allow-list, project 검증, dirty state 표시, 로그 패널, 실행 중복 방지 같은 안전 기반을 만든다.

## 현재 상태

현재 Dashboard는 아래 기능을 갖고 있다.

- `/api/inventory`로 source post, published post, private note 상태를 읽는다.
- Folder UI와 Smart View로 글을 필터링한다.
- Action Runner Preview에서 project-scoped publish command를 복사할 수 있다.
- 실제 명령 실행 endpoint는 없다.
- preview command의 영향 범위는 Smart View subset이 아니라 선택한 Folder 전체다.

v1.3은 이 구조를 유지한다. Smart View는 화면 표시용 필터이고, Runner 실행 범위는 계속 선택한 Folder 전체다.

## 범위 결정

### 포함

v1.3에서 Dashboard가 직접 실행할 수 있는 action은 두 개다.

| action key | 실행 명령 | 파일 변경 | 목적 |
| --- | --- | --- | --- |
| `validate-source` | `npm run validate:posts -- --source --project <project>` | 없음 | 원본 글 frontmatter와 편집 정책 확인 |
| `publish-dry-run` | `npm run publish:posts -- --project <project> --dry-run` | 없음 | 전체 발행 흐름에서 실행될 단계를 미리 확인 |

두 action 모두 project slug가 필요하다. `All Folders` 상태에서는 실행 버튼을 비활성화한다.

### 제외

v1.3에서는 아래를 하지 않는다.

- `sync:posts` 실제 실행
- `publish:posts` 실제 실행
- `npm test` 직접 실행
- `npm run build` 직접 실행
- frontmatter 편집
- draft 토글
- 파일 삭제
- commit, push, PR 생성
- 임의 shell command 입력
- 사용자가 request body에 command 문자열을 넣어 실행하는 방식

## 왜 v1.3에서 파일 변경 명령을 제외하는가

`validate-source`와 `publish-dry-run`은 실패해도 작업 파일을 바꾸지 않는다. 따라서 Dashboard 실행 API, 로그 표시, allow-list, project 검증, timeout, concurrency lock을 먼저 검증하기에 적합하다.

반면 `sync:posts`나 full `publish:posts`는 발행본을 바꿀 수 있다. 이 기능은 diff preview와 예상 변경 파일 목록이 더 정교해진 뒤에 넣어야 한다. v1.3에서 실행 기반을 먼저 분리하면, v1.4의 safe edit이나 이후 sync 실행을 붙일 때 위험을 작게 만들 수 있다.

## 아키텍처

v1.3은 Dashboard 서버에 작은 runner endpoint와 runner 모듈을 추가한다.

```text
Browser
  |
  | POST /api/runner/run
  | { action: "validate-source", project: "sigak" }
  v
scripts/blog-ops-dashboard.mjs
  |
  | validate request body
  | reject unknown action/project
  v
scripts/blog-ops/action-runner.mjs
  |
  | map action key to fixed command argv
  | spawn without shell
  | capture exit code/stdout/stderr
  v
npm run validate:posts -- --source --project sigak
```

### 서버 책임

`scripts/blog-ops-dashboard.mjs`는 HTTP 경계만 담당한다.

- `GET /api/inventory`
- `GET /api/runner/preflight?project=<project>`
- `POST /api/runner/run`
- JSON body parse
- body size limit
- HTTP status code 변환
- 한 번에 하나의 action만 실행되도록 lock 적용

### Runner 책임

`scripts/blog-ops/action-runner.mjs`는 실행 정책을 담당한다.

- action allow-list 정의
- project slug 검증
- command argv 생성
- `child_process.spawn` 실행
- `shell: false` 유지
- timeout 처리
- stdout/stderr 길이 제한
- exit code와 next action 생성

서버는 request body에서 command 문자열을 받지 않는다. request body에는 action key와 project slug만 들어간다.

## API 설계

### `GET /api/runner/preflight?project=<project>`

선택한 Folder에서 action을 실행할 수 있는지 보여준다.

응답 예시:

```json
{
  "project": "sigak",
  "canRun": true,
  "warnings": [
    {
      "code": "blog-repo-dirty",
      "message": "Blog repo has local changes. Non-mutating actions can run, but review the diff before sync or PR."
    }
  ],
  "actions": [
    {
      "key": "validate-source",
      "label": "Validate source",
      "command": "npm run validate:posts -- --source --project sigak",
      "mutatesFiles": false
    },
    {
      "key": "publish-dry-run",
      "label": "Publish dry-run",
      "command": "npm run publish:posts -- --project sigak --dry-run",
      "mutatesFiles": false
    }
  ]
}
```

`All Folders` 상태에서는 project가 없으므로 `canRun: false`를 반환한다.

```json
{
  "project": "",
  "canRun": false,
  "warnings": [
    {
      "code": "project-required",
      "message": "Select one Folder before running actions."
    }
  ],
  "actions": []
}
```

### `POST /api/runner/run`

허용된 action 하나를 실행한다.

요청:

```json
{
  "action": "validate-source",
  "project": "sigak"
}
```

성공 응답:

```json
{
  "action": "validate-source",
  "project": "sigak",
  "command": "npm run validate:posts -- --source --project sigak",
  "exitCode": 0,
  "status": "success",
  "stdout": "Validated 18 source posts for sigak.",
  "stderr": "",
  "startedAt": "2026-06-06T10:30:00.000Z",
  "endedAt": "2026-06-06T10:30:01.000Z",
  "nextAction": "Source posts are valid. You can run publish dry-run next."
}
```

실패 응답:

```json
{
  "action": "validate-source",
  "project": "sigak",
  "command": "npm run validate:posts -- --source --project sigak",
  "exitCode": 1,
  "status": "failed",
  "stdout": "",
  "stderr": "Error: src post has an invalid tag 'Demo'.",
  "startedAt": "2026-06-06T10:30:00.000Z",
  "endedAt": "2026-06-06T10:30:01.000Z",
  "nextAction": "Fix the source post frontmatter or editorial warnings before syncing."
}
```

## Dirty state 정책

v1.3의 두 action은 파일을 변경하지 않는다. 따라서 dirty state가 있어도 실행을 무조건 막지는 않는다.

대신 Dashboard는 dirty state를 명확히 표시한다.

| 상태 | v1.3 동작 |
| --- | --- |
| blog repo clean | 정상 실행 |
| blog repo dirty | 실행 허용, warning 표시 |
| source repo clean | 정상 실행 |
| source repo dirty | 실행 허용, warning 표시 |
| project source path missing | 실행 차단 |
| project가 `posts.config.yml`에 없음 | 실행 차단 |

source repo dirty 상태는 원본 글을 수정한 뒤 validation을 돌릴 때 자연스럽게 발생할 수 있다. 이를 차단하면 Dashboard의 목적과 충돌한다. 다만 이후 `sync:posts`, full `publish:posts`, PR assistant 같은 파일 변경 action은 dirty state를 차단 조건으로 다시 다룬다.

## 실행 안전장치

### allow-list

명령은 action key에서만 생성한다.

```js
const ACTIONS = {
  "validate-source": {
    command: "npm",
    args: ["run", "validate:posts", "--", "--source", "--project", project],
  },
  "publish-dry-run": {
    command: "npm",
    args: ["run", "publish:posts", "--", "--project", project, "--dry-run"],
  },
};
```

request body에 command, args, cwd를 받지 않는다.

### project 검증

project는 `posts.config.yml`의 `sources[].project`와 `src/data/projects.json`에 등록된 slug만 허용한다.

검증 실패 시 실행하지 않고 `400`을 반환한다.

### shell 금지

`child_process.spawn(command, args, { shell: false })`를 사용한다.

문자열 command를 shell에 넘기지 않으므로 `;`, `&&`, backtick, redirect 같은 shell injection이 동작하지 않는다.

### timeout

기본 timeout은 60초다.

timeout이 발생하면 process를 종료하고 status를 `timed-out`으로 반환한다. v1.3의 action은 원래 짧아야 하므로, 긴 실행이 필요하면 이후 단계에서 별도 설계한다.

### 출력 제한

stdout과 stderr는 각각 마지막 32KB만 반환한다.

검증 실패 원인은 보이되, 지나치게 긴 로그가 Dashboard를 망가뜨리거나 브라우저 메모리를 과도하게 쓰지 않게 한다.

### 동시 실행 제한

v1.3은 한 번에 하나의 action만 실행한다.

이미 실행 중이면 `409`를 반환한다.

```json
{
  "error": "runner-busy",
  "message": "Another Blog Ops action is already running."
}
```

## UI 설계

Action Runner Preview 패널은 `Controlled Runner` 패널로 확장한다.

### Folder 선택 전

- 버튼 비활성화
- "Folder를 하나 선택하면 실행할 수 있습니다" 표시
- copy command도 표시하지 않거나 비활성화

### Folder 선택 후

표시 항목:

- 선택된 Folder slug
- preflight warnings
- `Validate source` 버튼
- `Publish dry-run` 버튼
- 기존 copy command 버튼
- 최근 실행 로그
- exit code
- next action

### 실행 중

- 실행 중인 버튼 disabled
- 다른 runner 버튼 disabled
- status: `Running`
- 간단한 loading indicator 표시

### 실행 완료

성공:

- status: `Passed`
- stdout 일부 표시
- next action 표시

실패:

- status: `Failed`
- stderr 일부 표시
- next action 표시

timeout:

- status: `Timed out`
- "명령이 예상보다 오래 걸렸습니다. 터미널에서 직접 실행해 원인을 확인하세요." 표시

## Smart View와 Runner 범위

Smart View는 글 목록을 보기 좋게 줄이는 필터다.

Runner는 Smart View를 따르지 않는다. Runner는 항상 선택한 Folder 전체를 대상으로 한다.

예를 들어 `Sigak + Dev Logs` Smart View에서 `Validate source`를 눌러도, 실행되는 명령은 아래와 같다.

```bash
npm run validate:posts -- --source --project sigak
```

이는 Sigak source folder 전체를 검증한다. Smart View subset만 검증하는 명령은 v1.3에서 제공하지 않는다.

## 에러와 다음 행동 문구

| 실패 지점 | next action |
| --- | --- |
| unknown action | "Dashboard가 허용하지 않는 action입니다. UI와 서버 allow-list를 확인하세요." |
| unknown project | "`posts.config.yml`과 `projects.json`에 Folder가 등록되어 있는지 확인하세요." |
| source path missing | "프로젝트 source path가 존재하는지 확인하세요." |
| runner busy | "현재 실행 중인 action이 끝난 뒤 다시 시도하세요." |
| validate-source failed | "원본 글의 frontmatter, tag, editorial warning을 먼저 고치세요." |
| publish-dry-run failed | "dry-run이 실패한 단계의 로그를 보고 source validation, sync 경로, test/build 설정을 확인하세요." |
| timeout | "터미널에서 같은 명령을 직접 실행해 오래 걸리는 지점을 확인하세요." |

## 테스트 전략

### runner module 테스트

새 파일 `scripts/blog-ops-action-runner.test.mjs`를 추가한다.

검증할 것:

- allow-list에 없는 action은 실행하지 않는다.
- 알 수 없는 project는 실행하지 않는다.
- `validate-source`가 정확한 argv로 spawn된다.
- `publish-dry-run`이 정확한 argv로 spawn된다.
- request가 command 문자열을 포함해도 무시된다.
- timeout이면 `timed-out` 결과를 반환한다.
- stdout/stderr가 32KB로 제한된다.

테스트에서는 실제 npm 명령을 실행하지 않는다. `spawnRunner`에 fake spawn 함수를 주입해 command와 args를 검증한다.

### dashboard server 테스트

`scripts/blog-ops-dashboard.test.mjs`에 API 테스트를 추가한다.

검증할 것:

- `GET /api/runner/preflight?project=sigak`가 action 목록을 반환한다.
- `POST /api/runner/run`이 unknown action을 `400`으로 거부한다.
- `POST /api/runner/run`이 project 없는 요청을 `400`으로 거부한다.
- runner가 실행 중이면 두 번째 요청을 `409`로 거부한다.

### dashboard template 테스트

기존 template 테스트를 확장한다.

검증할 것:

- direct arbitrary shell input이 없다.
- `data-run-action="validate-source"`가 존재한다.
- `data-run-action="publish-dry-run"`이 존재한다.
- `Copy dry-run`과 `Copy publish`는 유지된다.
- All Folders 상태에서는 실행 안내가 비활성화된다.
- 로그 패널 markup이 존재한다.

## 구현 파일

예상 변경 파일:

- `scripts/blog-ops/action-runner.mjs`
  - allow-list, preflight, run action 구현
- `scripts/blog-ops-dashboard.mjs`
  - `/api/runner/preflight`
  - `/api/runner/run`
  - JSON body parsing
  - single-run lock
- `scripts/blog-ops-dashboard-template.html`
  - runner buttons
  - preflight warning
  - run result log panel
  - disabled/running state
- `scripts/blog-ops-dashboard.test.mjs`
  - endpoint and template tests
- `scripts/blog-ops-action-runner.test.mjs`
  - runner module unit tests
- `docs/next-actions.md`
  - v1.3 진행 상태 기록
- `docs/roadmap.md`
  - v1.3 완료 후 phase 상태 갱신

## v1.4와의 경계

v1.4는 Safe Edit 단계로 둔다.

v1.4 후보:

- source post frontmatter 읽기
- `draft` 토글
- `title`, `summary`, `tags` 수정
- 수정 전 diff preview
- 저장 후 `validate-source` 자동 실행

v1.3에서 만든 runner API는 v1.4의 검증 단계에 재사용할 수 있다. 하지만 v1.4의 파일 수정 endpoint는 별도 설계가 필요하다. runner endpoint가 파일 수정까지 담당하지 않는다.

## 완료 기준

v1.3은 아래 조건을 만족하면 완료로 본다.

- Dashboard에서 Folder 하나를 선택하면 `Validate source`와 `Publish dry-run` 버튼이 보인다.
- 버튼 클릭 시 서버가 allow-list action만 실행한다.
- unknown action, unknown project, All Folders 실행이 차단된다.
- 실행 결과가 로그 패널에 표시된다.
- 실패 결과와 next action이 분리되어 표시된다.
- Smart View를 선택해도 Runner는 Folder 전체 기준으로 실행된다.
- 임의 shell command 입력 UI가 없다.
- `npm test`가 통과한다.
- `npm run validate:posts`가 통과한다.
- `npm run build`가 통과한다.

## 설계 self-review

- Placeholder 없음: v1.3에서 실행할 action 두 개, API, error, 테스트 범위를 모두 명시했다.
- Scope 분리: 파일을 변경하는 sync, full publish, frontmatter edit은 v1.3에서 제외했다.
- 기존 정책과 일관성: Runner 범위는 v1.2와 같이 Folder 기준이며 Smart View subset을 따르지 않는다.
- 안전성: request body command 실행을 금지하고, action key 기반 allow-list와 `shell: false`를 명시했다.
- v1.4 연결: v1.4는 Safe Edit로 분리하고, v1.3 runner는 저장 후 검증 단계에만 재사용하도록 경계를 정했다.
