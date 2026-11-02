---
title: "Neo4j를 다시 만들 수 있게 두고 기사 원본은 PostgreSQL에 남긴 이유"
date: "2026-11-03"
type: "architecture"
project: "sigak"
tags: ["Database", "PostgreSQL", "Architecture", "Backend", "Search"]
summary: "기사 관계를 Neo4j에 투영하되 PostgreSQL을 원본으로 유지했습니다. 관계 문서를 읽는 경계, 전체 재구축의 비용, 그래프 장애가 상세 본문을 막지 않는 API 설계와 검증 한계를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-11-03-postgres-neo4j-projection.md"
sourceRepository: "https://github.com/yh4752/sigak"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-11-03-strict-hybrid-public-search-evaluation"]
---

# Neo4j를 다시 만들 수 있게 두고 기사 원본은 PostgreSQL에 남긴 이유

> 기사와 관계의 원본은 PostgreSQL이 맡는다. Neo4j는 그 관계를 조회하기 위한 사본으로 만들고, 조회 실패는 상세 화면의 보조 정보에서 처리한다.

## 관련 기사 ID만으로는 관계를 설명하기 어렵다

Sigak은 기술 글을 모아 검색과 요약을 제공하는 서비스다. 기사 상세에는 관련 글 목록도 있다. 관련 글의 ID와 제목을 보여 주면 이동은 가능하지만, 두 글이 어떤 주제를 공유하는지와 왜 연결됐는지는 알기 어렵다.

PostgreSQL에는 이미 기사, 주제, 기사 간 관계와 이유를 저장하는 구조가 있었다. Neo4j 도입의 첫 범위는 이 데이터를 그래프 형태로 조회해 상세 화면을 보강하는 일이었다. 새 관계를 LLM으로 추출하거나 그래프를 따라 답변을 생성하는 기능까지 포함하지 않았다. [당시 설계 문서](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-03-neo4j-graph-projection-design.md)에 이 경계가 명시돼 있다.

여기서 먼저 정해야 할 것은 저장소의 책임이었다. 기사 제목이 바뀌거나 관계 이유를 수정했을 때 어느 쪽이 원본인지 모호해지면, 그래프 조회보다 동기화 문제가 더 커진다. Sigak은 Elasticsearch와 Qdrant에 적용한 원칙을 Neo4j에도 유지했다. 원본은 PostgreSQL 하나이고, 나머지 저장소는 원본에서 다시 만드는 projection이다.

## 그래프 기능을 한 번에 넓히지 않았다

설계에서는 다음 접근을 비교했다.

| 접근 | 확인할 수 있는 것 | 함께 늘어나는 부담 |
| --- | --- | --- |
| 저장된 관계를 투영하고 내부 API로 조회 | 그래프 구조, 관계 이유, 재구축 결과 | 사본의 갱신 시점과 조회 실패 처리 |
| projection과 공개 상세를 함께 구현 | 사용자 화면에서 관계를 바로 확인 | 저장·조회·공개 DTO·화면과 장애 처리를 한꺼번에 검증 |
| 그래프 평가부터 설계 | 연구 지표와 바로 연결 | projection이 없어 입력과 실패 원인을 분리하기 어려움 |

첫 구현은 첫 번째 접근을 택했다. 내부 API에서 노드·관계 수와 문맥 조회를 확인한 뒤 공개 상세 화면에 연결했다. 이렇게 하면 저장된 관계가 조회되지 않는 문제와 관계 자체가 부정확한 문제를 나눠 볼 수 있다. 다만 Neo4j가 PostgreSQL의 관계 조회보다 빠르거나 더 유용하다는 비교 실험을 수행한 것은 아니다. 먼저 저장·조회 흐름을 확인하고 원본의 책임을 한곳에 두려는 선택이었다.

## 원본에서 그래프 문서로 바꾸는 경계를 만들었다

흐름은 다음과 같다.

```txt
PostgreSQL: 기사 / 주제 / 관계와 이유
  → ArticleGraphProjectionReader
  → 그래프 전용 문서
  → Neo4j: Article / Topic / HAS_TOPIC / RELATED_TO
  → 내부 문맥 조회 → 공개 graph-context 응답
```

일반 기사 응답 DTO를 그대로 재사용하지 않았다. 화면용 `ArticleResponse`에는 관련 기사 ID는 있어도 관계 이유와 관계 유형은 없다. 그래프 재구축에는 그 정보가 필요하므로 전용 reader가 엔티티의 연관 데이터를 읽고 작은 문서로 바꾼다.

[ArticleGraphProjectionReader](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/search/graph/ArticleGraphProjectionReader.kt)는 공개 가능한 기사를 읽은 뒤 그 ID 집합을 만든다. 관계의 도착점도 이 집합에 속할 때만 문서에 넣는다.

```kotlin
if (targetArticleId !in apiReadyArticleIds) {
    null
} else {
    ArticleGraphRelationDocument(
        sourceArticleId = articleId,
        targetArticleId = targetArticleId,
        relationType = relation.relationType.name,
        reason = relation.reason
    )
}
```

관계가 원본에 존재한다는 이유만으로 비공개 대상을 그래프에 끌어오지 않도록 한 조건이다. 주제는 앞뒤 공백을 없애고 소문자로 바꾼 이름을 식별자로 사용한다. 표시 이름과 순서는 별도로 보존한다. 따라서 `Graph RAG`와 `graph rag`는 합쳐지지만 `Graph RAG`와 `knowledge graph`는 같은 주제로 합쳐지지 않는다. 동의어와 한영 표현을 묶는 작업은 이 정규화가 보장하지 않는다.

Neo4j에는 제목·출처 같은 기사 메타데이터와 주제·관계 이유를 저장한다. 원문 본문, 요약 전문, 임베딩 벡터는 그래프 문서에 넣지 않는다. 기사 자체를 보여 주는 데이터는 PostgreSQL 경계에서 읽고, 그래프는 연결 문맥을 보강한다.

## 전체 재구축은 복구를 단순하게 하고 비용을 남긴다

[Neo4j 인덱서](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/search/graph/Neo4jArticleGraphProjectionIndexer.kt)는 기사 ID와 정규화된 주제 이름에 고유 제약을 만든다. 이후 하나의 Neo4j 쓰기 트랜잭션에서 기존 `Article`·`Topic` 노드를 지우고 기사, 주제, 관계를 다시 쓴다.

개별 변경 이벤트를 빠짐없이 재생하지 않아도 현재 원본으로 사본 전체를 복구하는 방식이다. 관계 스키마나 주제 정규화가 바뀌었을 때도 같은 경로를 쓴다. 기사 수가 커지면 전체 재구축 비용도 증가한다. 현재 구현은 문서와 관계를 순회하며 쿼리를 보내므로 대규모 적재 성능을 입증한 구조로 해석하면 안 된다.

삭제 범위에도 전제가 있다. Cypher는 `Article` 또는 `Topic` 라벨을 가진 노드를 지운다. 지금처럼 Sigak projection 전용 데이터베이스를 사용한다는 조건에서는 단순하지만, 다른 서비스의 그래프를 함께 넣으려면 별도 namespace나 삭제 범위가 필요하다.

또한 이 트랜잭션은 Neo4j 안의 재구축 범위에 해당한다. PostgreSQL 쓰기와 Neo4j 갱신을 하나의 분산 트랜잭션으로 묶지는 않는다. 원본을 저장한 뒤 사본을 갱신하는 동안에는 서로 다른 시점의 데이터를 볼 가능성이 남는다. 재구축 응답의 `rebuiltAt`, 상태, 개수는 그 과정을 확인하는 정보이지 실시간 일치를 보장하는 장치가 아니다. [재구축 서비스](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/search/graph/ArticleGraphProjectionRebuildService.kt)는 실패를 응답에 기록하며 PostgreSQL 원본을 수정하지 않는다.

## 상세 본문과 그래프 문맥의 실패 범위를 나눴다

공개 화면에 붙일 때는 기존 기사 응답에 그래프 필드를 추가하는 방법도 있었다. 하지만 `ArticleResponse`는 목록·검색·상세·관련 기사 일괄 조회가 공유한다. 상세 화면의 보조 정보 때문에 모든 사용처의 계약과 조회 비용을 늘리는 대신, 별도 API를 만들었다.

```http
GET /api/articles/{id}
GET /api/articles/{id}/graph-context
```

별도 요청은 화면에서 관련 기사와 관계 이유를 ID로 합치는 작업을 남긴다. 대신 그래프 응답이 늦거나 비어 있어도 본문을 독립적으로 보여 준다. 프런트엔드는 내부 진단 API를 직접 호출하지 않는다. 공개 응답에는 관계 이유와 공유 주제가 담기고 내부 조회 시간과 관계 유형은 빠진다. [공개 상세 설계의 대안 비교](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/superpowers/specs/2026-06-03-public-graph-aware-article-detail-design.md)를 보면 요청 수 증가와 응답 계약 보존의 교환을 확인할 수 있다.

[ArticlePublicGraphContextService](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/article/service/ArticlePublicGraphContextService.kt)는 PostgreSQL에서 공개 가능한 기사인지 먼저 확인한다. 기사가 없으면 `404`를 반환한다. 기사는 있는데 그래프 노드가 없거나 그래프 조회에 런타임 오류가 생기면 빈 문맥을 반환한다.

```json
{"articleId":4,"relatedArticleReasons":[],"topics":[]}
```

본문을 계속 보여 줄 수 있지만 공개 응답만 보면 관계가 없는지 조회가 실패했는지 구분하기 어렵다. 운영 진단과 설명 품질 평가는 별도 근거가 필요하다. 저장된 `reason`이 화면에 나왔다는 사실도 그 문장이 사실에 맞는다고 보장하지 않는다.

## 검증

2026-11-03 배치에서 backend 344개 테스트와 check, 검색·그래프 도구의 Node fixture 81개가 통과했다. 가짜 의존성과 테스트 DB의 계약 검사이며, 운영 Neo4j 재구축이나 장애·복구를 새로 실행한 결과가 아니다.

아래는 [2026-06-03 개발 로그](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/docs/blog/2026-06-03-dev-log.md)에 기록된 당시 결과다. 이 표의 수치는 과거 기록에서 가져왔으며 현재 코드의 재검증과 구분한다.

| 당시 확인 | 기록된 결과와 해석 범위 |
| --- | --- |
| backend 검사 | 그래프 focused와 전체 test/check 성공, 경계와 회귀 확인 |
| 재구축과 개수 대조 | 기사 26·주제 18·HAS_TOPIC 36·RELATED_TO 10, 응답과 저장 개수 일치 |
| 기사 4의 내부 문맥 | 관련 기사 1·5와 저장된 이유, 문맥 조회 확인 |
| 공개 문맥 | 관계 이유 반환·내부 timings 제외, 공개 응답 범위 확인 |
| 기사 999·0 | 각각 404·400, 존재 여부와 ID 검증 |
| Neo4j 중단 | 빈 문맥 반환, 장애 시 보조 정보 축소 |
| frontend 검사 | 6개 파일·33개 테스트와 lint/build 통과, 당시 화면 회귀 확인 |

당시 backend에서 실행한 명령은 다음과 같다. 이번 배치의 전체 검사와 시점을 구분한다.

```bash
./gradlew test --tests 'com.sigak.search.graph.*'
./gradlew test
./gradlew check
```

수동 갱신은 **2026-06-03 첫 구현의 정책**이었다. 이후 수집 자동화는 새 저장이 있거나 projection 복구가 필요할 때 Elasticsearch·Qdrant·Neo4j를 갱신하도록 확장됐다. 현재 동작은 [CollectionAutomationService](https://github.com/yh4752/sigak/blob/2b80dd22af9afef0c9fcc167a1e65044cb10f392/backend/src/main/kotlin/com/sigak/collection/service/CollectionAutomationService.kt)에서 확인할 수 있다. 초기의 수동 정책을 현재 운영 정책으로 설명하지는 않는다.

작성 과정에서는 Codex로 설계 문서, 현재 코드와 과거 검증 기록을 대조하고 초안과 문장을 검토했다. 이번 작성에서 실제 Neo4j 장애·복구, 동시 갱신, 대규모 재구축은 미검증이다. 관계 이유의 사람 검토나 사용자에게 주는 효과 역시 위 smoke로 입증되지 않았다.

## 다시 설명해 볼 질문

원본과 사본을 나눴다는 말은 저장소 이름보다 복구 경로로 설명하는 편이 분명하다. Neo4j를 비워도 PostgreSQL의 기사와 관계로 재구축할 수 있어야 하고, 사본의 오류가 원본의 손실로 번지지 않아야 한다. 다음 질문은 그 경계를 점검하는 데 쓸 수 있다.

- 관계의 도착점도 공개 가능한지 확인하지 않으면 어떤 정보가 새어 나갈 수 있는가?
- 전체 재구축 비용이 커졌을 때 증분 갱신으로 옮길 기준은 무엇인가?
- 공개 API가 빈 문맥을 돌려줄 때 정상적인 관계 부재와 장애를 어디서 구분할 것인가?
- 이유 문자열의 존재와 이유의 정확성을 각각 어떻게 검증할 것인가?
