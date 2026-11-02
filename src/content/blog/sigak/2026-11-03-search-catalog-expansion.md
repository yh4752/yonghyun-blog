---
title: "검색 대상이 6개에서 41개로 늘어도 평가가 끝나지 않는 이유"
date: "2026-11-03"
type: "research"
project: "sigak"
tags: ["Evaluation", "Search", "Testing", "Tooling", "PostgreSQL"]
summary: "6개 기사 smoke catalog를 보존한 채 41개 기사 snapshot을 만들었습니다. 기사 수와 검토한 질문 수를 구분하고, catalog·label·실행 대상이 맞아야 하는 이유와 현재 자동 검증의 빈틈을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-search-catalog-expansion.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-11-03-strict-hybrid-public-search-evaluation", "sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection"]
---

# 검색 대상이 6개에서 41개로 늘어도 평가가 끝나지 않는 이유

> 검색할 기사 목록과 정답을 판정한 질문 집합은 별도로 늘려야 한다. 새 catalog를 만들면서 이전 결과를 보존하고, 새 라벨을 검토하기 전에는 확장 품질 평가를 진행하지 않았다.

## 기사 41개는 평가 질문 41개가 아니다

Sigak의 첫 검색 평가에는 기사 6개의 frozen catalog와 사람이 검토한 질문 3개가 있었다. 이 조합은 라벨을 읽고 검색을 실행해 지표와 보고서를 만드는 흐름을 확인하는 데 쓸 수 있었다. 다양한 검색 의도를 대표하는 근거로 쓰기에는 작았다.

2026-06-05에는 PostgreSQL에 있던 공개 가능한 기사를 export해 41개짜리 catalog를 만들었다. 여기서 늘어난 것은 **검색과 라벨링의 대상 기사 목록**이다. 새 질문의 관련도 판정이 함께 늘어난 것은 아니다. 기존 라벨은 여전히 3개 질문과 12개 명시적 기사 판정으로 이뤄진 별도 파일이다. 12개 판정은 질문·기사 쌍의 수이며, 서로 다른 기사 12개나 질문 12개를 뜻하지 않는다.

작은 결과를 더 큰 평가로 옮기려면 두 가지를 준비해야 한다. 후보에 비슷한 주제의 다른 글이 늘어야 검색이 그 차이를 구분하는지 살펴볼 수 있다. 질문과 정답 후보도 사람이 검토해야 무엇을 잘 찾았는지 판정할 수 있다. 어느 한쪽의 개수만 늘려서는 평가를 완성하지 못한다.

## 기존 파일을 덮어쓰는 대신 새 snapshot을 만들었다

당시에는 이미 API-ready 기사 export 명령이 있었다. [확장 설계](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-05-catalog-expansion-design.md)는 새 수집 기능이나 새 모델을 만드는 대신 이 명령으로 현재 DB 상태를 고정하는 범위를 택했다.

| 선택 | 편한 점 | 남는 문제 |
| --- | --- | --- |
| 기존 catalog를 새 목록으로 교체 | 파일 하나만 유지 | 기존 라벨·결과가 어느 기사 목록의 것인지 흐려짐 |
| 평가할 때마다 live API 목록 사용 | 최신 글을 즉시 반영 | 실행 사이에 기사 집합이 바뀜 |
| 날짜와 ID를 가진 새 catalog 보관 | 이전 기준과 확장 기준을 비교 가능 | 파일·라벨·결과의 대응 관계를 관리해야 함 |

세 번째 방식을 사용했다. 평가에서는 원본 DB와 검색 사본을 구분하는 데 더해 **어느 시점의 기사 집합인가**도 정해야 한다. catalog는 라벨을 붙일 대상을 고정한 평가 자료이며 운영 DB를 대신하지 않는다.

| 항목 | 기존 smoke | 확장 준비 |
| --- | --- | --- |
| `catalogId` | `api-ready-2026-06-02` | `api-ready-2026-06-05` |
| 기사 수 | 6 | 41 |
| catalog 파일 | `articles.catalog.json` | `articles.catalog.api-ready-2026-06-05.json` |
| reviewed 질문 | 3개 라벨 파일 존재 | 대응하는 확장 라벨은 후속 작업 |
| 결과 위치 | retrieval·graph의 `latest/` | 향후 `expanded/`에 먼저 저장하는 계획 |

`expanded/`는 확장 결과가 이미 생성됐다는 뜻이 아니다. 새 라벨과 실행 결과가 검증되기 전 기존 `latest/`를 덮어쓰지 않기 위한 저장 계획이다.

## 공개 가능한 기사를 읽는 경계를 재사용했다

[SearchCatalogArticleReader](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/search/evaluation/catalog/SearchCatalogArticleReader.kt)는 `ArticleService.getArticles(null)`을 호출한다. catalog export가 자체 SQL로 공개 가능 조건을 다시 정의하지 않고 기사 서비스의 경계를 재사용한 것이다.

[SearchCatalogFactory](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/search/evaluation/catalog/SearchCatalogFactory.kt)는 읽은 목록에서 지정한 limit만큼 선택하고, 빈 목록은 실패로 처리한다. catalog에는 버전, 식별자, 생성 시각, 출처와 기사 정보를 넣는다. 이 흐름은 최신 DB가 달라지면 같은 명령이라도 내용과 개수가 달라질 수 있음을 뜻한다. 파일과 식별자를 함께 보관해야 하는 이유다.

2026-06-05의 실행 명령은 다음과 같았다. 과거 자료를 만든 명령이며, 현재 실행하면 당시의 41개를 복원하는 명령은 아니다.

```bash
cd backend
./gradlew bootRun --args='search-catalog-export --output=../experiments/datasets/raw/articles.catalog.api-ready-2026-06-05.json --limit=50 --catalog-id=api-ready-2026-06-05'
```

실제 출력의 `articleCount`는 41이었다. 앞선 projection smoke에서 기사 26개를 봤더라도 export 결과가 같다고 가정하지 않았다. export에서 읽은 개수를 기록했다. 생성물은 [확장 catalog 파일](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/datasets/raw/articles.catalog.api-ready-2026-06-05.json)에서 확인할 수 있다.

이 snapshot에는 당시 seed 예시와 수집 데이터가 함께 들어 있다. `summaryKo`라는 필드 이름도 모든 값이 한국어이거나 실제 모델이 만든 검증된 요약임을 보장하지 않는다. 파일의 첫 기사에는 영어 요약이 저장돼 있다. 현재 factory는 요약이 없을 때 원문 발췌를 사용하도록 달라져 있으므로, 과거 catalog의 텍스트 조건과 현재 export 조건도 같다고 가정하면 안 된다.

## catalogId는 필요하지만 자동 일치 보증은 아니다

같은 기사 ID를 쓰더라도 제목·본문·요약·주제가 바뀌면 검색 결과가 달라질 수 있다. 적어도 라벨의 `catalogId`, 기사 개수와 ID 집합이 새 catalog와 맞는지 확인해야 한다. 실행할 검색 projection도 그 대상에 맞춰야 한다.

다만 지금 구현이 그 조건을 모두 자동으로 막는 것은 아니다. [labels.mjs](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/scripts/retrieval-benchmark/labels.mjs)는 라벨 JSON의 기본 형태와 상태를 검사한다. `reviewed` 질문만 평가에 넣으며, 질문마다 `strong` 또는 `acceptable` 기사가 적어도 하나 있어야 한다. 그러나 실제 catalog 파일을 읽어서 모든 라벨 ID의 존재 여부를 대조하지는 않는다. 최소 reviewed 질문 수도 하나이므로, 확장 설계에서 요구한 최소 10개와는 다르다.

라벨링 화면도 완전한 차단 장치로 설명하면 안 된다. [labeling.html](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/search-evaluation/labeling.html)은 다른 `catalogId`의 라벨을 가져오면 알림을 띄우고 검색어를 가져오는 흐름을 가진다. export 전 catalog 밖 라벨 ID를 경고하지만, 파일명만 보고 일치한다고 판단할 수는 없다.

따라서 다음 조건은 **확장 평가의 실행 전 절차**로 남는다.

1. 새 catalog의 식별자, 개수, 중복 ID와 필수 필드를 확인한다.
2. 새 catalog를 기준으로 질문 10–15개를 만들고 관련도를 검토한다.
3. 저장한 JSON의 실제 상태가 `reviewed`인지 확인한다. 한국어 화면 표시인 ‘검토 완료’와 저장값을 혼동하지 않는다.
4. 라벨의 catalog ID·개수·기사 ID를 대조하고, 검색 projection의 대상과 텍스트 조건도 확인한다.
5. 최소 10개 reviewed 질문 등 설계 조건을 만족한 뒤 새 결과 경로로 실행한다.

기사 20개 이상이나 질문 10개는 이 프로젝트의 다음 단계를 정하려고 둔 기준이다. 이 숫자를 넘었다고 통계적으로 충분한 평가가 되지는 않는다. 질문 종류와 정답 판단의 일관성뿐 아니라 아직 판정하지 않은 후보와 실패율도 함께 봐야 한다.

## 검증

2026-11-03 배치에서 backend 344개 테스트·check와 Node 평가 도구 fixture 81개가 통과했다. 아래의 과거 export와 확장 실험을 다시 실행한 결과는 아니다.

아래 결과는 [2026-06-05 개발 로그](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-05-dev-log.md)에 기록된 당시 관측이다. 이번 글 작성에서는 Codex가 코드·파일·로그를 대조하고 초안과 문장을 검토했으며, DB export나 benchmark를 다시 실행하지 않았다.

| 당시 확인 | 기록된 결과 |
| --- | --- |
| `./gradlew test --tests 'com.sigak.search.evaluation.catalog.*'` | `BUILD SUCCESSFUL` |
| PostgreSQL readiness | `accepting connections` |
| 별도 이름으로 catalog export | `catalogId=api-ready-2026-06-05`, 기사 41개 |
| JSON 필수 필드·중복 ID 검증 | 기사 41개, 첫 ID 3·마지막 ID 16 |
| 기존 catalog·라벨 확인 | 기사 6개, reviewed 질문 3개, 명시적 판정 12개 유지 |
| 기존 retrieval·graph `latest/` 변경 확인 | 변경 경로 없음 |
| 확장 라벨 파일 확인 | 당시 파일 없음 |

첫 ID 3과 마지막 ID 16은 export 순서의 관측일 뿐 ID 최솟값·최댓값이 아니다. [기존 라벨 파일](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/experiments/datasets/labels/search-labels.api-ready-2026-06-02.2026-06-02.json)을 보면 기사 수, reviewed 질문 수와 각 판정이 별도로 저장된 것을 확인할 수 있다.

완료한 범위는 새 평가 대상 목록을 만들고 기존 자료를 보존한 것까지다. 확장 catalog의 브라우저 import 확인, 새 reviewed 라벨과 확장 retrieval·graph 평가, 검색 대상과 snapshot을 자동으로 맞추는 검사는 이 글에서 검증한 결과가 없다. 현재 상태 문서도 더 큰 라벨 집합을 후속 과제로 남긴다.

또한 여기서 말한 6개·41개는 6월에 고정한 평가 파일의 기사 수다. 현재 홈의 활성 출처 필터와 데모 제외 정책을 적용한 실시간 목록 수를 뜻하지 않는다. 운영 데이터가 늘거나 노출 정책이 바뀌어도 과거 평가 파일이 저절로 갱신되지는 않는다.

## 다음 사람이 이어받으려면

새 catalog를 남기는 것만으로 재현이 끝나지는 않는다. 라벨 파일, 검색 대상의 snapshot, 텍스트 구성과 모델 조건, 결과 파일이 함께 연결돼야 한다. 현재 남은 가장 큰 일은 기사 수를 더 세는 것보다 새 질문과 정답 후보를 검토하고 그 실행 조건을 고정하는 일이다.

- 기사 수를 늘렸는데 기존 질문 점수가 낮아지면 모델 저하와 더 어려운 후보 집합을 어떻게 구분할 것인가?
- `reviewed`로 저장됐다는 사실과 판정 기준이 일관되다는 사실을 어떻게 따로 확인할 것인가?
- catalog ID가 같아도 내용이 바뀌는 문제를 막으려면 어떤 해시나 snapshot 정보가 더 필요한가?
- 기존 결과를 덮어쓰지 않고 비교 가능하게 보관하는 데 꼭 필요한 파일은 무엇인가?
