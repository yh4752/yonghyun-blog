---
title: "SchemaSpy 도입기: DB 구조를 자동 문서화하는 개발 환경 만들기"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Database", "SchemaSpy", "Documentation", "Infra"]
summary: "SchemaSpy를 상시 서비스가 아닌 Docker Compose tools profile의 일회성 도구로 두어 DB 구조를 재현 가능하게 문서화한 이유를 정리합니다."
featured: true
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-schemaspy-adoption.md"
relatedPosts: ["sigak/2026-05-28-dev-log", "sigak/2026-05-28-flyway-adoption"]
---

# SchemaSpy 도입기: DB 구조를 자동 문서화하는 개발 환경 만들기

## 요약

Sigak은 PostgreSQL을 source of truth로 두고, Elasticsearch, Qdrant, Neo4j를 projection store로 확장하는 구조를 지향한다. 이런 구조에서는 DB schema를 빠르게 이해하는 능력이 중요하다. 어떤 테이블이 원본이고, 어떤 관계가 graph edge가 될 수 있는지 확인할 수 있어야 검색/RAG 설계도 안정적으로 진행된다.

그래서 Sigak은 SchemaSpy를 도입해 PostgreSQL schema를 HTML ERD로 생성할 수 있게 했다.

```txt
PostgreSQL
-> SchemaSpy
-> HTML ERD
-> 개발자와 포트폴리오 독자가 함께 볼 수 있는 DB 문서
```

중요한 점은 SchemaSpy를 상시 실행 서비스로 두지 않았다는 것이다. Docker Compose의 `tools` profile에 묶어, 필요할 때만 일회성 컨테이너로 실행한다.

## 문제 정의

DB 구조를 보는 방법은 많다. DBeaver나 DataGrip 같은 GUI 도구를 쓰면 빠르게 테이블과 데이터를 확인할 수 있다. 하지만 개인 로컬 도구는 프로젝트의 일부가 아니다.

Sigak에서 필요했던 것은 다음 조건을 만족하는 방식이었다.

- 저장소를 받은 사람이 같은 방식으로 DB 문서를 만들 수 있어야 한다.
- 기본 로컬 개발 환경을 무겁게 만들면 안 된다.
- 생성된 문서가 PostgreSQL의 실제 schema를 기준으로 해야 한다.
- ERD가 포트폴리오 설명 자료로도 사용할 수 있어야 한다.

이 조건 때문에 단순히 "DBeaver를 쓰면 된다"로 끝내지 않고, 프로젝트 안에 재현 가능한 SchemaSpy workflow를 추가했다.

## SchemaSpy가 없었다면 어떤 일이 생길까?

SchemaSpy 없이도 DB 구조를 볼 수는 있다. 예를 들어 개발자는 DBeaver에서 테이블을 열어 보거나, README에 손으로 Mermaid ERD를 그릴 수 있다.

```md
articles --> article_topics
articles --> article_enrichments
articles --> article_relations
```

이 방식은 처음에는 충분해 보인다. 하지만 schema가 바뀌기 시작하면 문제가 생긴다.

```txt
V1: articles, article_topics, article_relations 생성
V2: article_enrichments에 is_current 추가
V3: current enrichment partial unique index 추가
문서: 예전 ERD 그대로 유지
```

이때 문서를 보는 사람은 `article_enrichments`가 여러 개 생길 수 있다는 사실은 알 수 있지만, `is_current = true`가 article당 하나로 제한된다는 운영 규칙은 놓칠 수 있다. 검색 API를 만들 때 현재 enrichment만 써야 하는데, 오래된 enrichment까지 같이 색인하는 버그가 생길 여지도 있다.

또 다른 예시는 graph projection 설계다. `article_relations`는 source와 target이 모두 `articles`를 참조하는 자기참조 관계 테이블이다.

```txt
articles.id
<- article_relations.source_article_id
<- article_relations.target_article_id
```

이 관계를 문서에서 놓치면 Neo4j projection을 설계할 때 `Article - RELATED_TO -> Article` 구조가 아니라 별도 relation node처럼 과하게 모델링할 수 있다. 반대로 SchemaSpy는 실제 foreign key를 기준으로 관계를 보여주므로, 이런 구조를 빠르게 확인할 수 있다.

## 선택한 방식

`infra/docker-compose.yml`에 `db-schema` 서비스를 추가했다.

```yaml
db-schema:
  image: schemaspy/schemaspy:6.2.4
  platform: linux/amd64
  profiles:
    - tools
  depends_on:
    postgres:
      condition: service_healthy
```

이 서비스는 기본 Compose 실행에는 포함되지 않는다.

```bash
docker compose -f infra/docker-compose.yml up -d
```

DB 문서가 필요할 때만 명시적으로 실행한다.

```bash
docker compose -f infra/docker-compose.yml --profile tools run --rm db-schema
```

생성 결과는 다음 경로에 저장된다.

```txt
outputs/db-schema/index.html
```

`outputs/`는 로컬 산출물이므로 Git에 커밋하지 않는다. 대신 README에 실행 방법을 남겨 누구든 다시 생성할 수 있게 했다.

## 왜 Compose profile을 사용했나?

SchemaSpy는 애플리케이션 런타임에 필요한 서비스가 아니다. PostgreSQL이나 Elasticsearch처럼 계속 떠 있어야 하는 인프라가 아니라, DB 문서를 생성할 때만 필요한 도구다.

만약 기본 Compose 실행에 포함했다면 매일 개발할 때 불필요한 컨테이너가 하나 더 생긴다. 이는 작은 비용처럼 보이지만, 로컬 개발 환경에서는 "무엇이 왜 떠 있는지"가 명확한 것이 중요하다.

Compose profile을 사용하면 서비스의 성격을 분리할 수 있다.

```txt
기본 서비스: 애플리케이션 실행에 필요
tools profile: 개발 보조 작업에만 필요
```

SchemaSpy는 후자에 속한다.

## `run --rm`을 사용한 이유

SchemaSpy 실행 명령은 다음과 같다.

```bash
docker compose -f infra/docker-compose.yml --profile tools run --rm db-schema
```

여기서 `run`은 서비스를 일회성 작업처럼 실행한다. `--rm`은 작업이 끝나면 컨테이너를 자동 삭제한다.

이 방식의 장점은 명확하다.

- SchemaSpy 컨테이너를 따로 끌 필요가 없다.
- PostgreSQL은 켜 둔 채로 문서만 다시 생성할 수 있다.
- 실행 후 `docker compose ps`에 불필요한 도구 컨테이너가 남지 않는다.

도구는 도구답게 필요할 때 나타나고 끝나면 사라지는 편이 좋다.

## 트레이드오프

### SchemaSpy가 해결하는 것

SchemaSpy는 DB 구조를 HTML 문서로 남기는 데 강하다.

- 테이블 목록
- 컬럼 정보
- foreign key 관계
- index와 constraint
- ERD 이미지
- insertion/deletion order

이 정보는 새 기능을 만들기 전 schema를 훑어볼 때 유용하다. 특히 Sigak처럼 article 중심의 관계형 모델을 graph projection으로 확장하려는 프로젝트에서는 관계를 빠르게 보는 것이 중요하다.

### SchemaSpy가 해결하지 않는 것

SchemaSpy는 실시간 DB 탐색 도구가 아니다. 데이터를 직접 수정하거나 임시 SQL을 자주 실행하려면 DBeaver, IntelliJ Database 탭, DataGrip 같은 도구가 더 편하다.

그래서 Sigak의 결론은 "SchemaSpy만 쓴다"가 아니다.

```txt
실시간 탐색: DBeaver / IntelliJ Database / DataGrip
공식 문서화: SchemaSpy
```

역할을 분리하면 도구 선택이 더 명확해진다.

## 사용 전후 비교

SchemaSpy 없이 진행하면 DB 문서화는 대체로 사람의 수동 작업이 된다.

```txt
SchemaSpy 없이 진행
1. DBeaver나 IntelliJ에서 현재 DB 확인
2. 필요한 관계를 사람이 README에 정리
3. migration이 바뀌면 문서도 직접 수정
4. 문서가 최신 schema와 같은지 매번 의심
```

이 방식은 작은 프로젝트에서는 괜찮다. 하지만 Sigak처럼 검색 projection과 graph projection이 DB 구조에 의존하는 프로젝트에서는 문서가 오래되는 순간 설계 판단도 흔들린다.

SchemaSpy를 사용하면 문서의 기준이 사람이 아니라 실제 DB schema가 된다.

```txt
SchemaSpy 사용
1. PostgreSQL 실행
2. SchemaSpy가 실제 schema introspection
3. HTML ERD 자동 생성
4. migration 변경 후 같은 명령으로 재생성
```

이 차이는 특히 온보딩이나 포트폴리오 설명에서 중요하다. "이 프로젝트의 DB 구조는 이렇다"라고 말할 때, 수동으로 그린 그림이 아니라 실행 가능한 명령으로 만든 결과물을 보여줄 수 있기 때문이다.

## Docker 초심자를 위한 문서화

SchemaSpy를 추가하면서 인프라 README에 Docker 명령어 치트시트도 함께 정리했다.

문서에는 다음 명령을 포함했다.

- `up -d`: 백그라운드 실행
- `ps`: 상태 확인
- `logs -f`: 로그 보기
- `restart`: 특정 서비스 재시작
- `stop`: 특정 서비스 중지
- `down`: 전체 인프라 중지
- `down -v`: volume까지 포함한 전체 초기화

특히 `down`과 `down -v`의 차이를 강조했다. Docker를 처음 사용할 때 가장 위험한 실수 중 하나가 volume 삭제다. `down -v`는 PostgreSQL, Elasticsearch, Qdrant, Neo4j의 로컬 데이터를 삭제할 수 있으므로 "정말 초기화할 때만" 사용해야 한다.

## 검증

다음 명령으로 Compose 설정과 SchemaSpy 실행을 확인했다.

```bash
docker compose -f infra/docker-compose.yml --profile tools config
docker compose -f infra/docker-compose.yml --profile tools run --rm db-schema
test -f outputs/db-schema/index.html
git diff --check
```

SchemaSpy 실행 결과 `outputs/db-schema/index.html`이 생성됐다. PostgreSQL 16 catalog 조회와 Graphviz label 관련 경고가 일부 출력됐지만, 명령은 exit code `0`으로 종료됐고 HTML 산출물이 생성됐다. README에는 이 경고가 치명적 실패가 아니라는 점을 남겼다.

## 앞으로의 개선

SchemaSpy 도입은 DB 문서화의 시작점이다. 다음 단계에서는 다음을 고려할 수 있다.

- README에서 ERD 생성 결과 예시 이미지 연결
- 주요 테이블 설명을 별도 문서로 보강
- Neo4j graph projection 설계와 relational schema를 함께 비교
- CI 또는 로컬 스크립트로 schema documentation 생성 명령 단순화
- migration 변경 시 ERD 재생성 체크리스트 추가

DB 구조를 문서화하는 일은 기능 개발보다 덜 화려하지만, 팀과 포트폴리오 독자가 시스템을 이해하는 속도를 크게 높인다. Sigak에서는 이 작업을 검색/RAG 확장의 기반 문서화로 본다.
