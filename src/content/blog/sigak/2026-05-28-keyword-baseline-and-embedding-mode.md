---
title: "Qdrant 전에 Keyword Baseline과 Embedding Mode를 분리한 이유"
date: "2026-05-28"
type: "deep-dive"
project: "sigak"
tags: ["Search", "Qdrant", "Vector Search", "RAG"]
summary: "Vector search를 바로 붙이기 전에 keyword baseline과 embedding mode를 분리해 검색 품질, wiring 검증, 실제 의미 검색 주장을 나눠서 다룬 이유를 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-28-keyword-baseline-and-embedding-mode.md"
relatedPosts: ["sigak/2026-05-28-postgres-source-of-truth-elasticsearch-projection", "sigak/2026-05-29-qdrant-vector-projection-internal-api"]
---

# Qdrant 전에 Keyword Baseline과 Embedding Mode를 분리한 이유

> 한 줄 요약: Sigak은 vector search를 붙이기 전에 keyword search baseline을 먼저 두고, embedding도 deterministic test mode와 local multilingual model mode를 분리했다. 그래야 "검색이 좋아졌다"는 주장과 "projection wiring이 연결됐다"는 검증을 섞지 않을 수 있었다.

## 배경과 문제

Qdrant를 붙이면 semantic search가 생긴 것처럼 보이기 쉽다. 하지만 vector DB를 연결했다는 사실만으로 검색 품질이 좋아졌다고 말할 수는 없다.

검색 품질을 비교하려면 최소한 세 가지가 분리되어야 한다.

- 기존 keyword search가 어떤 결과를 내는가
- embedding provider가 실제 의미를 담는 model인가, 테스트용 deterministic vector인가
- Qdrant projection과 Spring Boot/FastAPI HTTP 계약이 제대로 연결됐는가

이 셋을 한 번에 구현하면 실패 원인이 흐려진다. 검색 결과가 이상할 때 keyword baseline이 약한 것인지, embedding model이 부적절한 것인지, Qdrant schema나 vector dimension이 틀어진 것인지 구분하기 어렵다.

## 선택지와 결정

| 선택지 | 장점 | 한계 |
| --- | --- | --- |
| Qdrant와 실제 embedding model을 바로 public search에 연결 | 데모 효과가 빠름 | 품질, wiring, fallback 문제가 한꺼번에 섞임 |
| deterministic embedding만으로 vector path를 끝까지 구현 | 재현성이 좋고 외부 비용이 없음 | 의미 검색 품질을 주장할 수 없음 |
| keyword baseline을 먼저 두고 embedding mode를 분리 | 비교 기준과 wiring 검증을 나눌 수 있음 | 단계가 늘어나고 글로 설명해야 할 맥락이 생김 |

Sigak은 세 번째를 선택했다.

```txt
Keyword search baseline
-> FastAPI embedding provider boundary
-> deterministic mode for tests and wiring
-> local multilingual model mode for real retrieval path
-> Qdrant projection and hybrid search
```

## 구현 관점

FastAPI 쪽은 embedding provider를 설정으로 바꿀 수 있게 했다.

- `deterministic`: 유료 API나 무거운 model 없이 같은 text에 항상 같은 vector를 만든다.
- `local`: FastEmbed 기반 multilingual model을 사용한다.

현재 구현 파일 기준으로 local provider는 `local_fastembed_embedding_service.py`에 있다. 초기 메모에는 sentence-transformer 계열 이름이 남아 있었지만, 실제 구현은 FastEmbed 기반이다. FastEmbed를 고른 이유는 local 실행에서 PyTorch/CUDA 의존성을 줄이고 ONNX Runtime 기반으로 embedding path를 확인하기 좋기 때문이다.

Spring Boot 쪽에서는 `FastApiEmbeddingClient`가 FastAPI embedding response를 내부 타입으로 감싼다. Qdrant projection 코드는 FastAPI의 raw JSON에 직접 묶이지 않고, Spring 내부의 embedding contract만 바라본다.

이 구조의 핵심은 deterministic embedding의 역할을 명확히 제한한 것이다.

```txt
deterministic embedding = wiring, test, fallback-friendly local check
local multilingual embedding = 실제 의미 검색 baseline 후보
```

Deterministic vector로 Qdrant upsert와 search 흐름을 검증할 수는 있다. 하지만 그 결과로 "semantic search 품질이 좋다"고 말하면 안 된다.

## 왜 Keyword Baseline이 먼저인가

Vector search의 효과를 보려면 비교 대상이 필요하다. Keyword baseline이 없으면 vector 결과가 좋아 보이는지 나빠 보이는지 판단할 기준이 없다.

예를 들어 `graph rag failure`라는 query에서 Graph RAG article이 상위에 나온다고 해도, keyword search도 이미 같은 결과를 잘 냈을 수 있다. 반대로 vector search가 다른 article을 상위에 올렸다면, 그것이 의미 확장인지 ranking noise인지 label set 없이 판단하기 어렵다.

그래서 Sigak은 검색 평가를 다음 순서로 보려고 했다.

```txt
keyword baseline
-> vector candidate
-> hybrid result
-> 사람이 만든 relevance label
-> metric 비교
```

## 트레이드오프

이 방식은 빠른 demo보다 단계를 더 요구한다. 처음부터 public API에 "semantic search"라고 붙이는 것보다 작업 단계가 많고, 설명도 길어진다.

대신 장점은 분명하다. Qdrant wiring이 성공했다는 말, 실제 embedding model을 썼다는 말, 검색 품질이 개선됐다는 말을 서로 다른 근거로 다룰 수 있다. 포트폴리오에서는 이 구분이 중요하다. 기능을 붙였다는 사실보다, 어떤 검증으로 어디까지 말할 수 있는지를 아는 것이 더 설득력 있기 때문이다.

## 검증

아래 검증 표는 당시 작업 기록에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트를 새로 재실행하지는 않았다.

| 검증 | 기록된 의미 |
| --- | --- |
| `.venv/bin/python -m pytest tests/test_embedding_router.py` | FastAPI embedding endpoint 계약 확인 |
| `.venv/bin/python -m pytest tests/test_embedding_router.py tests/test_embedding_providers.py` | provider 설정 전환과 deterministic/local provider 선택 확인 |
| `./gradlew test --tests com.sigak.ai.embedding.FastApiEmbeddingClientTest` | Spring Boot embedding client의 요청/응답 계약 확인 |

당시에는 아직 Qdrant projection/rebuild가 구현 전이었다. 따라서 이 글의 범위는 "Qdrant 이전의 검색/embedding 기준선 설계"이지, Qdrant 검색 품질 검증이 아니다.

## 내가 이해한 것

검색 기능에서 baseline은 단순한 이전 버전이 아니다. 새로운 retrieval 방식을 붙였을 때 무엇이 달라졌는지 설명하기 위한 비교 기준이다.

Embedding mode도 마찬가지다. deterministic mode는 테스트와 wiring에는 유용하지만 의미 검색 품질의 근거가 아니다. 실제 model mode와 구분해 두면, 나중에 benchmark report를 볼 때도 "시스템이 연결됐는가"와 "retrieval quality가 좋아졌는가"를 분리해서 말할 수 있다.

## 면접 질문

- Keyword search baseline 없이 vector search를 붙이면 어떤 문제가 생기나요?
- Deterministic embedding은 어디까지 검증할 수 있고, 어디부터 검증할 수 없나요?
- FastAPI embedding provider를 interface로 분리한 이유는 무엇인가요?
- 실제 embedding model을 local로 돌릴 때 재현성, 성능, 비용 trade-off는 어떻게 바뀌나요?
- Qdrant projection이 성공했다는 것과 semantic search 품질이 좋다는 것은 왜 다른 주장인가요?
