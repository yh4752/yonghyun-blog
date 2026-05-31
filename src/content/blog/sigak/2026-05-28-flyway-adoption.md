---
title: "Flyway 도입기: 스키마를 코드처럼 리뷰하고 검증하기"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Backend", "PostgreSQL", "Flyway", "Testing"]
summary: "Hibernate automatic DDL 대신 Flyway migration과 JPA validate를 선택해 schema 변경을 리뷰 가능하고 재현 가능하게 만든 이유를 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-flyway-adoption.md"
relatedPosts: ["sigak/2026-05-07-dev-log"]
---

# Flyway 도입기: 스키마를 코드처럼 리뷰하고 검증하기

## 요약

Sigak은 기사 수집, AI enrichment, 검색 projection, Graph RAG 실험을 모두 담아야 하는 뉴스 인사이트 플랫폼이다. 이 구조에서 데이터베이스는 단순 저장소가 아니라 제품의 핵심 설계가 드러나는 경계다.

초기에는 in-memory mock data만으로 article API를 빠르게 만들 수 있었다. 하지만 PostgreSQL persistence로 넘어가는 순간부터는 schema 변경을 어떻게 기록하고, 리뷰하고, 테스트할 것인지가 중요해졌다. 그래서 Sigak은 Hibernate automatic DDL에 의존하지 않고 Flyway를 도입했다.

```txt
SQL migration
-> Flyway schema history
-> PostgreSQL
-> JPA ddl-auto validate
-> API / search projection / graph projection
```

핵심 목표는 편의성보다 재현성이다. 로컬 개발, 테스트, 이후 배포 환경에서 같은 migration history를 기준으로 DB를 만들 수 있어야 한다.

## 문제 정의

Sigak의 persistence MVP는 다음 데이터를 다룬다.

- 뉴스 출처
- 기사 metadata
- 수집된 원문
- AI 요약과 why-it-matters
- 기사별 topic
- 기사 간 관계

이 데이터는 단순 CRUD 구조가 아니다. 특히 `article_relations`는 향후 Neo4j graph projection의 edge 후보이고, `article_enrichments`는 모델과 prompt version이 바뀔 때 다시 생성될 수 있는 AI 산출물 이력이다.

따라서 schema는 "JPA entity에서 자동 생성되는 결과물"로만 두기 어렵다. 어떤 제약을 걸었는지, 왜 테이블을 분리했는지, 어떤 index를 만들었는지가 코드 리뷰 대상이 되어야 했다.

## Flyway가 없었다면 어떤 일이 생길까?

Flyway를 쓰지 않는 상황을 가정해 보면 도입 이유가 더 선명해진다.

예를 들어 MVP 초반에는 다음처럼 Hibernate가 DB schema를 자동으로 맞추게 둘 수 있다.

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: update
```

처음에는 편하다. `ArticleEntity`에 필드를 추가하면 로컬 DB도 어느 정도 따라온다. 하지만 협업이나 배포에 가까워질수록 다음 문제가 생긴다.

```txt
개발자 A: local DB에 Hibernate update로 importance_score 컬럼이 생김
개발자 B: 기존 volume을 쓰고 있어 column 상태가 다름
테스트 DB: 새로 생성되면서 다른 순서로 schema 반영
데모 서버: 어떤 DDL이 적용되어야 하는지 별도 문서가 없음
```

이 상태에서 API가 `importance_score`를 읽기 시작하면, 한 환경에서는 정상 동작하고 다른 환경에서는 다음과 같은 오류가 날 수 있다.

```txt
column "importance_score" does not exist
```

더 위험한 경우는 제약 조건이다. 예를 들어 `article_relations`에는 자기 자신을 관련 기사로 연결하지 못하게 하는 제약이 필요하다.

```sql
check (source_article_id <> target_article_id)
```

이 규칙이 명시적인 migration에 없다면, 누군가는 애플리케이션 코드에서만 막고 있다고 생각할 수 있고, 누군가는 수동 SQL로 데이터를 넣다가 잘못된 관계를 만들 수 있다. 검색이나 Graph RAG projection은 이런 잘못된 관계를 그대로 가져가므로 문제가 더 늦게 드러난다.

Flyway를 쓰면 같은 변경이 다음처럼 남는다.

```txt
V1__create_persistence_schema.sql
V2__seed_article_data.sql
V3__add_article_embedding_status.sql
```

즉, "현재 DB가 어떻게 생겼는가"뿐 아니라 "어떤 순서로 여기까지 왔는가"가 코드로 남는다.

## 선택한 방식

Sigak은 Flyway SQL migration을 schema의 기준으로 삼고, Hibernate는 schema를 생성하지 않고 검증만 하도록 설정했다.

```yaml
spring:
  flyway:
    enabled: true
  jpa:
    hibernate:
      ddl-auto: validate
```

첫 schema migration은 `V1__create_persistence_schema.sql`이다. 이 migration은 다음 테이블과 제약을 명시한다.

- `news_sources`
- `articles`
- `article_raw_contents`
- `article_enrichments`
- `article_topics`
- `article_relations`
- current enrichment를 하나로 제한하는 partial unique index
- article 발행일, 중요도, topic, relation 탐색을 위한 index

Seed data는 `V2__seed_article_data.sql`로 분리했다. 구조 생성과 초기 데이터 삽입을 같은 migration에 섞지 않기 위해서다.

## 왜 Hibernate automatic DDL을 쓰지 않았나?

Hibernate의 `ddl-auto=create`나 `update`는 빠른 프로토타입에는 편하다. Entity를 고치면 DB가 따라오므로 초반 속도가 빠르다.

하지만 Sigak에서는 다음 이유로 적합하지 않았다.

첫째, schema 변경 이력이 코드 리뷰에 잘 드러나지 않는다. Entity diff만 보고 실제 DB에 어떤 DDL이 적용될지 추론해야 한다.

둘째, 운영 또는 데모 환경에서 재현성이 약해진다. "현재 Entity 기준으로 만들어진 DB"는 만들 수 있지만, "어떤 순서로 schema가 진화했는가"를 남기기 어렵다.

셋째, 데이터 모델링 의도가 흐려진다. 예를 들어 `article_raw_contents.article_id`의 unique 제약은 기사 하나에 원문 하나만 둔다는 제품 규칙이다. `article_relations`의 `source_article_id <> target_article_id` check constraint는 자기 자신을 관련 기사로 연결하지 않는다는 도메인 규칙이다. 이런 규칙은 SQL migration에 직접 드러나는 편이 더 좋다.

그래서 Sigak에서는 Hibernate를 schema 생성자가 아니라 검증자로 사용한다.

## 구현 포인트

### 1. Schema와 seed migration 분리

`V1__create_persistence_schema.sql`은 테이블, foreign key, check constraint, unique constraint, index를 만든다.

`V2__seed_article_data.sql`은 로컬 개발과 테스트에서 사용할 curated seed article을 넣는다.

이렇게 분리하면 schema 변경과 데이터 변경의 책임이 명확해진다. 나중에 seed data를 바꾸더라도 첫 schema migration의 의미가 흔들리지 않는다.

### 2. PostgreSQL 기준 통합 테스트

Sigak은 persistence smoke test에서 Testcontainers 기반 PostgreSQL을 사용한다.

```kotlin
private val postgres = PostgreSQLContainer("postgres:16-alpine").apply {
    withDatabaseName("sigak_test")
    withUsername("sigak")
    withPassword("sigak")
    start()
}
```

테스트에서는 Flyway가 schema와 seed data를 만들고, 기대 row count가 들어왔는지 확인한다.

```kotlin
assertEquals(5, articleCount)
assertEquals(5, sourceCount)
assertEquals(5, currentEnrichmentCount)
```

이 테스트의 목적은 business logic을 자세히 검증하는 것이 아니다. 애플리케이션이 실제 PostgreSQL 위에서 migration을 적용할 수 있는지, 그리고 최소 seed data가 API 개발에 필요한 상태로 들어오는지 확인하는 smoke test다.

### 3. JPA validation으로 entity drift 감지

Flyway migration이 schema의 기준이 되면, JPA entity와 DB schema가 어긋날 수 있다. 그래서 Hibernate `ddl-auto`는 `validate`로 둔다.

이 설정은 애플리케이션 시작 시점에 entity mapping과 실제 schema가 맞는지 확인한다. schema를 자동으로 고쳐주지는 않지만, mismatch를 빨리 드러낸다. 이 점이 중요하다. 자동 수정은 편하지만, portfolio-grade 프로젝트에서는 의도하지 않은 schema 변경을 숨길 수 있다.

## 검증

도입이 단순 설정 변경에 그치지 않도록 두 가지 관점에서 확인했다.

첫째, Testcontainers 기반 PostgreSQL에서 Flyway migration이 처음부터 적용되는지 확인했다. 이 검증은 로컬 개발자의 DB 상태가 아니라 repository에 남아 있는 migration history만으로 schema와 seed data를 재현할 수 있는지 보는 절차다.

둘째, 애플리케이션 시작 시 Hibernate `ddl-auto=validate`가 migration으로 만들어진 schema와 JPA entity mapping의 drift를 감지하는지 확인했다. 이 조합 덕분에 schema 변경은 SQL migration으로 리뷰하고, entity와 schema가 어긋나는 문제는 실행 초기에 발견할 수 있다.

## 트레이드오프

Flyway를 쓰면 초반 개발 속도는 약간 느려진다. Entity에 필드를 하나 추가할 때도 migration을 함께 작성해야 한다. 반면 얻는 것은 명확하다.

- schema 변경이 Git diff에 남는다.
- DB 제약과 index가 리뷰 가능해진다.
- 로컬, 테스트, 배포 환경의 초기화 경로가 같아진다.
- PostgreSQL-specific behavior를 H2 같은 대체 DB로 감추지 않는다.

Sigak의 현재 단계에서는 이 비용을 감수할 만하다. 이 프로젝트의 목표가 단순 화면 구현이 아니라, 검색/RAG로 확장 가능한 데이터 기반을 보여주는 것이기 때문이다.

## 사용 전후 비교

Flyway를 쓰지 않는 방식은 빠르게 시작할 수 있지만, 시간이 지나면 DB 상태가 사람의 기억에 의존하게 된다.

```txt
Flyway 없이 진행
1. Entity 수정
2. 로컬 DB는 Hibernate update나 수동 SQL로 변경
3. 다른 환경에도 같은 변경이 적용됐는지 직접 확인
4. 문제가 나면 DB 상태를 먼저 의심
```

Flyway를 사용하면 변경의 기준점이 migration file로 이동한다.

```txt
Flyway 사용
1. Entity 수정
2. migration SQL 작성
3. 테스트 PostgreSQL에 migration 적용
4. JPA validate로 entity-schema mismatch 확인
5. 같은 migration history를 로컬/테스트/배포 환경에서 사용
```

두 방식의 차이는 코드가 많아졌는지가 아니다. 실패했을 때 원인을 추적할 수 있는지가 다르다. Flyway를 사용하면 "내 DB에는 있는데 네 DB에는 없는 컬럼" 같은 문제를 migration history 기준으로 정리할 수 있다.

## 운영 관점에서 얻은 것

Flyway 도입으로 "DB를 어떻게 만들었는가"를 설명할 수 있게 됐다.

이는 이후 작업과도 연결된다. Elasticsearch index rebuild, Qdrant vector projection, Neo4j graph projection은 모두 PostgreSQL source of truth에서 파생된다. source of truth의 schema가 명시적으로 관리되지 않으면 projection store의 품질도 설명하기 어렵다.

즉, Flyway는 단순 migration 도구가 아니라 검색/RAG 시스템의 기반 데이터를 안정적으로 관리하는 장치다.

## 앞으로의 개선

현재 migration은 MVP에 필요한 초기 구조와 seed data를 제공한다. 다음 단계에서는 다음 개선을 고려할 수 있다.

- article 수 증가에 따른 추가 index 검토
- enrichment versioning 정책 강화
- relation type 확대 시 migration 전략 정리
- 운영 배포 전 migration rollback 또는 repair 절차 문서화
- seed data와 demo data의 경계 분리

Flyway를 먼저 도입해 둔 덕분에 이런 변화는 ad hoc SQL이 아니라 migration history로 관리할 수 있다.
