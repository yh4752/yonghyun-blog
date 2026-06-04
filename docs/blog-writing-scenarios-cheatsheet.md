# 블로그 작성 시나리오와 치트시트

이 문서는 `technical-blog-learning-writer` 루틴을 `yonghyun-blog`, Sigak, 앞으로의 다른 프로젝트에 반복 적용하기 위한 운영 치트시트다.

목표는 글을 빨리 발행하는 것만이 아니다. AI가 도운 구현과 글을 내가 다시 읽고, 질문하고, 검증해서 면접과 포트폴리오에서 설명할 수 있는 상태로 만드는 것이다.

## 전체 구조

이 블로그 시스템에는 세 종류의 파일이 있다.

| 종류 | 위치 | 공개 여부 | 역할 |
| --- | --- | --- | --- |
| 원본 글 | `<project>/docs/blog/*.md` | 프로젝트 저장소 정책에 따름 | 실제 작성 원본 |
| 발행본 | `yonghyun-blog/src/content/blog/<project>/*.md` | 공개 | Astro가 렌더링하는 블로그 글 |
| 개인 답변 노트 | `yonghyun-blog/docs/interview-notes/private/<project>/*.md` | 비공개 | 면접/포트폴리오 준비용 첫 답변과 복습 노트 |

원칙은 하나다.

```txt
원본 글을 고친다
  -> source 검증을 한다
  -> 질문 세트와 개인 답변 노트를 만든다
  -> draft: false로 바꾼다
  -> sync로 발행본을 만든다
  -> published 검증, 테스트, 빌드를 통과시킨다
```

`src/content/blog/<project>` 아래의 발행본을 직접 고치지 않는다. 발행본을 고치고 싶으면 원본 글을 고친 뒤 다시 `sync:posts`를 실행한다.

## 언제 이 루틴을 쓰는가

이 루틴은 아래 상황에서 쓴다.

- 설계 선택을 설명해야 하는 글
- 버그 개선, 성능 개선, 배포/검증 흐름처럼 판단 근거가 중요한 글
- AI가 구현이나 글쓰기를 도왔고, 내가 그 내용을 다시 설명할 수 있어야 하는 글
- 면접에서 "왜 그렇게 했나요?"라는 질문을 받을 수 있는 글
- Sigak처럼 프로젝트 맥락과 기술 결정이 포트폴리오에 중요하게 보이는 글

아래 상황에서는 가볍게 써도 된다.

- 단순 dev-log
- 작은 UI 문구 수정
- 깊은 설계 판단이 없는 작업 기록

작은 글에 억지로 full hybrid 구조를 붙이지 않는다.

## 기본 체크리스트

글 하나를 발행할 때마다 아래 순서로 본다.

- [ ] 원본 글이 어느 프로젝트의 `docs/blog`에 있는지 확인한다.
- [ ] `project` 값이 `posts.config.yml`과 `src/data/projects.json`에 등록되어 있는지 확인한다.
- [ ] `title`, `date`, `type`, `project`, `tags`, `summary`, `draft`를 채운다.
- [ ] `summary`는 80-160자 범위에 가깝게 쓴다.
- [ ] `tags`는 `src/data/tags.json`의 허용 목록에서 고른다.
- [ ] 글에 문제, 선택지, 결정, 검증, 트레이드오프가 있는지 확인한다.
- [ ] `면접에서 설명할 수 있어야 할 질문`을 5-8개 남긴다.
- [ ] 개인 답변 노트에 첫 답변을 남긴다.
- [ ] 이해가 안 되는 부분은 질문으로 되돌린다.
- [ ] 발행 전 실제 명령으로 검증한다.

## 스킬 호출 치트시트

새 글이나 기존 글을 학습형으로 다듬을 때는 이렇게 요청한다.

```txt
$technical-blog-learning-writer로
<원본 글 경로>
이 글을 hybrid 모드로 검토하자.
목표는 공개 글 보강, 면접 질문 세트, 개인 답변 노트 생성이야.
```

Sigak 예시:

```txt
$technical-blog-learning-writer로
/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md
이 글을 hybrid 모드로 검토하자.
Sigak의 검색/RAG 프로젝트 맥락이 유지되는지 보고,
면접에서 설명할 질문과 개인 답변 노트까지 만들자.
```

새 프로젝트 예시:

```txt
$technical-blog-learning-writer로
/Users/yonghyun/my-projects/<new-project>/docs/blog/<post>.md
이 글을 hybrid 모드로 검토하자.
프로젝트 맥락, 선택 이유, 검증 근거, 트레이드오프를 보강하고 싶어.
```

좋은 요청에는 네 가지가 들어간다.

| 입력 | 예시 |
| --- | --- |
| `project` | `sigak`, `yonghyun-blog`, `<new-project>` |
| `sourcePost` | `/Users/yonghyun/my-projects/sigak/docs/blog/...md` |
| `mode` | `hybrid` |
| `goal` | 학습, 면접 대비, 포트폴리오 설득력 |

## 시나리오 1: Sigak 기존 글을 학습형으로 다듬기

이미 있는 Sigak 글을 더 좋은 포트폴리오 글로 바꾸는 경우다.

예시 대상:

```txt
/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md
```

진행 순서:

1. Sigak 원본 글을 읽는다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
sed -n '1,220p' /Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md
```

2. 스킬로 글의 decision skeleton을 뽑는다.

```txt
$technical-blog-learning-writer로
/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md
이 글을 hybrid 모드로 검토하자.
```

3. 공개 글에서 보강할 부분을 확인한다.

확인할 질문:

- 이 글의 문제는 명확한가?
- 왜 SchemaSpy를 도입했는가?
- 다른 선택지는 있었는가?
- DB 문서화가 Sigak의 검색/RAG 구조와 어떻게 연결되는가?
- 실제 검증 명령이나 산출물이 있는가?

4. 개인 답변 노트를 만든다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
mkdir -p docs/interview-notes/private/sigak
cp docs/interview-notes/templates/article-answer-note.md \
  docs/interview-notes/private/sigak/2026-05-28-schemaspy-adoption.md
```

5. 개인 답변 노트에는 먼저 거친 답변을 쓴다.

좋은 첫 답변은 완벽한 문장이 아니다.

```txt
SchemaSpy를 쓴 이유는 DB 구조를 사람이 보기 쉽게 만들고,
검색/RAG projection을 설계할 때 source of truth 구조를 확인하기 위해서다.
아직 SchemaSpy가 Flyway와 어떻게 연결되는지는 더 정리해야 한다.
```

6. 원본 글을 수정한다.

Sigak 원본 글을 고친다.

```txt
/Users/yonghyun/my-projects/sigak/docs/blog/2026-05-28-schemaspy-adoption.md
```

발행본인 아래 파일을 직접 고치지 않는다.

```txt
src/content/blog/sigak/2026-05-28-schemaspy-adoption.md
```

7. source 검증을 실행한다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
npm run validate:posts -- --source --project sigak
```

8. 발행하려면 원본 글을 `draft: false`로 둔 뒤 sync한다.

```bash
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

9. 커밋 경계를 나눈다.

Sigak 원본 글을 고쳤다면 Sigak 저장소에서 커밋한다.

```bash
cd /Users/yonghyun/my-projects/sigak
git status
git add docs/blog/2026-05-28-schemaspy-adoption.md
git commit -m "docs: refine SchemaSpy adoption post"
```

블로그 발행본과 운영 문서를 고쳤다면 `yonghyun-blog` 저장소에서 커밋한다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
git status
git add src/content/blog/sigak/2026-05-28-schemaspy-adoption.md
git commit -m "docs: publish refined Sigak SchemaSpy post"
```

## 시나리오 2: Sigak 새 글을 만들기

새로운 Sigak 글을 처음부터 만드는 경우다.

1. 블로그 허브에서 `new:post`를 실행한다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
npm run new:post -- \
  --project sigak \
  --type deep-dive \
  --title "Qdrant Vector Search Projection을 internal API로 먼저 만든 이유"
```

이 명령은 `posts.config.yml`의 Sigak source path를 읽어서 아래 위치에 원본 글을 만든다.

```txt
/Users/yonghyun/my-projects/sigak/docs/blog/<date>-qdrant-vector-search-projection을-internal-api로-먼저-만든-이유.md
```

2. frontmatter를 채운다.

예시:

```yaml
---
title: "Qdrant Vector Search Projection을 internal API로 먼저 만든 이유"
date: "2026-06-02"
type: "architecture"
project: "sigak"
tags: ["Search", "Qdrant", "Vector Search", "Architecture"]
summary: "Sigak에서 Qdrant vector search projection을 사용자 기능보다 internal API로 먼저 만든 이유와 검증 기준을 정리합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-06-02-qdrant-vector-search-projection.md"
relatedPosts: ["sigak/2026-05-27-dev-log"]
---
```

3. 처음에는 `draft: true`로 둔다.

초안 상태에서도 source 검증은 한다.

```bash
npm run validate:posts -- --source --project sigak
```

4. 스킬을 호출한다.

```txt
$technical-blog-learning-writer로
/Users/yonghyun/my-projects/sigak/docs/blog/<post>.md
이 글을 hybrid 모드로 작성하자.
```

5. 글의 뼈대는 아래 순서로 채운다.

```md
> 한 줄 요약:

## 문제
## 제약
## 선택지
## 결정
## 구현 구조
## 트레이드오프
## 검증
## 내가 이해한 것
## Codex에게 맡긴 것과 내가 검토한 것
## 코드에서 다시 볼 지점
## 면접에서 설명할 수 있어야 할 질문
```

6. 발행 준비가 되면 `draft: false`로 바꾼다.

7. 블로그 허브에서 sync와 검증을 실행한다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

## 시나리오 3: yonghyun-blog 자체 글을 만들기

`yonghyun-blog` 프로젝트 자체의 글은 원본도 이 저장소 안에 있다.

1. 새 글을 만든다.

```bash
cd /Users/yonghyun/my-projects/yonghyun-blog
npm run new:post -- \
  --project yonghyun-blog \
  --type deep-dive \
  --title "발행 자동화에서 source mode와 published mode를 나눈 이유"
```

2. 원본 위치를 확인한다.

```txt
docs/blog/<date>-발행-자동화에서-source-mode와-published-mode를-나눈-이유.md
```

3. 스킬을 호출한다.

```txt
$technical-blog-learning-writer로
/Users/yonghyun/my-projects/yonghyun-blog/docs/blog/<post>.md
이 글을 hybrid 모드로 검토하자.
```

4. 개인 답변 노트는 아래 위치에 둔다.

```txt
docs/interview-notes/private/yonghyun-blog/<post-slug>.md
```

5. 발행할 때는 같은 저장소에서 sync한다.

```bash
npm run validate:posts -- --source --project yonghyun-blog
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

## 시나리오 4: 새 프로젝트를 블로그 생태계에 등록하기

새 프로젝트가 생기면 먼저 블로그 허브가 그 프로젝트의 글을 읽을 수 있게 등록한다.

예시 프로젝트:

```txt
/Users/yonghyun/my-projects/my-new-project
```

1. 먼저 dry-run으로 무엇이 바뀌는지 확인한다.

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL"
```

확인할 것:

- `docs/blog`를 만들 위치가 맞는가?
- `posts.config.yml`에 들어갈 source path가 `${HOME}` 기반인가?
- `src/data/projects.json`에 들어갈 description과 stack이 괜찮은가?
- slug가 소문자 케밥 케이스인가? 예: `my-new-project`

2. dry-run 출력이 맞으면 `--write`로 적용한다.

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL" \
  --write
```

이 명령은 아래 작업을 한 번에 처리한다.

- 새 프로젝트의 `docs/blog` 생성
- `docs/blog/README.md` 생성
- `docs/blog/topic-queue.md` 생성
- `posts.config.yml`에 source 추가
- `src/data/projects.json`에 프로젝트 메타데이터 추가

기존 `README.md`나 `topic-queue.md`가 파일로 있으면 덮어쓰지 않는다. 디렉터리로 있으면 파일을 만들 수 없으므로 실패한다.

3. 첫 글까지 같이 만들고 싶으면 `--with-first-post`를 사용한다.

```bash
npm run init:project -- \
  --slug my-new-project \
  --name "My New Project" \
  --path "${HOME}/my-projects/my-new-project" \
  --description "One sentence that explains the project and its technical focus." \
  --stack "Spring Boot,PostgreSQL" \
  --with-first-post \
  --template decision \
  --post-type architecture \
  --title "프로젝트 시작 구조를 이렇게 잡은 이유" \
  --write
```

템플릿은 세 가지다.

| template | 용도 |
| --- | --- |
| `dev-log` | 하루 개발 기록 |
| `decision` | 설계 선택과 트레이드오프 기록 |
| `learning` | 개념 학습과 면접 질문 중심 기록 |

4. 필요한 tag가 없다면 먼저 tag intake 기준을 통과하는지 확인한다.

주의:

- 같은 의미의 tag를 중복해서 만들지 않는다.
- `Backend`, `backend`, `BE`처럼 갈라지지 않게 한다.
- 특정 글의 상황 표현은 tag로 만들지 않고 제목이나 본문에 둔다.
- 새 tag를 추가하면 `src/data/tags.json`과 문서를 함께 갱신한다.

5. source 검증으로 등록이 맞는지 확인한다.

```bash
npm run validate:posts -- --source --project my-new-project
```

아직 글이 없으면 `No source posts to validate.`가 나올 수 있다. 프로젝트 등록 자체는 이후 첫 글을 만들면서 다시 확인한다.

## 시나리오 5: 개인 답변 노트만 먼저 만들기

글은 이미 공개됐지만 면접 대비가 부족한 경우다.

1. 공개 글의 질문 섹션을 확인한다.

```bash
sed -n '/## 면접에서 설명할 수 있어야 할 질문/,$p' \
  src/content/blog/<project>/<post>.md
```

2. 개인 답변 노트를 만든다.

```bash
mkdir -p docs/interview-notes/private/<project>
cp docs/interview-notes/templates/article-answer-note.md \
  docs/interview-notes/private/<project>/<post-slug>.md
```

3. 각 질문마다 아래 순서로 채운다.

```txt
첫 답변
  -> 지금 내 말로 거칠게 답한다.

부족한 개념
  -> 빠진 개념과 불안한 지점을 적는다.

코드/문서 근거
  -> 다시 볼 파일을 체크한다.

면접용 30-60초 답변
  -> 자연스럽게 말할 수 있는 답변으로 다듬는다.

꼬리 질문 대비
  -> 바로 이어질 질문을 적는다.
```

4. 공개 글을 바로 고치지 않아도 된다.

개인 답변 노트는 학습 공간이다. 답변이 안정되면 그때 공개 글의 `내가 이해한 것`, `코드에서 다시 볼 지점`, `면접에서 설명할 수 있어야 할 질문`을 보강한다.

## 명령어 치트시트

### 새 글 생성

```bash
npm run new:post -- --project sigak --type dev-log
npm run new:post -- --project sigak --type deep-dive --title "제목"
npm run new:post -- --project yonghyun-blog --type architecture --title "제목"
```

### 원본 글 검증

```bash
npm run validate:posts -- --source --project sigak
npm run validate:posts -- --source --project yonghyun-blog
npm run validate:posts -- --source --project <project>
```

### 발행본 생성과 검증

```bash
npm run sync:posts
npm run validate:posts
npm test
npm run build
```

### 전체 발행 전 권장 순서

```bash
npm run publish:posts -- --project <project>
```

위 명령은 source 검증, 해당 프로젝트 sync, published 검증, 테스트, 빌드를 순서대로 실행한다.

### 발행본 삭제

원본 글을 삭제하거나 `draft: true`로 바꾼 뒤 sync한다.

```bash
npm run sync:posts
npm run validate:posts
npm run build
```

## frontmatter 치트시트

```yaml
---
title: "글 제목"
date: "2026-06-02"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Qdrant", "Architecture"]
summary: "80자에서 160자 사이로 글의 문제와 결정을 함께 요약합니다."
featured: false
draft: true
canonicalProjectPath: "docs/blog/2026-06-02-post-slug.md"
relatedPosts: ["sigak/2026-05-27-dev-log"]
---
```

필드별 기준:

| 필드 | 기준 |
| --- | --- |
| `title` | 목록과 상세 페이지에 보이는 제목 |
| `date` | 글 작성일 또는 발행 기준일 |
| `type` | `dev-log`, `deep-dive`, `debugging`, `architecture`, `performance`, `research` |
| `project` | `posts.config.yml`과 `src/data/projects.json`에 등록된 slug |
| `tags` | `src/data/tags.json`의 허용 목록 |
| `summary` | 목록과 SEO에 쓰이는 요약 |
| `draft` | 작성 중 `true`, 발행 시 `false` |
| `canonicalProjectPath` | 원본 프로젝트 기준 상대 경로 |
| `relatedPosts` | `project/slug` 형식 |

## 글 구조 치트시트

### deep-dive

```md
> 한 줄 요약:

## 문제

## 제약

## 선택지

## 결정

## 구현 구조

## 트레이드오프

## 검증

## 내가 이해한 것

## Codex에게 맡긴 것과 내가 검토한 것

## 코드에서 다시 볼 지점

## 면접에서 설명할 수 있어야 할 질문
```

### dev-log

```md
## 오늘 한 일

## 결정과 이유

## 막힌 점

## 검증

## 다음 단계
```

dev-log는 매번 full deep-dive 구조를 쓰지 않아도 된다. 하지만 설계 판단이 있으면 `결정과 이유`, `검증`, `다음 단계`는 남긴다.

## 질문 세트 치트시트

글 마지막 질문은 아래에서 고른다.

- 이 작업이 없었다면 어떤 문제가 생겼는가?
- 왜 이 도구나 구조를 선택했는가?
- 선택하지 않은 대안은 무엇이고, 왜 미뤘는가?
- 검증이 실제로 증명한 것은 무엇인가?
- 테스트가 보장하지 못하는 부분은 무엇인가?
- 이 결정의 트레이드오프는 무엇인가?
- AI가 도운 부분 중 내가 직접 검토한 것은 무엇인가?
- 다시 코드를 볼 때 가장 먼저 봐야 할 파일은 무엇인가?
- 면접에서 30-60초로 설명한다면 어떻게 말할 것인가?

## 오류가 났을 때

### 허용되지 않은 tag

증상:

```txt
허용되지 않은 tag '...'가 있습니다.
```

처리:

1. 기존 허용 tag로 바꿀 수 있는지 본다.
2. 새 tag 후보라면 아래 질문을 확인한다.
   - 앞으로 2개 이상의 글이나 프로젝트에서 반복될까?
   - 독자가 이 tag로 글을 찾아볼 이유가 있을까?
   - 기존 tag와 의미가 겹치지 않을까?
   - 특정 글의 상황 표현이 아니라 지속 가능한 주제일까?
3. 기준을 통과하면 `src/data/tags.json`에 추가한다.
4. 문서의 허용 tag 목록과 tag intake 예시도 갱신한다.

예시:

- `Collection`, `Evaluation`, `Tooling`: 반복될 수 있는 범주라면 허용한다.
- `Demo`: 상황 표현에 가까우므로 보통 `Testing`이나 `Documentation`으로 치환한다.

### project가 없다는 오류

증상:

```txt
project '<project>'가 posts.config.yml과 src/data/projects.json 양쪽에 있어야 합니다.
```

처리:

1. `posts.config.yml`에 source가 있는지 확인한다.
2. `src/data/projects.json`에 metadata가 있는지 확인한다.
3. 글의 `project` 값 오타를 확인한다.

### summary warning

증상:

```txt
summary 길이가 80-160자 범위를 벗어납니다.
```

처리:

- warning이라 발행이 막히지는 않는다.
- 그래도 목록과 SEO에 보이는 문장이므로 가능하면 수정한다.

### deep-dive 검증 섹션 warning

증상:

```txt
deep-dive 글에 '## 검증' 섹션이 없습니다.
```

처리:

- 실제로 실행한 명령을 적는다.
- 실행하지 않았다면 `미검증`이라고 쓴다.

## 최종 발행 체크

발행 직전 아래 명령을 통과해야 한다.

```bash
npm run publish:posts -- --project <project>
```

통과 후 확인할 것:

- [ ] 새 글 URL이 `/blog/<project>/<slug>`로 생성되는가?
- [ ] `draft: false`인가?
- [ ] 원본과 발행본이 같은 내용인가?
- [ ] 개인 답변 노트가 public content에 섞이지 않았는가?
- [ ] 검증 결과를 글에 적었다면 실제 실행 결과와 일치하는가?
- [ ] AI가 도운 부분과 내가 검토한 기준이 분리되어 있는가?

## 운영 원칙

- 빠른 발행보다 설명 가능한 발행을 우선한다.
- 원본과 발행본을 섞지 않는다.
- 개인 답변은 공개 저장소에 올리지 않는다.
- AI 도움은 숨기지 않는다.
- 대신 내가 무엇을 검토했고 어떤 기준으로 받아들였는지 남긴다.
- 모르는 것은 질문으로 남기고, 질문에 답한 뒤 글을 다듬는다.
