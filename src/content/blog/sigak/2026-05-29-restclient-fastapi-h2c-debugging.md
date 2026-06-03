---
title: "Spring RestClient와 FastAPI 사이의 h2c 문제를 디버깅한 기록"
date: "2026-05-29"
type: "debugging"
project: "sigak"
tags: ["Backend", "AI", "Debugging", "Testing"]
summary: "Spring Boot RestClient가 FastAPI embedding endpoint를 호출할 때 body missing 422가 발생한 원인을 h2c upgrade mismatch로 좁히고 HTTP/1.1 고정 테스트를 남긴 과정을 정리합니다."
featured: false
draft: false
canonicalProjectPath: "docs/blog/2026-05-29-restclient-fastapi-h2c-debugging.md"
relatedPosts: ["sigak/2026-05-28-keyword-baseline-and-embedding-mode", "sigak/2026-05-29-qdrant-vector-projection-internal-api"]
---

# Spring RestClient와 FastAPI 사이의 h2c 문제를 디버깅한 기록

> 한 줄 요약: FastAPI embedding endpoint는 직접 호출하면 정상인데 Spring Boot에서 호출하면 `body missing` 422가 났다. raw HTTP 요청을 확인한 뒤 Java HTTP client의 h2c upgrade 시도와 Uvicorn의 지원 범위가 맞지 않는 문제로 좁혔고, FastAPI 호출용 RestClient를 HTTP/1.1로 고정했다.

## 증상

Qdrant vector projection을 만들려면 Spring Boot가 FastAPI embedding endpoint를 호출해야 한다.

직접 FastAPI를 호출하면 요청 body가 정상적으로 들어갔다. 그런데 Spring Boot `RestClient`를 거쳐 호출하면 FastAPI는 body가 없다고 판단했고, 422 응답이 발생했다.

이 증상은 단순 JSON serialization 문제처럼 보일 수 있다.

```txt
Spring Boot -> FastAPI embedding endpoint
expected: {"text":"..."}
actual symptom: body missing 422
```

하지만 같은 endpoint를 직접 호출하면 성공했다. 그래서 문제는 FastAPI router 자체보다 Spring Boot와 Uvicorn 사이의 HTTP 경계에 있을 가능성이 높았다.

## 조사

당시 디버깅 기록에 따르면 raw HTTP 요청을 캡처했을 때 Java HTTP client가 다음과 같은 요청 특성을 보냈다.

```txt
Upgrade: h2c
Transfer-Encoding: chunked
```

h2c는 cleartext HTTP/2 upgrade다. Uvicorn은 이 upgrade 흐름을 지원하지 않는 조합이어서, 요청 body가 기대한 방식으로 처리되지 않았다.

여기서 중요한 점은 unit test만으로 잡기 어려운 mismatch였다는 것이다. Mock HTTP 테스트에서는 body serialization이 맞아 보일 수 있다. 하지만 실제 runtime에서는 client protocol 선택과 server runtime 지원 범위가 맞물린다.

## 결정

FastAPI embedding 호출용 `RestClient`를 HTTP/1.1로 고정했다.

`AiServerConfig`에는 이 의도를 주석으로 남겼다.

```kotlin
// Uvicorn은 h2c 업그레이드를 지원하지 않으므로 FastAPI 호출은 HTTP/1.1로 고정한다.
```

구현상으로는 JDK `HttpClient`를 HTTP/1.1 version으로 만들고, `JdkClientHttpRequestFactory`를 통해 `RestClient`에 연결한다.

이 결정은 "모든 RestClient를 HTTP/1.1로 바꾼다"가 아니다. FastAPI embedding boundary에서 확인된 protocol mismatch를 그 boundary의 configuration으로 제한한 것이다.

## 회귀 테스트

`FastApiEmbeddingClientTest`에는 실제 local HTTP server를 띄워 요청 header와 body를 확인하는 테스트가 있다.

핵심 확인은 두 가지다.

- `Upgrade` header가 없어야 한다.
- FastAPI에 보낼 JSON body가 실제로 전송되어야 한다.

이 테스트는 mocking만으로는 놓치기 쉬운 protocol-level regression을 막기 위한 장치다.

## 배운 점

멀티 서비스 디버깅에서는 "body를 보냈는가"라는 질문도 여러 층으로 나뉜다.

- client code가 body object를 만들었는가
- JSON serialization이 되었는가
- HTTP client가 body를 어떤 framing으로 보냈는가
- server runtime이 그 protocol/framing을 지원하는가
- framework가 body를 application request로 전달했는가

이번 문제는 중간 HTTP protocol 층에서 발생했다. 그래서 raw request capture가 중요했다.

## 검증

아래 검증 표는 당시 작업 기록과 코드에 남은 근거다. 이 글을 정리하는 과정에서 해당 테스트와 smoke check를 새로 재실행하지는 않았다.

| 검증 | 기록된 의미 |
| --- | --- |
| `./gradlew test --tests com.sigak.ai.embedding.FastApiEmbeddingClientTest.configuredAiServerClientDoesNotRequestHttp2Upgrade` | FastAPI 호출용 client가 h2c upgrade를 요청하지 않음 |
| `./gradlew test` | backend 전체 test 기록 |
| Qdrant projection rebuild smoke | 실제 FastAPI embedding model 경유로 `indexedCount=5` 기록 |

## 내가 이해한 것

HTTP client의 기본값은 보이지 않는 의사결정이다. 대부분의 경우 문제없이 동작하지만, 서버 runtime과 맞지 않으면 application code가 멀쩡해도 이상한 증상으로 나타날 수 있다.

이 문제를 해결한 핵심은 "FastAPI가 body를 못 읽는다"에서 멈추지 않고, 실제 wire-level request가 어떻게 생겼는지 확인한 점이었다.

## 면접 질문

- FastAPI를 직접 호출하면 성공하는데 Spring Boot 경유 호출만 실패했다면 어떻게 원인을 좁히겠나요?
- h2c upgrade는 무엇이고, 왜 Uvicorn과의 조합에서 문제가 될 수 있나요?
- MockRestServiceServer 같은 테스트와 실제 HTTP server 테스트의 차이는 무엇인가요?
- 왜 모든 HTTP client가 아니라 FastAPI embedding client만 HTTP/1.1로 고정했나요?
- 이런 protocol mismatch를 재발하지 않게 하려면 어떤 테스트를 남겨야 하나요?
